'use strict';
/**
 * WebSocket server para tempo real no CRM.
 * Clientes se inscrevem em rooms: 'inbox', 'conversation:{id}'
 * Autenticação: JWT obrigatório via ?token=...
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
    const params = new URL(req.url, 'http://x').searchParams;
    const token  = params.get('token');

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

module.exports = { init, emitInbox, emitConversation };
