'use strict';
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
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── Instâncias ────────────────────────────────────────────────────────────────
async function createInstance(instanceName, webhookUrl) {
  return request('POST', '/instance/create', {
    instanceName, qrcode: true, integration: 'WHATSAPP-BAILEYS',
    webhook: { url: webhookUrl, byEvents: false, base64: true,
      events: ['MESSAGES_UPSERT','MESSAGES_UPDATE','CONNECTION_UPDATE','QRCODE_UPDATED','CONTACTS_UPSERT'] }
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
  return request('POST', `/message/sendMedia/${n}`, { number:to, mediatype, mimetype, media, caption, fileName });
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
async function fetchContacts(n) {
  return request('GET', `/chat/findContacts/${n}`);
}
async function fetchProfilePictureUrl(n, phone) {
  return request('POST', `/chat/fetchProfilePictureUrl/${n}`, { number: phone });
}

// ── Media download ────────────────────────────────────────────────────────────
async function getBase64FromMedia(n, messageKey) {
  return request('POST', `/chat/getBase64FromMediaMessage/${n}`, { message: messageKey });
}

// ── Webhook ───────────────────────────────────────────────────────────────────
async function setWebhook(n, url) {
  return request('POST', `/webhook/set/${n}`, {
    webhook: {
      enabled: true,
      url,
      base64: true,
      byEvents: false,
      events: ['QRCODE_UPDATED','CONNECTION_UPDATE','MESSAGES_UPSERT','MESSAGES_UPDATE','CONTACTS_UPSERT']
    }
  });
}

module.exports = {
  createInstance, connectInstance, getInstanceStatus, deleteInstance,
  setWebhook, sendText, sendMedia, sendAudio, markAsRead,
  fetchContacts, fetchProfilePictureUrl, getBase64FromMedia,
};
