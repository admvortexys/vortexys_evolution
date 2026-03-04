'use strict';
/**
 * WebSocket server para tempo real no CRM.
 * Clientes se inscrevem em rooms: 'inbox', 'conversation:{id}'
 */
const { WebSocketServer, WebSocket } = require('ws');

let wss = null;
// Map: userId → Set<ws>
const clients = new Map();

function init(server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    // Token passado como ?token=...
    const params = new URL(req.url, 'http://x').searchParams;
    const userId = params.get('userId');
    if (!userId) { ws.close(1008, 'userId required'); return; }

    ws._userId = userId;
    ws._rooms  = new Set(['inbox']);

    if (!clients.has(userId)) clients.set(userId, new Set());
    clients.get(userId).add(ws);

    ws.on('message', raw => {
      try {
        const msg = JSON.parse(raw);
        if (msg.type === 'subscribe' && msg.room) ws._rooms.add(msg.room);
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
