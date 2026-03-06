'use strict';
/**
 * Cliente HTTP para a Evolution API (WhatsApp).
 * Cria instância, conecta, envia mensagens (texto, mídia). Usado por whatsapp.js.
 */
const https = require('https');
const http  = require('http');
const { URL } = require('url');

const BASE_URL = () => process.env.EVOLUTION_API_URL || 'http://evolution-api:8080';
const API_KEY  = () => process.env.EVOLUTION_API_KEY  || '';

async function request(method, path, body = null) {
  const parsed  = new URL(`${BASE_URL()}${path}`);
  const isHttps = parsed.protocol === 'https:';
  const options = {
    hostname: parsed.hostname,
    port:     parsed.port || (isHttps ? 443 : 80),
    path:     parsed.pathname + parsed.search,
    method,
    headers: { 'Content-Type':'application/json', 'apikey': API_KEY() },
  };
  return new Promise((resolve, reject) => {
    const req = (isHttps ? https : http).request(options, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Evolution API timeout (30s)')); });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── Instâncias ────────────────────────────────────────────────────────────────
async function createInstance(instanceName, webhookUrl, webhookSecret = null) {
  const webhook = {
    url: webhookUrl,
    byEvents: false,
    base64: true,
    events: ['MESSAGES_UPSERT','MESSAGES_UPDATE','CONNECTION_UPDATE','QRCODE_UPDATED','CONTACTS_UPSERT'],
  };
  if (webhookSecret) {
    webhook.headers = { 'x-webhook-secret': webhookSecret };
  }
  return request('POST', '/instance/create', {
    instanceName, qrcode: true, integration: 'WHATSAPP-BAILEYS',
    webhook,
  });
}
async function connectInstance(n)       { return request('GET',    `/instance/connect/${n}`); }
async function getInstanceStatus(n)     { return request('GET',    `/instance/connectionState/${n}`); }
async function deleteInstance(n)        { return request('DELETE', `/instance/delete/${n}`); }

// ── Mensagens ─────────────────────────────────────────────────────────────────
async function sendText(n, to, text, quotedId=null) {
  const body = { number: to, text };
  if (quotedId) body.quoted = { key: { id: quotedId } };
  return request('POST', `/message/sendText/${n}`, body);
}
async function sendMedia(n, to, { mediatype, mimetype, media, caption, fileName }) {
  const mt = (mediatype || 'image').toLowerCase();
  const fn = fileName || (mt === 'image' ? 'image.jpg' : mt === 'video' ? 'video.mp4' : 'file');
  return request('POST', `/message/sendMedia/${n}`, { number:to, mediatype: mt, mimetype: mimetype || 'image/jpeg', media, caption: caption || '', fileName: fn });
}
async function sendAudio(n, to, audioBase64) {
  return request('POST', `/message/sendWhatsAppAudio/${n}`, { number:to, audio:audioBase64, encoding:true });
}

// ── Chat / Leitura ────────────────────────────────────────────────────────────
async function markAsRead(n, phone, messageIds) {
  return request('POST', `/chat/markMessageAsRead/${n}`,
    { readMessages: messageIds.map(id => ({ remoteJid: phone, id, fromMe: false })) });
}

// ── Contatos ──────────────────────────────────────────────────────────────────
// Retorna todos os contatos da instância. Tenta POST (v2) com fallback para GET.
async function fetchContacts(n) {
  // Evolution API v2: POST /chat/findContacts retorna array de contatos
  try {
    const resp = await request('POST', `/chat/findContacts/${n}`, { where: {} });
    const list = Array.isArray(resp?.data) ? resp.data : [];
    if (list.length > 0) return { status: resp.status, data: list };
  } catch(_) {}
  // fallback GET
  return request('GET', `/chat/findContacts/${n}`);
}

async function fetchProfilePictureUrl(n, phone) {
  return request('POST', `/chat/fetchProfilePictureUrl/${n}`, { number: phone });
}

// Resolver LID → número de telefone real via Evolution API
// A Evolution API pode retornar o número real dado o JID completo
async function resolveLid(n, lidJid) {
  try {
    // Tenta via findContacts com where por id (LID JID)
    const resp = await request('POST', `/chat/findContacts/${n}`, { where: { id: lidJid } });
    const list = Array.isArray(resp?.data) ? resp.data : [];
    for (const c of list) {
      // procura remoteJid ou phone real (@s.whatsapp.net)
      const rjid = c.remoteJid || c.jid || '';
      if (rjid.endsWith('@s.whatsapp.net')) {
        return rjid.replace('@s.whatsapp.net', '').replace(/:\d+$/, '');
      }
    }
  } catch(_) {}
  return null;
}

// Busca lista de chats (conversas) para importar histórico
async function fetchChats(n) {
  try {
    const resp = await request('POST', `/chat/findChats/${n}`, { where: {} });
    const list = Array.isArray(resp?.data) ? resp.data : [];
    if (list.length > 0) return { status: resp.status, data: list };
  } catch(_) {}
  return request('GET', `/chat/findChats/${n}`);
}

// Busca mensagens de um chat específico pelo remoteJid
async function fetchMessages(n, remoteJid, limit = 50) {
  return request('POST', `/chat/findMessages/${n}`, {
    where: { key: { remoteJid } },
    limit,
  });
}

// ── Media download ────────────────────────────────────────────────────────────
async function getBase64FromMedia(n, messageKey) {
  return request('POST', `/chat/getBase64FromMediaMessage/${n}`, { message: messageKey });
}

// ── Webhook ───────────────────────────────────────────────────────────────────
async function setWebhook(n, url, webhookSecret = null) {
  const webhook = {
    enabled: true,
    url,
    base64: true,
    byEvents: false,
    events: ['QRCODE_UPDATED','CONNECTION_UPDATE','MESSAGES_UPSERT','MESSAGES_UPDATE','CONTACTS_UPSERT'],
  };
  if (webhookSecret) {
    webhook.headers = { 'x-webhook-secret': webhookSecret };
  }
  return request('POST', `/webhook/set/${n}`, { webhook });
}

module.exports = {
  createInstance, connectInstance, getInstanceStatus, deleteInstance,
  setWebhook, sendText, sendMedia, sendAudio, markAsRead,
  fetchContacts, fetchProfilePictureUrl, getBase64FromMedia,
  fetchChats, fetchMessages, resolveLid,
};
