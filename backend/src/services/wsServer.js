'use strict';
/**
 * WebSocket server para tempo real no CRM.
 * Clientes se inscrevem em rooms: 'inbox', 'conversation:{id}'.
 * Autenticacao aceita cookie access_token e mantem compatibilidade com subprotocol bearer.
 */
const { WebSocketServer, WebSocket } = require('ws');
const jwt = require('jsonwebtoken');
const db = require('../database/db');

let wss = null;
const clients = new Map();

function parseCookies(header = '') {
  return String(header)
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const idx = part.indexOf('=');
      if (idx === -1) return acc;
      const key = part.slice(0, idx).trim();
      const value = part.slice(idx + 1).trim();
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

function getAllowedOrigins() {
  return [process.env.ALLOWED_ORIGIN, process.env.APP_URL]
    .filter(Boolean)
    .map(value => {
      try {
        return new URL(value).origin;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function isAllowedOrigin(origin) {
  const allowed = getAllowedOrigins();
  if (!allowed.length) return true;
  if (!origin) return process.env.NODE_ENV !== 'production';
  return allowed.includes(origin);
}

function extractToken(req) {
  const protocolHeader = req.headers['sec-websocket-protocol'] || '';
  const parts = String(protocolHeader).split(',').map(s => s.trim()).filter(Boolean);
  const bearerIdx = parts.findIndex(p => p.toLowerCase() === 'bearer');
  if (bearerIdx !== -1 && parts[bearerIdx + 1]) {
    return parts[bearerIdx + 1];
  }
  const cookies = parseCookies(req.headers.cookie || '');
  return cookies.access_token || null;
}

function init(server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (ws, req) => {
    if (!isAllowedOrigin(req.headers.origin)) {
      ws.close(1008, 'origin not allowed');
      return;
    }

    const token = extractToken(req);
    if (!token) {
      ws.close(1008, 'token required');
      return;
    }

    let userId;
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      userId = String(payload.userId);
    } catch {
      ws.close(1008, 'invalid token');
      return;
    }

    try {
      const r = await db.query('SELECT id, role, permissions FROM users WHERE id=$1 AND active=true', [userId]);
      if (!r.rows.length) {
        ws.close(1008, 'user not found');
        return;
      }
      ws._userRole = r.rows[0].role;
      ws._userPermissions = r.rows[0].permissions || {};
    } catch {
      ws.close(1011, 'server error');
      return;
    }

    ws._userId = userId;
    ws._rooms = new Set(['inbox']);

    if (!clients.has(userId)) clients.set(userId, new Set());
    clients.get(userId).add(ws);

    ws.on('message', raw => {
      try {
        const msg = JSON.parse(raw);

        if (msg.type === 'subscribe' && msg.room) {
          if (msg.room.startsWith('conversation:')) {
            const hasCrm = ws._userRole === 'admin' || !!ws._userPermissions.crm || !!ws._userPermissions.whatsapp;
            if (!hasCrm) {
              ws.send(JSON.stringify({ type: 'error', message: 'sem permissao' }));
              return;
            }
          }
          ws._rooms.add(msg.room);
        }

        if (msg.type === 'unsubscribe' && msg.room) ws._rooms.delete(msg.room);
        if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
      } catch {
        // ignore malformed client messages
      }
    });

    ws.on('close', () => {
      clients.get(userId)?.delete(ws);
      if (clients.get(userId)?.size === 0) clients.delete(userId);
    });

    ws.send(JSON.stringify({ type: 'connected', userId }));
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

function emitInbox(payload) {
  broadcast('inbox', payload);
}

function emitConversation(conversationId, payload) {
  broadcast(`conversation:${conversationId}`, payload);
}

module.exports = { init, close, emitInbox, emitConversation };
