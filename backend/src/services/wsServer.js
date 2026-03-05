'use strict';
/**
 * WebSocket server para tempo real no CRM.
 * Clientes se inscrevem em rooms: 'inbox', 'conversation:{id}'
 * Autenticação: JWT obrigatório via Sec-WebSocket-Protocol header
 * (token NÃO vai na URL para evitar vazamento em logs/proxies)
 *
 * Cliente deve conectar com:
 *   new WebSocket(url, ['bearer', token])
 * e o servidor extrai o token do subprotocol negociado.
 */
const { WebSocketServer, WebSocket } = require('ws');
const jwt = require('jsonwebtoken');
const db  = require('../database/db');

let wss = null;
// Map: userId → Set<ws>
const clients = new Map();

function init(server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (ws, req) => {
    // ── Autenticação JWT via Sec-WebSocket-Protocol (não via ?token= na URL) ──
    // O cliente deve enviar: new WebSocket(url, ['bearer', jwtToken])
    // O navegador junta os subprotocols com vírgula no header.
    const protocolHeader = req.headers['sec-websocket-protocol'] || '';
    const parts = protocolHeader.split(',').map(s => s.trim());
    // Formato esperado: ['bearer', '<jwt>']
    const bearerIdx = parts.findIndex(p => p.toLowerCase() === 'bearer');
    const token = bearerIdx !== -1 ? parts[bearerIdx + 1] : null;

    // ── Autenticação JWT obrigatória ──
    if (!token) { ws.close(1008, 'token required'); return; }

    let userId;
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      userId = String(payload.userId);
    } catch {
      ws.close(1008, 'invalid token');
      return;
    }

    // Confirmar que o usuário ainda existe e está ativo
    try {
      const r = await db.query('SELECT id, role, permissions FROM users WHERE id=$1 AND active=true', [userId]);
      if (!r.rows.length) { ws.close(1008, 'user not found'); return; }
      ws._userRole        = r.rows[0].role;
      ws._userPermissions = r.rows[0].permissions || {};
    } catch {
      ws.close(1011, 'server error');
      return;
    }

    ws._userId = userId;
    ws._rooms  = new Set(['inbox']);

    if (!clients.has(userId)) clients.set(userId, new Set());
    clients.get(userId).add(ws);

    ws.on('message', raw => {
      try {
        const msg = JSON.parse(raw);

        if (msg.type === 'subscribe' && msg.room) {
          // Só permite assinar conversation:{id} se tiver permissão crm ou for admin
          if (msg.room.startsWith('conversation:')) {
            const hasCrm = ws._userRole === 'admin' || !!ws._userPermissions['crm'];
            if (!hasCrm) { ws.send(JSON.stringify({ type:'error', message:'sem permissão' })); return; }
          }
          ws._rooms.add(msg.room);
        }

        if (msg.type === 'unsubscribe' && msg.room) ws._rooms.delete(msg.room);
        if (msg.type === 'ping') ws.send(JSON.stringify({ type:'pong' }));
      } catch {}
    });

    ws.on('close', () => {
      clients.get(userId)?.delete(ws);
      if (clients.get(userId)?.size === 0) clients.delete(userId);
    });

    ws.send(JSON.stringify({ type:'connected', userId }));
  });

  console.log('[WS] WebSocket server iniciado em /ws');
}

function close() {
  if (wss) {
    wss.clients.forEach(ws => ws.close());
    wss.close();
    wss = null;
    clients.clear();
    console.log('[WS] WebSocket server encerrado');
  }
}

function broadcast(room, payload) {
  if (!wss) return;
  const data = JSON.stringify(payload);
  wss.clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN && ws._rooms?.has(room)) {
      ws.send(data);
    }
  });
}

// Emite para todos na inbox (lista de conversas)
function emitInbox(payload)  { broadcast('inbox', payload); }

// Emite para quem está dentro de uma conversa específica
function emitConversation(conversationId, payload) {
  broadcast(`conversation:${conversationId}`, payload);
}

module.exports = { init, close, emitInbox, emitConversation };
