'use strict';
const router   = require('express').Router();
const db       = require('../database/db');
const evo      = require('../services/evolutionApi');
const bot      = require('../services/botEngine');
const ws       = require('../services/wsServer');
const auth     = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

// ─── Helpers ───────────────────────────────────────────────────────────────────

const MAX_MEDIA_SIZE = 15 * 1024 * 1024; // 15MB
const ALLOWED_MIMETYPES = [
  'image/jpeg','image/png','image/gif','image/webp',
  'audio/ogg','audio/mpeg','audio/mp4','audio/webm','audio/aac',
  'video/mp4','video/3gpp','video/webm',
  'application/pdf','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip','text/plain','text/csv',
];

function extractContent(msg) {
  const m = msg.message || {};
  const getB64 = () => msg.message?.base64 || msg.base64 || null;
  if (m.conversation || m.extendedTextMessage)
    return { type:'text', body: m.conversation || m.extendedTextMessage?.text };
  if (m.imageMessage)
    return { type:'image', body: m.imageMessage.caption||'[imagem]',
      mediaBase64: getB64(), mimetype: m.imageMessage.mimetype };
  if (m.audioMessage || m.pttMessage)
    return { type:'audio', body:'[audio]',
      mediaBase64: getB64(), mimetype: m.audioMessage?.mimetype || m.pttMessage?.mimetype || 'audio/ogg',
      duration: m.audioMessage?.seconds || m.pttMessage?.seconds };
  if (m.videoMessage)
    return { type:'video', body: m.videoMessage.caption||'[video]',
      mediaBase64: getB64(), mimetype: m.videoMessage.mimetype,
      duration: m.videoMessage?.seconds };
  if (m.documentMessage)
    return { type:'document', body: m.documentMessage.fileName||'[documento]',
      mediaBase64: getB64(), mimetype: m.documentMessage.mimetype,
      filename: m.documentMessage.fileName };
  if (m.stickerMessage)
    return { type:'sticker', body:'[sticker]', mediaBase64: getB64(), mimetype: 'image/webp' };
  if (m.locationMessage)
    return { type:'location', body: `Localização: ${m.locationMessage.degreesLatitude},${m.locationMessage.degreesLongitude}` };
  if (m.contactMessage || m.contactsArrayMessage)
    return { type:'contact', body: m.contactMessage?.displayName || '[contato]' };
  if (m.reactionMessage)
    return { type:'reaction', body: m.reactionMessage.text || '' };
  return { type:'text', body:'[mensagem não suportada]' };
}

async function getConversationFull(convId) {
  const r = await db.query(
    `SELECT c.*,d.name as dept_name,d.color as dept_color,
            u.name as agent_name,i.name as instance_name,
            lm.last_message_id,lm.last_message_type
     FROM wa_conversations c
     LEFT JOIN wa_departments d ON d.id=c.department_id
     LEFT JOIN users u ON u.id=c.assigned_to
     LEFT JOIN wa_instances i ON i.id=c.instance_id
     LEFT JOIN LATERAL (SELECT id as last_message_id, type as last_message_type FROM wa_messages WHERE conversation_id=c.id ORDER BY created_at DESC LIMIT 1) lm ON true
     WHERE c.id=$1`, [convId]
  );
  return r.rows[0];
}

async function sendAndSave(instanceName, phone, convId, text, isBot, sentBy) {
  const r2 = await evo.sendText(instanceName, phone, text);
  const waId = r2?.data?.key?.id || null;
  return db.query(
    "INSERT INTO wa_messages (conversation_id,wa_message_id,direction,type,body,is_bot,sent_by,status) VALUES ($1,$2,'out','text',$3,$4,$5,'sent') RETURNING *",
    [convId, waId, text, isBot || false, sentBy || null]
  );
}

/** Remove media_base64 de objetos antes de broadcast via WebSocket */
function stripMedia(obj) {
  if (!obj) return obj;
  const { media_base64, ...clean } = obj;
  return { ...clean, has_media: !!media_base64 };
}

// ─── Webhook (público) ─────────────────────────────────────────────────────────

router.post('/webhook/:instanceName', async (req, res) => {
  // Validar secret do webhook se WA_WEBHOOK_SECRET estiver definido
  const webhookSecret = process.env.WA_WEBHOOK_SECRET;
  if (webhookSecret && req.query.secret !== webhookSecret) {
    return res.sendStatus(401);
  }
  res.sendStatus(200);
  const instanceName = req.params.instanceName;
  const payload = req.body;
  try {
    const instRes = await db.query('SELECT * FROM wa_instances WHERE name=$1', [instanceName]);
    const inst = instRes.rows[0];
    if (!inst) return;

    // ── QR Code ──
    if (payload.event === 'QRCODE_UPDATED' || payload.event === 'qrcode.updated') {
      const qr = payload.data?.qrcode?.base64 || null;
      await db.query('UPDATE wa_instances SET qr_code=$1,status=$2,updated_at=NOW() WHERE id=$3',
        [qr, 'qr_code', inst.id]);
      ws.emitInbox({ type:'instance_status', instanceId:inst.id, status:'qr_code', qrCode:qr });
      return;
    }

    // ── Conexão ──
    if (payload.event === 'CONNECTION_UPDATE' || payload.event === 'connection.update') {
      const d = payload.data || {};
      const rawState = d.state || d.connection || '';
      console.log('[WA] CONNECTION_UPDATE:', instanceName, JSON.stringify(d));
      let state = 'disconnected';
      if (rawState === 'open') state = 'connected';
      else if (rawState === 'connecting' || rawState === 'qr') state = 'qr_code';
      await db.query('UPDATE wa_instances SET status=$1,updated_at=NOW() WHERE id=$2', [state, inst.id]);
      ws.emitInbox({ type:'instance_status', instanceId:inst.id, status:state });
      return;
    }

    // ── Contatos ──
    if (payload.event === 'CONTACTS_UPSERT' || payload.event === 'contacts.upsert') {
      const contacts = Array.isArray(payload.data) ? payload.data : [];
      for (const c of contacts) {
        const jid = c.id || c.remoteJid || '';
        if (jid.endsWith('@g.us') || jid.endsWith('@broadcast')) continue;
        const phone = jid.replace('@s.whatsapp.net','').replace('@lid','').replace(/:\d+$/,'');
        if (!phone || !/^\d+$/.test(phone)) continue;
        const name = c.pushName || c.verifiedName || c.notify || null;
        if (name) {
          await db.query(
            'UPDATE wa_conversations SET contact_name=$1,updated_at=NOW() WHERE instance_id=$2 AND contact_phone=$3 AND (contact_name IS NULL OR contact_name=$3)',
            [name, inst.id, phone]
          );
        }
      }
      return;
    }

    // ── Mensagens recebidas ──
    if (payload.event === 'MESSAGES_UPSERT' || payload.event === 'messages.upsert') {
      let msg = null;
      if (payload.data?.key) {
        msg = payload.data;
      } else if (Array.isArray(payload.data?.messages)) {
        msg = payload.data.messages[0];
      } else if (payload.data?.message) {
        msg = payload.data;
      }
      if (!msg?.key) return;

      // ── fromMe (mensagem enviada pelo celular) ──
      if (msg.key.fromMe) {
        const content2 = extractContent(msg);
        const jid2 = msg.key.remoteJid || '';
        if (jid2.endsWith('@g.us') || jid2.endsWith('@broadcast')) return;
        const phone2 = jid2.replace('@s.whatsapp.net','').replace('@lid','').replace(/:\d+$/,'');
        if (!phone2 || !/^\d+$/.test(phone2)) return;
        const convRes2 = await db.query('SELECT * FROM wa_conversations WHERE instance_id=$1 AND contact_phone=$2', [inst.id, phone2]);
        if (convRes2.rows[0]) {
          const conv2 = convRes2.rows[0];
          const waId2 = msg.key.id;
          const saved2 = await db.query(
            "INSERT INTO wa_messages (conversation_id,wa_message_id,direction,type,body,media_base64,media_mimetype,is_bot,status) VALUES ($1,$2,'out',$3,$4,$5,$6,false,'sent') ON CONFLICT (wa_message_id) DO NOTHING RETURNING *",
            [conv2.id, waId2, content2.type, content2.body, content2.mediaBase64||null, content2.mimetype||null]
          );
          await db.query('UPDATE wa_conversations SET last_message=$1,last_message_at=NOW(),updated_at=NOW() WHERE id=$2',
            [content2.body?.substring(0,100)||'[mídia]', conv2.id]);
          if (saved2.rows[0]) {
            ws.emitConversation(conv2.id, { type:'message', message: stripMedia(saved2.rows[0]) });
          }
        }
        return;
      }

      // ── Mensagem de contato (incoming) ──
      const remoteJid = msg.key.remoteJid || '';
      if (remoteJid.endsWith('@g.us') || remoteJid.endsWith('@broadcast')) return;

      const isLid = remoteJid.endsWith('@lid');

      // Extrair número do JID
      let phone = remoteJid
        .replace('@s.whatsapp.net','')
        .replace('@lid','')
        .replace('@g.us','')
        .replace(/:\d+$/,'');

      // Se veio como @lid, precisamos resolver para o número real
      if (isLid) {
        // 1. senderPn — Evolution API v2.3+ envia o número real quando remoteJid é @lid
        const senderPnRaw = msg.key?.senderPn || payload.data?.key?.senderPn || '';
        const senderPn = senderPnRaw.replace(/@s\.whatsapp\.net|@lid|:\d+$/g, '').trim();
        if (senderPn && /^\d{7,15}$/.test(senderPn)) {
          phone = senderPn;
          console.log('[WA] LID → número via senderPn:', remoteJid, '→', phone);
        } else {
          // 2. participant (multi-device)
          const participant = (msg.key?.participant || msg.participant || '')
            .replace(/@s\.whatsapp\.net|@lid|:\d+$/g, '');
          if (participant && /^\d{7,15}$/.test(participant)) {
            phone = participant;
          } else {
            // 3. Evolution API resolveLid
            console.log('[WA] Tentando resolver LID:', remoteJid);
            const resolved = await evo.resolveLid(inst.name, remoteJid).catch(() => null);
            if (resolved && /^\d{7,15}$/.test(resolved)) {
              phone = resolved;
              console.log('[WA] LID resolvido:', remoteJid, '→', phone);
            } else {
              const lidInDb = await db.query(
                "SELECT * FROM wa_conversations WHERE instance_id=$1 AND contact_phone=$2 ORDER BY created_at DESC LIMIT 1",
                [inst.id, phone]
              );
              if (lidInDb.rows[0]) {
                console.warn('[WA] LID não resolvido, salvando na conversa existente:', phone);
              } else {
                console.warn('[WA] LID não resolvível, criando conversa marcada como inválida:', remoteJid);
              }
            }
          }
        }
      }

      if (!phone || phone.length < 5) {
        console.warn('[WA] Número inválido, ignorando:', remoteJid);
        return;
      }

      const senderName = msg.pushName || msg.verifiedBizName || payload.data?.pushName || msg.notify || phone;

      // Se o número é numérico válido (resolvido de um LID), verificar se há
      // conversa antiga com phone_invalid para esse contato (pelo nome) e corrigir o telefone
      if (!isLid && /^\d{7,15}$/.test(phone)) {
        const invalidConv = await db.query(
          `SELECT id FROM wa_conversations WHERE instance_id=$1 AND phone_invalid=true
           AND (contact_name=$2 OR contact_name=$3) ORDER BY created_at DESC LIMIT 1`,
          [inst.id, senderName, phone]
        );
        if (invalidConv.rows[0]) {
          await db.query(
            'UPDATE wa_conversations SET contact_phone=$1, phone_invalid=false, updated_at=NOW() WHERE id=$2',
            [phone, invalidConv.rows[0].id]
          );
          console.log('[WA] Corrigido número inválido na conversa', invalidConv.rows[0].id, '→', phone);
        }
      }

      // Upsert da conversa (com lock para evitar race condition)
      let conv;
      let reopened = false;
      // Look for the most recent open (non-closed) conversation for this contact
      const convRes = await db.query(
        "SELECT * FROM wa_conversations WHERE instance_id=$1 AND contact_phone=$2 AND status != 'closed' ORDER BY created_at DESC LIMIT 1",
        [inst.id, phone]
      );
      if (!convRes.rows[0]) {
        // No open conversation — check if there's a closed one to reopen
        const closedRes = await db.query(
          "SELECT * FROM wa_conversations WHERE instance_id=$1 AND contact_phone=$2 AND status='closed' ORDER BY created_at DESC LIMIT 1",
          [inst.id, phone]
        );
        if (closedRes.rows[0]) {
          // Reopen the most recent closed conversation
          const updated = await db.query(
            "UPDATE wa_conversations SET status='queue',unread_count=0,updated_at=NOW() WHERE id=$1 RETURNING *",
            [closedRes.rows[0].id]
          );
          conv = updated.rows[0];
          reopened = true;
        } else {
          // No conversation at all — create a new one
          const deptRes = await db.query('SELECT id FROM wa_departments WHERE active=true ORDER BY id LIMIT 1');
          const dept = deptRes.rows[0];
          try {
            const newConv = await db.query(
              "INSERT INTO wa_conversations (instance_id,contact_phone,contact_name,department_id,status,bot_active) VALUES ($1,$2,$3,$4,'bot',true) RETURNING *",
              [inst.id, phone, senderName, dept?.id || null]
            );
            conv = newConv.rows[0];
          } catch(e) {
            conv = (await db.query(
              "SELECT * FROM wa_conversations WHERE instance_id=$1 AND contact_phone=$2 ORDER BY created_at DESC LIMIT 1",
              [inst.id, phone]
            )).rows[0];
          }
        }
      } else {
        conv = convRes.rows[0];
      }
      if (conv && senderName && senderName !== phone && senderName !== conv.contact_name) {
        await db.query('UPDATE wa_conversations SET contact_name=$1 WHERE id=$2', [senderName, conv.id]);
      }

      const content    = extractContent(msg);
      const waMessageId = msg.key.id;

      // Se media veio sem base64, tentar buscar via Evolution API
      if (content.mediaBase64 === null && ['image','audio','video','document','sticker'].includes(content.type)) {
        try {
          const mediaResp = await evo.getBase64FromMedia(instanceName, { key: msg.key, message: msg.message });
          if (mediaResp?.data?.base64) {
            content.mediaBase64 = mediaResp.data.base64;
          }
        } catch(e) { console.warn('[WA] Fallback getBase64 falhou:', e.message); }
      }

      const saved = await db.query(
        "INSERT INTO wa_messages (conversation_id,wa_message_id,direction,type,body,media_base64,media_mimetype,media_filename,media_duration,is_bot,status) VALUES ($1,$2,'in',$3,$4,$5,$6,$7,$8,false,'delivered') ON CONFLICT (wa_message_id) DO NOTHING RETURNING *",
        [conv.id, waMessageId, content.type, content.body, content.mediaBase64||null,
         content.mimetype||null, content.filename||null, content.duration||null]
      );
      if (!saved.rows.length) return;

      await db.query(
        'UPDATE wa_conversations SET last_message=$1,last_message_at=NOW(),unread_count=unread_count+1,updated_at=NOW() WHERE id=$2',
        [content.body ? content.body.substring(0,100) : '[mídia]', conv.id]
      );

      const fullConv = await getConversationFull(conv.id);
      // Broadcast SEM base64 — frontend busca via /messages/:id/media
      ws.emitInbox({ type:'new_message', conversation:fullConv, message: stripMedia(saved.rows[0]) });
      ws.emitConversation(conv.id, { type:'message', message: stripMedia(saved.rows[0]) });

      // Bot
      if (conv.bot_active && conv.status === 'bot') {
        try {
          const result = await bot.processMessage(conv, saved.rows[0]);
          if (result?.action === 'escalate') {
            if (result.fallbackMsg) {
              await sendAndSave(inst.name, phone, conv.id, result.fallbackMsg, true, null).catch(e =>
                console.error('[Bot] Falha ao enviar fallback:', e.message));
            }
            await db.query("UPDATE wa_conversations SET status='queue',bot_active=false,updated_at=NOW() WHERE id=$1", [conv.id]);
            ws.emitInbox({ type:'conversation_update', conversationId:conv.id, status:'queue' });
          } else if (result?.reply) {
            await sendAndSave(inst.name, phone, conv.id, result.reply, true, null);
            await db.query('UPDATE wa_conversations SET bot_turns=bot_turns+1,updated_at=NOW() WHERE id=$1', [conv.id]);
          }
        } catch(e) { console.error('[Bot] Erro:', e.message); }
      }
    }

    // ── Status de mensagem (delivered/read) ──
    if (payload.event === 'MESSAGES_UPDATE' || payload.event === 'messages.update') {
      const updates = Array.isArray(payload.data) ? payload.data : [];
      for (const upd of updates) {
        const st = upd.update?.status;
        const status = st === 3 ? 'read' : st === 2 ? 'delivered' : null;
        if (status && upd.key?.id) {
          await db.query('UPDATE wa_messages SET status=$1 WHERE wa_message_id=$2', [status, upd.key.id]);
          ws.emitInbox({ type:'message_status', waMessageId:upd.key.id, status });
        }
      }
    }
  } catch(e) { console.error('[Webhook] Erro:', e.message, e.stack); }
});

// ─── Rotas autenticadas ────────────────────────────────────────────────────────

router.use(auth);
router.use(requirePermission('crm'));

// ── Instâncias ─────────────────────────────────────────────────────────────────

router.get('/instances', async (req, res, next) => {
  try { res.json((await db.query('SELECT * FROM wa_instances ORDER BY id')).rows); } catch(e) { next(e); }
});

router.post('/instances', async (req, res, next) => {
  const name = req.body.name;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
  try {
    const _whSecret = process.env.WA_WEBHOOK_SECRET ? `?secret=${process.env.WA_WEBHOOK_SECRET}` : '';
    const webhookUrl = 'http://backend:3001/api/whatsapp/webhook/' + name + _whSecret;
    const r = await db.query('INSERT INTO wa_instances (name,webhook_url,status) VALUES ($1,$2,$3) RETURNING *',
      [name, webhookUrl, 'disconnected']);
    evo.createInstance(name, webhookUrl).catch(e => console.warn('Evo:', e.message));
    res.status(201).json(r.rows[0]);
  } catch(e) { next(e); }
});

router.post('/instances/:id/connect', async (req, res, next) => {
  try {
    const inst = (await db.query('SELECT * FROM wa_instances WHERE id=$1', [req.params.id])).rows[0];
    if (!inst) return res.status(404).json({ error: 'Não encontrado' });
    const _whSecret2 = process.env.WA_WEBHOOK_SECRET ? `?secret=${process.env.WA_WEBHOOK_SECRET}` : '';
    const webhookUrl = 'http://backend:3001/api/whatsapp/webhook/' + inst.name + _whSecret2;
    await evo.setWebhook(inst.name, webhookUrl).catch(() => {});
    await db.query('UPDATE wa_instances SET webhook_url=$1 WHERE id=$2', [webhookUrl, inst.id]);
    const r = await evo.connectInstance(inst.name);
    const qr = r.data?.base64 || null;
    if (qr) await db.query('UPDATE wa_instances SET qr_code=$1,status=$2 WHERE id=$3', [qr,'qr_code',inst.id]);
    res.json({ qrCode: qr, status: r.data?.state || 'connecting' });
  } catch(e) { next(e); }
});

router.get('/instances/:id/status', async (req, res, next) => {
  try {
    const inst = (await db.query('SELECT * FROM wa_instances WHERE id=$1', [req.params.id])).rows[0];
    if (!inst) return res.status(404).json({ error: 'Não encontrado' });
    try {
      const evoR = await evo.getInstanceStatus(inst.name);
      const evoState = evoR?.data?.instance?.state;
      let realStatus = inst.status;
      if (evoState === 'open') realStatus = 'connected';
      else if (evoState === 'connecting') realStatus = 'qr_code';
      else if (evoState === 'close' || evoState === 'closed') realStatus = 'disconnected';
      if (realStatus !== inst.status) {
        await db.query('UPDATE wa_instances SET status=$1,updated_at=NOW() WHERE id=$2', [realStatus, inst.id]);
      }
      res.json({ status: realStatus, qrCode: inst.qr_code });
    } catch {
      res.json({ status: inst.status, qrCode: inst.qr_code });
    }
  } catch(e) { next(e); }
});

router.delete('/instances/:id', async (req, res, next) => {
  try {
    const inst = (await db.query('SELECT * FROM wa_instances WHERE id=$1', [req.params.id])).rows[0];
    if (!inst) return res.status(404).json({ error: 'Não encontrado' });
    evo.deleteInstance(inst.name).catch(() => {});
    await db.query('DELETE FROM wa_instances WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch(e) { next(e); }
});

// ── Departamentos ──────────────────────────────────────────────────────────────

router.get('/departments', async (req, res, next) => {
  try { res.json((await db.query('SELECT * FROM wa_departments WHERE active=true ORDER BY name')).rows); }
  catch(e) { next(e); }
});

router.post('/departments', async (req, res, next) => {
  const { name, description, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
  try {
    // Prevent duplicate names (case-insensitive)
    const exists = await db.query('SELECT id FROM wa_departments WHERE LOWER(name)=LOWER($1) AND active=true', [name.trim()]);
    if (exists.rows[0]) return res.status(409).json({ error: 'Já existe um departamento com esse nome' });
    const r = await db.query('INSERT INTO wa_departments (name,description,color) VALUES ($1,$2,$3) RETURNING *',
      [name.trim(), description||null, color||'#6366f1']);
    res.status(201).json(r.rows[0]);
  } catch(e) { next(e); }
});

router.put('/departments/:id', async (req, res, next) => {
  const { name, description, color, active } = req.body;
  try {
    const r = await db.query('UPDATE wa_departments SET name=$1,description=$2,color=$3,active=$4 WHERE id=$5 RETURNING *',
      [name, description||null, color, active!==undefined ? active : true, req.params.id]);
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

// ── Conversas ──────────────────────────────────────────────────────────────────

router.get('/conversations', async (req, res, next) => {
  const { status, department_id, assigned_to, search, tag_id } = req.query;
  let q = `SELECT c.*,d.name as dept_name,d.color as dept_color,
                  u.name as agent_name,i.name as instance_name,
                  lm.last_message_id,lm.last_message_type
           FROM wa_conversations c
           LEFT JOIN wa_departments d ON d.id=c.department_id
           LEFT JOIN users u ON u.id=c.assigned_to
           LEFT JOIN wa_instances i ON i.id=c.instance_id
           LEFT JOIN LATERAL (SELECT id as last_message_id, type as last_message_type FROM wa_messages WHERE conversation_id=c.id ORDER BY created_at DESC LIMIT 1) lm ON true
           WHERE 1=1`;
  const p = [];
  if (status)        { p.push(status);           q += ` AND c.status=$${p.length}`; }
  if (department_id) { p.push(department_id);     q += ` AND c.department_id=$${p.length}`; }
  if (assigned_to)   { p.push(assigned_to);       q += ` AND c.assigned_to=$${p.length}`; }
  if (search)        { p.push('%' + search + '%'); q += ` AND (c.contact_name ILIKE $${p.length} OR c.contact_phone ILIKE $${p.length})`; }
  if (tag_id)        { p.push(tag_id);            q += ` AND EXISTS (SELECT 1 FROM wa_conversation_tags ct WHERE ct.conversation_id=c.id AND ct.tag_id=$${p.length})`; }
  q += ' ORDER BY c.last_message_at DESC NULLS LAST LIMIT 200';
  try { res.json((await db.query(q, p)).rows); } catch(e) { next(e); }
});

router.get('/conversations/:id', async (req, res, next) => {
  try {
    const conv = await getConversationFull(req.params.id);
    if (!conv) return res.status(404).json({ error: 'Não encontrado' });
    res.json(conv);
  } catch(e) { next(e); }
});

// ── Mensagens (com paginação cursor + hasMore) ─────────────────────────────────

router.get('/conversations/:id/messages', async (req, res, next) => {
  const limit = Math.min(parseInt(req.query.limit) || 80, 200);
  const before = req.query.before;
  // Busca SEM media_base64 para performance (frontend busca sob demanda)
  let q = `SELECT m.id,m.conversation_id,m.wa_message_id,m.direction,m.type,m.body,
                  m.media_mimetype,m.media_filename,m.media_duration,m.quoted_id,
                  m.status,m.sent_by,m.is_bot,m.created_at,
                  CASE WHEN m.media_base64 IS NOT NULL THEN true ELSE false END as has_media,
                  u.name as sender_name
           FROM wa_messages m LEFT JOIN users u ON u.id=m.sent_by
           WHERE m.conversation_id=$1`;
  const p = [req.params.id];
  if (before) { p.push(before); q += ` AND m.id<$${p.length}`; }
  p.push(limit + 1); // +1 para detectar hasMore
  q += ` ORDER BY m.created_at DESC LIMIT $${p.length}`;
  try {
    const r = await db.query(q, p);
    const hasMore = r.rows.length > limit;
    const rows = hasMore ? r.rows.slice(0, limit) : r.rows;
    res.json({ messages: rows.reverse(), hasMore });
  } catch(e) { next(e); }
});

// ── Buscar media de uma mensagem específica (lazy load) ────────────────────────

router.get('/messages/:id/media', async (req, res, next) => {
  try {
    const r = await db.query('SELECT media_base64,media_mimetype FROM wa_messages WHERE id=$1', [req.params.id]);
    if (!r.rows[0]?.media_base64) return res.status(404).json({ error: 'Mídia não encontrada' });
    res.json({ base64: r.rows[0].media_base64, mimetype: r.rows[0].media_mimetype });
  } catch(e) { next(e); }
});

// ── Enviar texto ───────────────────────────────────────────────────────────────

router.post('/conversations/:id/messages', async (req, res, next) => {
  const { text, quotedId } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'Texto obrigatório' });
  try {
    const convRes = await db.query('SELECT c.*,i.name as instance_name FROM wa_conversations c JOIN wa_instances i ON i.id=c.instance_id WHERE c.id=$1', [req.params.id]);
    const conv = convRes.rows[0];
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });

    let quotedWaId = null;
    if (quotedId) {
      const qr = await db.query('SELECT wa_message_id FROM wa_messages WHERE id=$1', [quotedId]);
      quotedWaId = qr.rows[0]?.wa_message_id || null;
    }

    // Normalizar número: só dígitos, sem @, sem espaços
    // Evolution API v2 aceita: 5511999999999 (com código país, sem @)
    const phoneNormalized = conv.contact_phone.replace(/[^\d]/g, '');
    console.log(`[sendText] inst=${conv.instance_name} phone=${conv.contact_phone} normalized=${phoneNormalized}`);

    let evoResp, waId = null;
    try {
      evoResp = await evo.sendText(conv.instance_name, phoneNormalized, text, quotedWaId);
      waId = evoResp?.data?.key?.id || null;
      console.log(`[sendText] evo status=${evoResp?.status} waId=${waId} data=`, JSON.stringify(evoResp?.data)?.substring(0,200));
      // Checar se houve erro da Evolution API
      if (evoResp?.status && evoResp.status >= 400) {
        const evoErr = evoResp?.data?.message || evoResp?.data?.error || JSON.stringify(evoResp?.data) || `Erro Evolution API (${evoResp.status})`;
        console.error('[sendText] Evolution error:', evoResp.status, evoErr);
        return res.status(502).json({ error: `Falha ao enviar: ${evoErr}` });
      }
    } catch(evoErr) {
      console.error('[sendText] Evolution unreachable:', evoErr.message);
      return res.status(502).json({ error: 'WhatsApp API indisponível. Verifique a conexão da instância.' });
    }

    const r = await db.query(
      "INSERT INTO wa_messages (conversation_id,wa_message_id,direction,type,body,sent_by,is_bot,status,quoted_id) VALUES ($1,$2,'out','text',$3,$4,false,'sent',$5) RETURNING *",
      [conv.id, waId, text, req.user.id, quotedId||null]
    );

    await db.query('UPDATE wa_conversations SET last_message=$1,last_message_at=NOW(),updated_at=NOW() WHERE id=$2',
      [text.substring(0,100), conv.id]);

    if (conv.status === 'queue' || conv.status === 'bot') {
      await db.query("UPDATE wa_conversations SET status='active',assigned_to=$1,bot_active=false WHERE id=$2",
        [req.user.id, conv.id]);
    }

    // Note: we do NOT emitConversation here because the sender's frontend already
    // adds the message locally (HTTP response). We only notify OTHER agents via inbox.
    ws.emitInbox({ type:'new_message', conversation: await getConversationFull(conv.id), message: stripMedia(r.rows[0]) });
    res.status(201).json(r.rows[0]);
  } catch(e) { next(e); }
});

// ── Enviar mídia (imagem, vídeo, documento) ────────────────────────────────────

router.post('/conversations/:id/media', async (req, res, next) => {
  const { mediatype, media, caption, fileName, mimetype } = req.body;
  if (!media || !mediatype) return res.status(400).json({ error: 'Mídia obrigatória' });

  // Strip data URL prefix if present — Evolution API expects raw base64
  const rawB64 = media.includes(',') ? media.split(',')[1] : media;

  // Validações
  if (mimetype && !ALLOWED_MIMETYPES.includes(mimetype))
    return res.status(400).json({ error: 'Tipo de arquivo não permitido' });
  if (Buffer.byteLength(rawB64, 'base64') > MAX_MEDIA_SIZE)
    return res.status(400).json({ error: 'Arquivo muito grande (máx 15MB)' });

  try {
    const convRes = await db.query('SELECT c.*,i.name as instance_name FROM wa_conversations c JOIN wa_instances i ON i.id=c.instance_id WHERE c.id=$1', [req.params.id]);
    const conv = convRes.rows[0];
    if (!conv) return res.status(404).json({ error: 'Não encontrado' });

    // Send pure base64 (no data: prefix) to Evolution API
    const phoneNormalizedMedia = conv.contact_phone.replace(/[^\d]/g, '');
    let evoResp, waId = null;
    try {
      evoResp = await evo.sendMedia(conv.instance_name, phoneNormalizedMedia, {
        mediatype, mimetype, media: rawB64, caption: caption || '', fileName
      });
      waId = evoResp?.data?.key?.id || null;
      if (evoResp?.status >= 400) {
        const evoErr = evoResp?.data?.message || evoResp?.data?.error || JSON.stringify(evoResp?.data) || `Erro Evolution API (${evoResp.status})`;
        console.error('[sendMedia] Evolution error:', evoResp.status, evoErr);
        return res.status(502).json({ error: `Falha ao enviar mídia: ${evoErr}` });
      }
    } catch(evoErr) {
      console.error('[sendMedia] Evolution unreachable:', evoErr.message);
      return res.status(502).json({ error: 'WhatsApp API indisponível. Verifique a conexão da instância.' });
    }

    // Store with original full data URL so frontend can display it
    const r = await db.query(
      "INSERT INTO wa_messages (conversation_id,wa_message_id,direction,type,body,media_base64,media_mimetype,media_filename,sent_by,status) VALUES ($1,$2,'out',$3,$4,$5,$6,$7,$8,'sent') RETURNING *",
      [conv.id, waId, mediatype, caption||('['+mediatype+']'), media, mimetype, fileName||null, req.user.id]
    );

    await db.query('UPDATE wa_conversations SET last_message=$1,last_message_at=NOW(),updated_at=NOW() WHERE id=$2',
      ['['+mediatype+']', conv.id]);

    if (conv.status === 'queue' || conv.status === 'bot') {
      await db.query("UPDATE wa_conversations SET status='active',assigned_to=$1,bot_active=false WHERE id=$2",
        [req.user.id, conv.id]);
    }

    // Same as text: don't emitConversation to avoid duplicate on sender's screen
    ws.emitInbox({ type:'new_message', conversation: await getConversationFull(conv.id), message: stripMedia(r.rows[0]) });
    res.status(201).json(stripMedia(r.rows[0]));
  } catch(e) { next(e); }
});

// ── Enviar áudio (gravação do microfone) ───────────────────────────────────────

router.post('/conversations/:id/audio', async (req, res, next) => {
  const { audio } = req.body; // base64
  if (!audio) return res.status(400).json({ error: 'Áudio obrigatório' });

  const rawB64 = audio.includes(',') ? audio.split(',')[1] : audio;
  if (Buffer.byteLength(rawB64, 'base64') > MAX_MEDIA_SIZE)
    return res.status(400).json({ error: 'Áudio muito grande (máx 15MB)' });

  try {
    const convRes = await db.query('SELECT c.*,i.name as instance_name FROM wa_conversations c JOIN wa_instances i ON i.id=c.instance_id WHERE c.id=$1', [req.params.id]);
    const conv = convRes.rows[0];
    if (!conv) return res.status(404).json({ error: 'Não encontrado' });

    const phoneNormalizedAudio = conv.contact_phone.replace(/[^\d]/g, '');
    let evoRespAudio, waId = null;
    try {
      evoRespAudio = await evo.sendAudio(conv.instance_name, phoneNormalizedAudio, rawB64);
      waId = evoRespAudio?.data?.key?.id || null;
      if (evoRespAudio?.status >= 400) {
        const evoErr = evoRespAudio?.data?.message || evoRespAudio?.data?.error || JSON.stringify(evoRespAudio?.data) || `Erro Evolution API (${evoRespAudio.status})`;
        return res.status(502).json({ error: `Falha ao enviar áudio: ${evoErr}` });
      }
    } catch(evoErr) {
      return res.status(502).json({ error: 'WhatsApp API indisponível.' });
    }

    const r = await db.query(
      "INSERT INTO wa_messages (conversation_id,wa_message_id,direction,type,body,media_base64,media_mimetype,sent_by,status) VALUES ($1,$2,'out','audio','[audio]',$3,'audio/ogg',$4,'sent') RETURNING *",
      [conv.id, waId, audio, req.user.id]
    );

    await db.query('UPDATE wa_conversations SET last_message=$1,last_message_at=NOW(),updated_at=NOW() WHERE id=$2',
      ['[audio]', conv.id]);

    if (conv.status === 'queue' || conv.status === 'bot') {
      await db.query("UPDATE wa_conversations SET status='active',assigned_to=$1,bot_active=false WHERE id=$2",
        [req.user.id, conv.id]);
    }

    ws.emitInbox({ type:'new_message', conversation: await getConversationFull(conv.id), message: stripMedia(r.rows[0]) });
    res.status(201).json(stripMedia(r.rows[0]));
  } catch(e) { next(e); }
});

// ── Atualizar dados da conversa (phone, name, etc) ────────────────────────────
router.patch('/conversations/:id', async (req, res, next) => {
  const { contact_phone, contact_name, phone_invalid } = req.body;
  try {
    const sets = [], vals = [];
    if (contact_phone !== undefined) {
      const cleaned = (contact_phone + '').replace(/[^\d]/g, '');
      if (!/^\d{7,15}$/.test(cleaned)) return res.status(400).json({ error: 'Número inválido' });
      sets.push(`contact_phone=$${sets.length+1}`); vals.push(cleaned);
    }
    if (contact_name !== undefined) { sets.push(`contact_name=$${sets.length+1}`); vals.push(contact_name); }
    if (phone_invalid !== undefined) { sets.push(`phone_invalid=$${sets.length+1}`); vals.push(!!phone_invalid); }
    if (!sets.length) return res.status(400).json({ error: 'Nada para atualizar' });
    sets.push(`updated_at=NOW()`);
    vals.push(req.params.id);
    const r = await db.query(
      `UPDATE wa_conversations SET ${sets.join(',')} WHERE id=$${vals.length} RETURNING *`,
      vals
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Não encontrado' });
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

// ── Ações na conversa ──────────────────────────────────────────────────────────

router.patch('/conversations/:id/assign', async (req, res, next) => {
  const { userId, departmentId } = req.body;
  try {
    const r = await db.query(
      "UPDATE wa_conversations SET assigned_to=$1,department_id=COALESCE($2,department_id),status='active',bot_active=false,updated_at=NOW() WHERE id=$3 RETURNING *",
      [userId || req.user.id, departmentId||null, req.params.id]
    );
    ws.emitInbox({ type:'conversation_update', conversationId:parseInt(req.params.id), status:'active', assignedTo: userId||req.user.id });
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

router.patch('/conversations/:id/close', async (req, res, next) => {
  try {
    await db.query("UPDATE wa_conversations SET status='closed',unread_count=0,updated_at=NOW() WHERE id=$1", [req.params.id]);
    ws.emitInbox({ type:'conversation_update', conversationId:parseInt(req.params.id), status:'closed' });
    res.json({ success:true });
  } catch(e) { next(e); }
});

// Reopen creates a NEW conversation for the same contact (allows repeat purchases / new interactions)
router.patch('/conversations/:id/reopen', async (req, res, next) => {
  try {
    const old = (await db.query('SELECT * FROM wa_conversations WHERE id=$1', [req.params.id])).rows[0];
    if (!old) return res.status(404).json({ error: 'Conversa não encontrada' });
    // Create a fresh conversation for this contact
    const r = await db.query(
      "INSERT INTO wa_conversations (instance_id,contact_phone,contact_name,contact_avatar,department_id,status,bot_active) VALUES ($1,$2,$3,$4,$5,'queue',false) RETURNING *",
      [old.instance_id, old.contact_phone, old.contact_name, old.contact_avatar, old.department_id]
    );
    const newConv = r.rows[0];
    const fullConv = await getConversationFull(newConv.id);
    ws.emitInbox({ type:'new_message', conversation: fullConv });
    res.status(201).json(fullConv);
  } catch(e) { next(e); }
});

router.patch('/conversations/:id/read', async (req, res, next) => {
  try {
    const convRes = await db.query('SELECT c.*,i.name as instance_name FROM wa_conversations c JOIN wa_instances i ON i.id=c.instance_id WHERE c.id=$1', [req.params.id]);
    const conv = convRes.rows[0];
    if (conv) {
      await db.query('UPDATE wa_conversations SET unread_count=0 WHERE id=$1', [conv.id]);
      const msgIds = (await db.query("SELECT wa_message_id FROM wa_messages WHERE conversation_id=$1 AND direction='in' ORDER BY created_at DESC LIMIT 20", [conv.id])).rows.map(r => r.wa_message_id).filter(Boolean);
      if (msgIds.length) evo.markAsRead(conv.instance_name, conv.contact_phone+'@s.whatsapp.net', msgIds).catch(()=>{});
    }
    res.json({ success:true });
  } catch(e) { next(e); }
});

router.patch('/conversations/:id/link', async (req, res, next) => {
  const { clientId, leadId } = req.body;
  try {
    await db.query('UPDATE wa_conversations SET client_id=$1,lead_id=$2 WHERE id=$3', [clientId||null, leadId||null, req.params.id]);
    res.json({ success:true });
  } catch(e) { next(e); }
});

// ── Quick Replies ──────────────────────────────────────────────────────────────

router.get('/quick-replies', async (req, res, next) => {
  const q = req.query.q; const deptId = req.query.department_id;
  let sql = 'SELECT * FROM wa_quick_replies WHERE active=true';
  const p = [];
  if (q) { p.push('%'+q+'%'); sql += ` AND (shortcut ILIKE $${p.length} OR title ILIKE $${p.length} OR body ILIKE $${p.length})`; }
  if (deptId) { p.push(deptId); sql += ` AND (department_id=$${p.length} OR department_id IS NULL)`; }
  sql += ' ORDER BY shortcut LIMIT 10';
  try { res.json((await db.query(sql, p)).rows); } catch(e) { next(e); }
});

router.post('/quick-replies', async (req, res, next) => {
  const { shortcut, title, body, department_id } = req.body;
  if (!shortcut || !body) return res.status(400).json({ error: 'Atalho e texto obrigatórios' });
  const slug = shortcut.startsWith('/') ? shortcut : '/'+shortcut;
  try {
    const r = await db.query('INSERT INTO wa_quick_replies (shortcut,title,body,department_id) VALUES ($1,$2,$3,$4) RETURNING *',
      [slug, title||slug, body, department_id||null]);
    res.status(201).json(r.rows[0]);
  } catch(e) { next(e); }
});

router.put('/quick-replies/:id', async (req, res, next) => {
  const { shortcut, title, body, department_id, active } = req.body;
  try {
    const r = await db.query('UPDATE wa_quick_replies SET shortcut=$1,title=$2,body=$3,department_id=$4,active=$5 WHERE id=$6 RETURNING *',
      [shortcut, title, body, department_id||null, active!==undefined?active:true, req.params.id]);
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

router.delete('/quick-replies/:id', async (req, res, next) => {
  try { await db.query('DELETE FROM wa_quick_replies WHERE id=$1', [req.params.id]); res.json({ success:true }); }
  catch(e) { next(e); }
});

// ── Bot Config ─────────────────────────────────────────────────────────────────

router.get('/bot-config/:departmentId', async (req, res, next) => {
  try {
    const r = await db.query('SELECT * FROM wa_bot_configs WHERE department_id=$1', [req.params.departmentId]);
    res.json(r.rows[0] || { department_id:req.params.departmentId, enabled:false });
  } catch(e) { next(e); }
});

router.put('/bot-config/:departmentId', async (req, res, next) => {
  const { enabled, provider, system_prompt, max_turns, fallback_msg } = req.body;
  try {
    const r = await db.query(
      "INSERT INTO wa_bot_configs (department_id,enabled,provider,system_prompt,max_turns,fallback_msg) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (department_id) DO UPDATE SET enabled=$2,provider=$3,system_prompt=$4,max_turns=$5,fallback_msg=$6,updated_at=NOW() RETURNING *",
      [req.params.departmentId, enabled||false, provider||'claude', system_prompt||null, max_turns||10, fallback_msg||'Aguarde, um agente irá atendê-lo em breve.']
    );
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

// ── Tags ───────────────────────────────────────────────────────────────────────

router.get('/tags', async (req, res, next) => {
  try { res.json((await db.query('SELECT * FROM wa_tags ORDER BY name')).rows); } catch(e) { next(e); }
});

router.post('/tags', async (req, res, next) => {
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
  try {
    const r = await db.query('INSERT INTO wa_tags (name,color) VALUES ($1,$2) RETURNING *', [name, color||'#6366f1']);
    res.status(201).json(r.rows[0]);
  } catch(e) { next(e); }
});

router.get('/conversations/:id/tags', async (req, res, next) => {
  try {
    const r = await db.query(
      'SELECT t.* FROM wa_tags t JOIN wa_conversation_tags ct ON ct.tag_id=t.id WHERE ct.conversation_id=$1',
      [req.params.id]
    );
    res.json(r.rows);
  } catch(e) { next(e); }
});

router.post('/conversations/:id/tags', async (req, res, next) => {
  const { tagId } = req.body;
  try {
    await db.query('INSERT INTO wa_conversation_tags (conversation_id,tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.params.id, tagId]);
    res.json({ success: true });
  } catch(e) { next(e); }
});

router.delete('/conversations/:id/tags/:tagId', async (req, res, next) => {
  try {
    await db.query('DELETE FROM wa_conversation_tags WHERE conversation_id=$1 AND tag_id=$2', [req.params.id, req.params.tagId]);
    res.json({ success: true });
  } catch(e) { next(e); }
});

// ── Auto-criar lead no CRM ────────────────────────────────────────────────────

router.post('/conversations/:id/create-lead', async (req, res, next) => {
  try {
    const conv = (await db.query('SELECT * FROM wa_conversations WHERE id=$1', [req.params.id])).rows[0];
    if (!conv) return res.status(404).json({ error: 'Não encontrado' });
    const pipeline = (await db.query('SELECT id FROM pipelines ORDER BY position LIMIT 1')).rows[0];
    const existing = await db.query('SELECT id FROM leads WHERE phone=$1', [conv.contact_phone]);
    if (existing.rows[0]) return res.json({ lead: existing.rows[0], existing: true });
    const lead = await db.query(
      'INSERT INTO leads (name,phone,source,pipeline_id,user_id,notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [conv.contact_name||conv.contact_phone, conv.contact_phone, 'whatsapp', pipeline?.id||null, req.user.id,
       'Criado automaticamente via WhatsApp']
    );
    await db.query('UPDATE wa_conversations SET lead_id=$1 WHERE id=$2', [lead.rows[0].id, conv.id]);
    res.status(201).json({ lead: lead.rows[0], existing: false });
  } catch(e) { next(e); }
});

// ── Nova conversa (iniciar pelo sistema) ───────────────────────────────────────

router.post('/conversations/new', async (req, res, next) => {
  const { phone, name, instanceId, departmentId } = req.body;
  if (!phone) return res.status(400).json({ error: 'Telefone obrigatório' });
  const cleanPhone = phone.replace(/\D/g, '');
  try {
    const inst = instanceId
      ? (await db.query('SELECT * FROM wa_instances WHERE id=$1', [instanceId])).rows[0]
      : (await db.query('SELECT * FROM wa_instances WHERE active=true ORDER BY id LIMIT 1')).rows[0];
    if (!inst) return res.status(400).json({ error: 'Nenhuma instância conectada' });

    // Check if there's already an open (non-closed) conversation for this contact
    const convRes = await db.query(
      "SELECT * FROM wa_conversations WHERE instance_id=$1 AND contact_phone=$2 AND status != 'closed' ORDER BY created_at DESC LIMIT 1",
      [inst.id, cleanPhone]
    );
    if (convRes.rows[0]) return res.json(convRes.rows[0]);

    // Always create a new conversation when manually initiated (even if there are closed ones)
    // This supports repeat purchases / new interactions
    const r = await db.query(
      "INSERT INTO wa_conversations (instance_id,contact_phone,contact_name,department_id,status,bot_active) VALUES ($1,$2,$3,$4,'queue',false) RETURNING *",
      [inst.id, cleanPhone, name || cleanPhone, departmentId || null]
    );
    res.status(201).json(r.rows[0]);
  } catch(e) { next(e); }
});

// ── Buscar contatos (clientes + leads + conversas) ─────────────────────────────

router.get('/contacts/search', async (req, res, next) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json([]);
  const term = '%' + q + '%';
  try {
    const [clients, leads, convs] = await Promise.all([
      db.query("SELECT id,'client' as type, name, phone, email FROM clients WHERE active=true AND (name ILIKE $1 OR phone ILIKE $1 OR email ILIKE $1) LIMIT 10", [term]),
      db.query("SELECT id,'lead' as type, name, phone, email FROM leads WHERE status='open' AND (name ILIKE $1 OR phone ILIKE $1) LIMIT 10", [term]),
      db.query("SELECT id,'conversation' as type, contact_name as name, contact_phone as phone, null as email FROM wa_conversations WHERE contact_name ILIKE $1 OR contact_phone ILIKE $1 LIMIT 10", [term]),
    ]);
    const seen = new Set();
    const results = [...clients.rows, ...leads.rows, ...convs.rows].filter(r => {
      const key = (r.phone||'').replace(/\D/g,'');
      if (!key || seen.has(key)) return false;
      seen.add(key); return true;
    });
    res.json(results);
  } catch(e) { next(e); }
});

// ── Sincronizar contatos via Evolution API ─────────────────────────────────────

router.post('/contacts/sync', async (req, res, next) => {
  // alias: redireciona para sync-all
  try {
    const instances = (await db.query("SELECT * FROM wa_instances WHERE status='connected'")).rows;
    let updated = 0, imported = 0;
    for (const inst of instances) {
      try {
        const resp = await evo.fetchContacts(inst.name);
        const contacts = Array.isArray(resp?.data) ? resp.data : [];
        for (const c of contacts) {
          // O campo correto é remoteJid (número@s.whatsapp.net) ou id pode ser ID interno — filtrar
          const jid = c.remoteJid || c.id || '';
          if (!jid.includes('@s.whatsapp.net')) continue; // ignora IDs internos e grupos
          const phone = jid.replace('@s.whatsapp.net','').replace(/:\d+$/,'');
          if (!phone || phone.length < 5) continue;
          const name = c.pushName || c.verifiedName || c.notify || c.name || null;
          if (name) {
            const r = await db.query(
              'UPDATE wa_conversations SET contact_name=$1,updated_at=NOW() WHERE instance_id=$2 AND contact_phone=$3 AND (contact_name IS NULL OR contact_name=$3) RETURNING id',
              [name, inst.id, phone]
            );
            updated += r.rowCount;
          }
          await db.query(
            `INSERT INTO wa_contacts (instance_id, phone, name, updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (instance_id, phone) DO UPDATE
             SET name = COALESCE(EXCLUDED.name, wa_contacts.name), updated_at = NOW()`,
            [inst.id, phone, name || phone]
          ).catch(() => {});
          imported++;
        }
      } catch(e) { console.warn('[Sync] Erro inst', inst.name, e.message); }
    }
    res.json({ success: true, updated, imported });
  } catch(e) { next(e); }
});

// ── Sincronização completa: contatos + fotos + conversas antigas ───────────────
router.post('/contacts/sync-all', async (req, res, next) => {
  try {
    const instances = (await db.query("SELECT * FROM wa_instances WHERE status='connected'")).rows;
    const result = { contacts: 0, avatars: 0, chats: 0, messages: 0, errors: [] };

    for (const inst of instances) {
      // ── 1. Contatos ──────────────────────────────────────────────────────────
      try {
        const resp = await evo.fetchContacts(inst.name);
        let contacts = Array.isArray(resp?.data) ? resp.data : (Array.isArray(resp) ? resp : []);
        console.log(`[SyncAll] ${inst.name}: ${contacts.length} contatos brutos`);

        for (const c of contacts) {
          // remoteJid é o campo correto com número@s.whatsapp.net
          // c.id pode ser ID interno (ex: cmmbzhc5l00jupm7hg0ogwhg1) — ignorar se não tiver @
          const jid = c.remoteJid || (typeof c.id === 'string' && c.id.includes('@') ? c.id : '') || '';
          if (!jid.includes('@s.whatsapp.net')) continue;
          const phone = jid.replace('@s.whatsapp.net','').replace(/:\d+$/,'');
          if (!phone || phone.length < 5) continue;

          const name = c.pushName || c.verifiedName || c.notify || c.name || null;
          await db.query(
            `INSERT INTO wa_contacts (instance_id, phone, name, last_synced_at, updated_at)
             VALUES ($1, $2, $3, NOW(), NOW())
             ON CONFLICT (instance_id, phone) DO UPDATE
             SET name = COALESCE(EXCLUDED.name, wa_contacts.name),
                 last_synced_at = NOW(), updated_at = NOW()`,
            [inst.id, phone, name]
          ).catch(() => {});
          if (name) {
            await db.query(
              'UPDATE wa_conversations SET contact_name=$1 WHERE instance_id=$2 AND contact_phone=$3 AND (contact_name IS NULL OR contact_name=$3)',
              [name, inst.id, phone]
            ).catch(() => {});
          }
          result.contacts++;
        }
      } catch(e) { result.errors.push(`Contatos ${inst.name}: ${e.message}`); }

      // ── 2. Fotos de perfil ────────────────────────────────────────────────────
      try {
        const toFetch = (await db.query(
          `SELECT phone FROM wa_contacts WHERE instance_id=$1 AND (avatar_url IS NULL OR avatar_url='') LIMIT 100`,
          [inst.id]
        )).rows;
        for (const row of toFetch) {
          try {
            // Tentar com número puro primeiro, depois com @s.whatsapp.net
            let url = null;
            for (const fmt of [row.phone, row.phone + '@s.whatsapp.net']) {
              const r = await evo.fetchProfilePictureUrl(inst.name, fmt);
              url = r?.data?.profilePictureUrl || r?.data?.url || null;
              if (url) break;
            }
            if (url) {
              await db.query('UPDATE wa_contacts SET avatar_url=$1 WHERE instance_id=$2 AND phone=$3', [url, inst.id, row.phone]);
              result.avatars++;
            }
          } catch {}
          await new Promise(r => setTimeout(r, 80));
        }
      } catch(e) { result.errors.push(`Avatars ${inst.name}: ${e.message}`); }

      // ── 3. Conversas antigas (chats) ─────────────────────────────────────────
      try {
        const chatsResp = await evo.fetchChats(inst.name);
        let chats = Array.isArray(chatsResp?.data) ? chatsResp.data : (Array.isArray(chatsResp) ? chatsResp : []);
        console.log(`[SyncAll] ${inst.name}: ${chats.length} chats`);

        for (const chat of chats) {
          const remoteJid = chat.id || chat.remoteJid || '';
          if (!remoteJid.includes('@s.whatsapp.net')) continue; // ignora grupos e broadcasts
          const phone = remoteJid.replace('@s.whatsapp.net','').replace(/:\d+$/,'');
          if (!phone || phone.length < 5) continue;

          const contactName = chat.name || chat.pushName || chat.verifiedName || phone;
          const ts = chat.updatedAt || chat.lastMsgTimestamp;
          const lastMsgAt = ts ? new Date(ts < 1e12 ? ts * 1000 : ts) : new Date();

          // Só cria conversa se não existir nenhuma (aberta ou fechada recente)
          const existing = await db.query(
            `SELECT id FROM wa_conversations WHERE instance_id=$1 AND contact_phone=$2 ORDER BY created_at DESC LIMIT 1`,
            [inst.id, phone]
          );
          let convId;
          if (existing.rows.length > 0) {
            convId = existing.rows[0].id;
            if (contactName && contactName !== phone) {
              await db.query('UPDATE wa_conversations SET contact_name=$1 WHERE id=$2 AND (contact_name IS NULL OR contact_name=contact_phone)', [contactName, convId]).catch(() => {});
            }
          } else {
            const ins = await db.query(
              `INSERT INTO wa_conversations (instance_id, contact_phone, contact_name, status, created_at, updated_at)
               VALUES ($1, $2, $3, 'closed', $4, $4) RETURNING id`,
              [inst.id, phone, contactName, lastMsgAt]
            );
            convId = ins.rows[0].id;
            result.chats++;
          }

          // ── 4. Mensagens desta conversa ────────────────────────────────────
          try {
            const msgsResp = await evo.fetchMessages(inst.name, remoteJid, 40);
            let msgs = [];
            if (Array.isArray(msgsResp?.data?.messages)) msgs = msgsResp.data.messages;
            else if (Array.isArray(msgsResp?.data)) msgs = msgsResp.data;
            else if (Array.isArray(msgsResp)) msgs = msgsResp;

            for (const m of msgs) {
              const msgKey = m.key?.id || m.id || null;
              if (!msgKey) continue;
              const fromMe = m.key?.fromMe ?? m.fromMe ?? false;
              const mts = m.messageTimestamp || m.timestamp;
              const msgAt = mts ? new Date(mts < 1e12 ? mts * 1000 : mts) : new Date();

              const msg = m.message || {};
              let msgType = 'text', body = '';
              if (msg.conversation)               { body = msg.conversation; }
              else if (msg.extendedTextMessage)    { body = msg.extendedTextMessage.text || ''; }
              else if (msg.imageMessage)           { msgType = 'image';    body = msg.imageMessage.caption || '[imagem]'; }
              else if (msg.videoMessage)           { msgType = 'video';    body = msg.videoMessage.caption || '[vídeo]'; }
              else if (msg.audioMessage)           { msgType = 'audio';    body = '[áudio]'; }
              else if (msg.pttMessage)             { msgType = 'audio';    body = '[áudio]'; }
              else if (msg.documentMessage)        { msgType = 'document'; body = msg.documentMessage.fileName || '[arquivo]'; }
              else if (msg.stickerMessage)         { msgType = 'sticker';  body = '[figurinha]'; }
              else continue; // sem conteúdo reconhecível, pula

              await db.query(
                `INSERT INTO wa_messages (conversation_id, body, from_me, created_at, msg_type, external_id)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (external_id) DO NOTHING`,
                [convId, body, fromMe, msgAt, msgType, msgKey]
              ).catch(() => {});
              result.messages++;
            }
          } catch(_) { /* silencioso */ }
        }
      } catch(e) { result.errors.push(`Chats ${inst.name}: ${e.message}`); }
    }

    res.json({ success: true, ...result });
  } catch(e) { next(e); }
});

// ── Resolver LIDs inválidos existentes no banco ────────────────────────────────
router.post('/contacts/fix-lids', async (req, res, next) => {
  try {
    const instances = (await db.query("SELECT * FROM wa_instances WHERE status='connected'")).rows;
    let fixed = 0, failed = 0;

    for (const inst of instances) {
      // Buscar conversas com phone_invalid ou phones que parecem LID (>= 13 dígitos sem código país válido)
      const invalid = await db.query(
        `SELECT id, contact_phone, contact_name FROM wa_conversations
         WHERE instance_id=$1 AND (phone_invalid=true OR (LENGTH(contact_phone) > 13 AND contact_phone ~ '^[0-9]+$'))
         ORDER BY updated_at DESC`,
        [inst.id]
      );
      console.log(`[FixLIDs] ${inst.name}: ${invalid.rows.length} conversas a verificar`);

      for (const conv of invalid.rows) {
        try {
          // Tentar buscar contato via findContacts filtrando pelo LID como número
          const lidJid = conv.contact_phone + '@lid';
          const resolved = await evo.resolveLid(inst.name, lidJid).catch(() => null);
          if (resolved && /^\d{7,15}$/.test(resolved) && resolved !== conv.contact_phone) {
            await db.query(
              'UPDATE wa_conversations SET contact_phone=$1, phone_invalid=false, updated_at=NOW() WHERE id=$2',
              [resolved, conv.id]
            );
            console.log(`[FixLIDs] Conv ${conv.id} (${conv.contact_name}): ${conv.contact_phone} → ${resolved}`);
            fixed++;
          } else {
            failed++;
          }
        } catch(e) { failed++; }
        await new Promise(r => setTimeout(r, 100));
      }
    }
    res.json({ success: true, fixed, failed });
  } catch(e) { next(e); }
});

// ── Listar contatos da agenda do WhatsApp ──────────────────────────────────────

router.get('/contacts', async (req, res, next) => {
  const { q } = req.query;
  try {
    let sql = `SELECT wc.phone, wc.name, wc.avatar_url, wc.instance_id,
                      (SELECT id FROM wa_conversations c2
                       WHERE c2.contact_phone=wc.phone AND c2.instance_id=wc.instance_id
                         AND c2.status != 'closed'
                       ORDER BY c2.created_at DESC LIMIT 1) as open_conv_id
               FROM wa_contacts wc
               WHERE wc.phone ~ '^[0-9]+$'`; // só números reais, filtra IDs internos do Evolution
    const p = [];
    if (q) { p.push('%' + q + '%'); sql += ` AND (wc.name ILIKE $${p.length} OR wc.phone ILIKE $${p.length})`; }
    sql += ' ORDER BY wc.name ASC NULLS LAST';
    const rows = (await db.query(sql, p)).rows;
    res.json(rows);
  } catch(e) {
    // If wa_contacts table doesn't exist yet, return empty
    res.json([]);
  }
});

// ── Profile picture ────────────────────────────────────────────────────────────

router.get('/profile-pic/:phone', async (req, res, next) => {
  try {
    const inst = (await db.query("SELECT * FROM wa_instances WHERE status='connected' ORDER BY id LIMIT 1")).rows[0];
    if (!inst) return res.json({ url: null });
    const resp = await evo.fetchProfilePictureUrl(inst.name, req.params.phone);
    res.json({ url: resp?.data?.profilePictureUrl || resp?.data?.url || null });
  } catch(e) {
    res.json({ url: null }); // Sem foto, sem erro
  }
});

module.exports = router;
