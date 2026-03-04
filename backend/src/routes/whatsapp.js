'use strict';
const router   = require('express').Router();
const db       = require('../database/db');
const evo      = require('../services/evolutionApi');
const bot      = require('../services/botEngine');
const ws       = require('../services/wsServer');
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

function extractContent(msg) {
  const m = msg.message || {}
  // Evolution v2: base64 pode estar em msg.message.base64 ou msg.base64
  const getB64 = () => msg.message?.base64 || msg.base64 || null;
  if (m.conversation || m.extendedTextMessage)
    return { type:'text', body: m.conversation || m.extendedTextMessage?.text };
  if (m.imageMessage)
    return { type:'image', body: m.imageMessage.caption||'[imagem]',
      mediaBase64: getB64(), mimetype: m.imageMessage.mimetype };
  if (m.audioMessage || m.pttMessage)
    return { type:'audio', body:'[audio]',
      mediaBase64: getB64(), mimetype:'audio/ogg', duration: m.audioMessage?.seconds };
  if (m.videoMessage)
    return { type:'video', body: m.videoMessage.caption||'[video]',
      mediaBase64: getB64(), mimetype: m.videoMessage.mimetype };
  if (m.documentMessage)
    return { type:'document', body: m.documentMessage.fileName||'[documento]',
      mediaBase64: getB64(), mimetype: m.documentMessage.mimetype,
      filename: m.documentMessage.fileName };
  if (m.stickerMessage)
    return { type:'sticker', body:'[sticker]', mediaBase64: msg.message?.base64 };
  if (m.locationMessage)
    return { type:'location', body: `Localizacao: ${m.locationMessage.degreesLatitude},${m.locationMessage.degreesLongitude}` };
  return { type:'text', body:'[mensagem nao suportada]' };
}

async function getConversationFull(convId) {
  const r = await db.query(
    `SELECT c.*,d.name as dept_name,d.color as dept_color,
            u.name as agent_name,i.name as instance_name
     FROM wa_conversations c
     LEFT JOIN wa_departments d ON d.id=c.department_id
     LEFT JOIN users u ON u.id=c.assigned_to
     LEFT JOIN wa_instances i ON i.id=c.instance_id
     WHERE c.id=$1`, [convId]
  );
  return r.rows[0];
}

async function sendAndSave(instanceName, phone, convId, text, isBot, sentBy) {
  const r2 = await evo.sendText(instanceName, phone, text);
  const waId = r2 && r2.data && r2.data.key ? r2.data.key.id : null;
  return db.query(
    "INSERT INTO wa_messages (conversation_id,wa_message_id,direction,type,body,is_bot,sent_by,status) VALUES ($1,$2,'out','text',$3,$4,$5,'sent') RETURNING *",
    [convId, waId, text, isBot || false, sentBy || null]
  );
}

// Webhook (publico)
router.post('/webhook/:instanceName', async (req, res) => {
  res.sendStatus(200);
  const instanceName = req.params.instanceName;
  const payload = req.body;
  try {
    const instRes = await db.query('SELECT * FROM wa_instances WHERE name=$1', [instanceName]);
    const inst = instRes.rows[0];
    if (!inst) return;

    if (payload.event === 'QRCODE_UPDATED' || payload.event === 'qrcode.updated') {
      const qr = payload.data && payload.data.qrcode ? payload.data.qrcode.base64 : null;
      await db.query('UPDATE wa_instances SET qr_code=$1,status=$2,updated_at=NOW() WHERE id=$3',
        [qr, 'qr_code', inst.id]);
      ws.emitInbox({ type:'instance_status', instanceId:inst.id, status:'qr_code', qrCode:qr });
      return;
    }

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

    if (payload.event === 'MESSAGES_UPSERT' || payload.event === 'messages.upsert') {
      console.log('[WA] MESSAGES_UPSERT raw keys:', Object.keys(payload.data || {}));
      // Evolution v2: data.messages[] or data.message or data itself
      let msg = null;
      if (payload.data && payload.data.key) {
        msg = payload.data;
      } else if (payload.data && Array.isArray(payload.data.messages)) {
        msg = payload.data.messages[0];
      } else if (payload.data && payload.data.message) {
        msg = payload.data;
      }
      if (!msg || !msg.key) { console.log('[WA] skipping - no key'); return; }
      if (msg.key.fromMe) {
        // Salva mensagens enviadas pelo celular (fromMe)
        const content2 = extractContent(msg);
        const phone2 = (msg.key.remoteJid||'').replace('@s.whatsapp.net','').replace('@g.us','');
        if (!phone2 || msg.key.remoteJid?.endsWith('@g.us')) return;
        let convRes2 = await db.query('SELECT * FROM wa_conversations WHERE instance_id=$1 AND contact_phone=$2', [inst.id, phone2]);
        if (convRes2.rows[0]) {
          const conv2 = convRes2.rows[0];
          const waId2 = msg.key?.id;
          await db.query(
            "INSERT INTO wa_messages (conversation_id,wa_message_id,direction,type,body,is_bot,status) VALUES ($1,$2,'out',$3,$4,false,'sent') ON CONFLICT (wa_message_id) DO NOTHING",
            [conv2.id, waId2, content2.type, content2.body]
          );
          await db.query('UPDATE wa_conversations SET last_message=$1,last_message_at=NOW(),updated_at=NOW() WHERE id=$2',
            [content2.body?.substring(0,100)||'[mídia]', conv2.id]);
          ws.emitConversation(conv2.id, { type:'message', message:{ conversation_id:conv2.id, wa_message_id:waId2, direction:'out', type:content2.type, body:content2.body, is_bot:false, status:'sent', created_at:new Date() }});
        }
        return;
      }

      const remoteJid = msg.key && msg.key.remoteJid ? msg.key.remoteJid : '';
      const phone = remoteJid.replace('@s.whatsapp.net','').replace('@g.us','');
      if (!phone) return;

      const senderName = msg.pushName || msg.verifiedBizName || phone;

      let convRes = await db.query('SELECT * FROM wa_conversations WHERE instance_id=$1 AND contact_phone=$2', [inst.id, phone]);
      let conv = convRes.rows[0];

      if (!conv) {
        const deptRes = await db.query('SELECT id FROM wa_departments WHERE active=true ORDER BY id LIMIT 1');
        const dept = deptRes.rows[0];
        const newConv = await db.query(
          "INSERT INTO wa_conversations (instance_id,contact_phone,contact_name,department_id,status,bot_active) VALUES ($1,$2,$3,$4,'bot',true) RETURNING *",
          [inst.id, phone, senderName, dept ? dept.id : null]
        );
        conv = newConv.rows[0];
      } else if (senderName && senderName !== phone) {
        await db.query('UPDATE wa_conversations SET contact_name=$1 WHERE id=$2', [senderName, conv.id]);
      }

      const content    = extractContent(msg);
      const waMessageId = msg.key ? msg.key.id : null;

      const saved = await db.query(
        "INSERT INTO wa_messages (conversation_id,wa_message_id,direction,type,body,media_base64,media_mimetype,media_filename,media_duration,is_bot,status) VALUES ($1,$2,'in',$3,$4,$5,$6,$7,$8,false,'delivered') ON CONFLICT (wa_message_id) DO NOTHING RETURNING *",
        [conv.id, waMessageId, content.type, content.body, content.mediaBase64||null,
         content.mimetype||null, content.filename||null, content.duration||null]
      );
      if (!saved.rows.length) return;

      await db.query(
        'UPDATE wa_conversations SET last_message=$1,last_message_at=NOW(),unread_count=unread_count+1,updated_at=NOW() WHERE id=$2',
        [content.body ? content.body.substring(0,100) : '[midia]', conv.id]
      );

      const fullConv = await getConversationFull(conv.id);
      ws.emitInbox({ type:'new_message', conversation:fullConv, message:saved.rows[0] });
      ws.emitConversation(conv.id, { type:'message', message:saved.rows[0] });

      if (conv.bot_active && conv.status === 'bot') {
        const result = await bot.processMessage(conv, saved.rows[0]);
        if (result && result.action === 'escalate') {
          if (result.fallbackMsg) {
            await sendAndSave(inst.name, phone, conv.id, result.fallbackMsg, true, null);
          }
          await db.query("UPDATE wa_conversations SET status='queue',bot_active=false,updated_at=NOW() WHERE id=$1", [conv.id]);
          ws.emitInbox({ type:'conversation_update', conversationId:conv.id, status:'queue' });
        } else if (result && result.reply) {
          await sendAndSave(inst.name, phone, conv.id, result.reply, true, null);
          await db.query('UPDATE wa_conversations SET bot_turns=bot_turns+1,updated_at=NOW() WHERE id=$1', [conv.id]);
        }
      }
    }

    if (payload.event === 'MESSAGES_UPDATE' || payload.event === 'messages.update') {
      const updates = Array.isArray(payload.data) ? payload.data : [];
      for (const upd of updates) {
        const st = upd.update && upd.update.status;
        const status = st === 3 ? 'read' : st === 2 ? 'delivered' : null;
        if (status && upd.key && upd.key.id) {
          await db.query('UPDATE wa_messages SET status=$1 WHERE wa_message_id=$2', [status, upd.key.id]);
          ws.emitInbox({ type:'message_status', waMessageId:upd.key.id, status });
        }
      }
    }
  } catch(e) { console.error('[Webhook] Erro:', e.message); }
});

router.use(auth);
router.use(requirePermission('crm'));

router.get('/instances', async (req, res, next) => {
  try { res.json((await db.query('SELECT * FROM wa_instances ORDER BY id')).rows); } catch(e) { next(e); }
});

router.post('/instances', async (req, res, next) => {
  const name = req.body.name;
  if (!name) return res.status(400).json({ error: 'Nome obrigatorio' });
  try {
    const webhookUrl = 'http://backend:3001/api/whatsapp/webhook/' + name;
    const r = await db.query('INSERT INTO wa_instances (name,webhook_url,status) VALUES ($1,$2,$3) RETURNING *',
      [name, webhookUrl, 'disconnected']);
    evo.createInstance(name, webhookUrl).catch(e => console.warn('Evo:', e.message));
    res.status(201).json(r.rows[0]);
  } catch(e) { next(e); }
});

router.post('/instances/:id/connect', async (req, res, next) => {
  try {
    const inst = (await db.query('SELECT * FROM wa_instances WHERE id=$1', [req.params.id])).rows[0];
    if (!inst) return res.status(404).json({ error: 'Nao encontrado' });
    const webhookUrl = 'http://backend:3001/api/whatsapp/webhook/' + inst.name;
    await evo.setWebhook(inst.name, webhookUrl).catch(() => {});
    await db.query('UPDATE wa_instances SET webhook_url=$1 WHERE id=$2', [webhookUrl, inst.id]);
    const r = await evo.connectInstance(inst.name);
    const qr = r.data ? r.data.base64 : null;
    if (qr) await db.query('UPDATE wa_instances SET qr_code=$1,status=$2 WHERE id=$3', [qr,'qr_code',inst.id]);
    res.json({ qrCode: qr, status: r.data ? r.data.state : 'connecting' });
  } catch(e) { next(e); }
});

router.get('/instances/:id/status', async (req, res, next) => {
  try {
    const inst = (await db.query('SELECT * FROM wa_instances WHERE id=$1', [req.params.id])).rows[0];
    if (!inst) return res.status(404).json({ error: 'Nao encontrado' });
    try {
      const evoR = await evo.getInstanceStatus(inst.name);
      const evoState = evoR && evoR.data && evoR.data.instance ? evoR.data.instance.state : null;
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

router.get('/departments', async (req, res, next) => {
  try {
    const r = await db.query('SELECT * FROM wa_departments WHERE active=true ORDER BY name');
    res.json(r.rows);
  } catch(e) { next(e); }
});

router.post('/departments', async (req, res, next) => {
  const { name, description, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatorio' });
  try {
    const r = await db.query('INSERT INTO wa_departments (name,description,color) VALUES ($1,$2,$3) RETURNING *',
      [name, description||null, color||'#6366f1']);
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

router.get('/conversations', async (req, res, next) => {
  const { status, department_id, assigned_to, search } = req.query;
  let q = "SELECT c.*,d.name as dept_name,d.color as dept_color,u.name as agent_name,i.name as instance_name FROM wa_conversations c LEFT JOIN wa_departments d ON d.id=c.department_id LEFT JOIN users u ON u.id=c.assigned_to LEFT JOIN wa_instances i ON i.id=c.instance_id WHERE 1=1";
  const p = [];
  if (status) { p.push(status); q += ' AND c.status=$' + p.length; }
  if (department_id) { p.push(department_id); q += ' AND c.department_id=$' + p.length; }
  if (assigned_to) { p.push(assigned_to); q += ' AND c.assigned_to=$' + p.length; }
  if (search) { p.push('%' + search + '%'); q += ' AND (c.contact_name ILIKE $' + p.length + ' OR c.contact_phone ILIKE $' + p.length + ')'; }
  q += ' ORDER BY c.last_message_at DESC NULLS LAST LIMIT 100';
  try { res.json((await db.query(q, p)).rows); } catch(e) { next(e); }
});

router.get('/conversations/:id', async (req, res, next) => {
  try {
    const conv = await getConversationFull(req.params.id);
    if (!conv) return res.status(404).json({ error: 'Nao encontrado' });
    res.json(conv);
  } catch(e) { next(e); }
});

router.get('/conversations/:id/messages', async (req, res, next) => {
  const limit = parseInt(req.query.limit) || 50;
  const before = req.query.before;
  let q = "SELECT m.*,u.name as sender_name FROM wa_messages m LEFT JOIN users u ON u.id=m.sent_by WHERE m.conversation_id=$1";
  const p = [req.params.id];
  if (before) { p.push(before); q += ' AND m.id<$' + p.length; }
  p.push(limit);
  q += ' ORDER BY m.created_at DESC LIMIT $' + p.length;
  try {
    const r = await db.query(q, p);
    res.json(r.rows.reverse());
  } catch(e) { next(e); }
});

router.post('/conversations/:id/messages', async (req, res, next) => {
  const { text, quotedId } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Texto obrigatorio' });
  try {
    const convRes = await db.query('SELECT c.*,i.name as instance_name FROM wa_conversations c JOIN wa_instances i ON i.id=c.instance_id WHERE c.id=$1', [req.params.id]);
    const conv = convRes.rows[0];
    if (!conv) return res.status(404).json({ error: 'Conversa nao encontrada' });

    let quotedWaId = null;
    if (quotedId) {
      const qr = await db.query('SELECT wa_message_id FROM wa_messages WHERE id=$1', [quotedId]);
      quotedWaId = qr.rows[0] ? qr.rows[0].wa_message_id : null;
    }

    const evoResp = await evo.sendText(conv.instance_name, conv.contact_phone, text, quotedWaId);
    const waId = evoResp && evoResp.data && evoResp.data.key ? evoResp.data.key.id : null;

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

    ws.emitConversation(conv.id, { type:'message', message:r.rows[0] });
    ws.emitInbox({ type:'conversation_update', conversationId:conv.id, lastMessage:text, status:'active' });
    res.status(201).json(r.rows[0]);
  } catch(e) { next(e); }
});

router.post('/conversations/:id/media', async (req, res, next) => {
  const { mediatype, media, caption, fileName, mimetype } = req.body;
  if (!media || !mediatype) return res.status(400).json({ error: 'Midia obrigatoria' });
  try {
    const convRes = await db.query('SELECT c.*,i.name as instance_name FROM wa_conversations c JOIN wa_instances i ON i.id=c.instance_id WHERE c.id=$1', [req.params.id]);
    const conv = convRes.rows[0];
    if (!conv) return res.status(404).json({ error: 'Nao encontrado' });

    const evoResp = await evo.sendMedia(conv.instance_name, conv.contact_phone, { mediatype, mimetype, media, caption, fileName });
    const waId = evoResp && evoResp.data && evoResp.data.key ? evoResp.data.key.id : null;

    const r = await db.query(
      "INSERT INTO wa_messages (conversation_id,wa_message_id,direction,type,body,media_base64,media_mimetype,media_filename,sent_by,status) VALUES ($1,$2,'out',$3,$4,$5,$6,$7,$8,'sent') RETURNING *",
      [conv.id, waId, mediatype, caption||('['+mediatype+']'), media, mimetype, fileName||null, req.user.id]
    );

    await db.query('UPDATE wa_conversations SET last_message=$1,last_message_at=NOW() WHERE id=$2',
      ['['+mediatype+']', conv.id]);

    ws.emitConversation(conv.id, { type:'message', message:r.rows[0] });
    res.status(201).json(r.rows[0]);
  } catch(e) { next(e); }
});

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

router.patch('/conversations/:id/reopen', async (req, res, next) => {
  try {
    await db.query("UPDATE wa_conversations SET status='queue',updated_at=NOW() WHERE id=$1", [req.params.id]);
    ws.emitInbox({ type:'conversation_update', conversationId:parseInt(req.params.id), status:'queue' });
    res.json({ success:true });
  } catch(e) { next(e); }
});

router.patch('/conversations/:id/read', async (req, res, next) => {
  try {
    const convRes = await db.query('SELECT c.*,i.name as instance_name FROM wa_conversations c JOIN wa_instances i ON i.id=c.instance_id WHERE c.id=$1', [req.params.id]);
    const conv = convRes.rows[0];
    if (conv) {
      await db.query('UPDATE wa_conversations SET unread_count=0 WHERE id=$1', [conv.id]);
      const msgIds = (await db.query("SELECT wa_message_id FROM wa_messages WHERE conversation_id=$1 AND direction='in' LIMIT 20", [conv.id])).rows.map(r => r.wa_message_id).filter(Boolean);
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

router.get('/quick-replies', async (req, res, next) => {
  const q = req.query.q; const deptId = req.query.department_id;
  let sql = 'SELECT * FROM wa_quick_replies WHERE active=true';
  const p = [];
  if (q) { p.push('%'+q+'%'); sql += ' AND (shortcut ILIKE $'+p.length+' OR title ILIKE $'+p.length+' OR body ILIKE $'+p.length+')'; }
  if (deptId) { p.push(deptId); sql += ' AND (department_id=$'+p.length+' OR department_id IS NULL)'; }
  sql += ' ORDER BY shortcut LIMIT 10';
  try { res.json((await db.query(sql, p)).rows); } catch(e) { next(e); }
});

router.post('/quick-replies', async (req, res, next) => {
  const { shortcut, title, body, department_id } = req.body;
  if (!shortcut || !body) return res.status(400).json({ error: 'Atalho e texto obrigatorios' });
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
      [req.params.departmentId, enabled||false, provider||'claude', system_prompt||null, max_turns||10, fallback_msg||'Aguarde, um agente ira atende-lo em breve.']
    );
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});


router.delete('/instances/:id', async (req, res, next) => {
  try {
    const inst = (await db.query('SELECT * FROM wa_instances WHERE id=$1', [req.params.id])).rows[0];
    if (!inst) return res.status(404).json({ error: 'Nao encontrado' });
    evo.deleteInstance(inst.name).catch(() => {});
    await db.query('DELETE FROM wa_instances WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch(e) { next(e); }
});


// ─── Tags ──────────────────────────────────────────────────────────────────
router.get('/tags', async (req, res, next) => {
  try { res.json((await db.query('SELECT * FROM wa_tags ORDER BY name')).rows); } catch(e) { next(e); }
});

router.post('/tags', async (req, res, next) => {
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatorio' });
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

// ─── Auto-criar lead no CRM ────────────────────────────────────────────────
router.post('/conversations/:id/create-lead', async (req, res, next) => {
  try {
    const conv = (await db.query('SELECT * FROM wa_conversations WHERE id=$1', [req.params.id])).rows[0];
    if (!conv) return res.status(404).json({ error: 'Nao encontrado' });
    const pipeline = (await db.query('SELECT id FROM pipelines ORDER BY position LIMIT 1')).rows[0];
    const existing = await db.query('SELECT id FROM leads WHERE phone=$1', [conv.contact_phone]);
    if (existing.rows[0]) return res.json({ lead: existing.rows[0], existing: true });
    const lead = await db.query(
      'INSERT INTO leads (name,phone,source,pipeline_id,user_id,notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [conv.contact_name||conv.contact_phone, conv.contact_phone, 'whatsapp', pipeline?.id||null, req.user.id,
       `Criado automaticamente via WhatsApp`]
    );
    await db.query('UPDATE wa_conversations SET lead_id=$1 WHERE id=$2', [lead.rows[0].id, conv.id]);
    res.status(201).json({ lead: lead.rows[0], existing: false });
  } catch(e) { next(e); }
});


// ─── Nova conversa (iniciar pelo sistema) ─────────────────────────────────
router.post('/conversations/new', async (req, res, next) => {
  const { phone, name, instanceId, departmentId } = req.body;
  if (!phone) return res.status(400).json({ error: 'Telefone obrigatório' });
  const cleanPhone = phone.replace(/\D/g, '');
  try {
    const inst = instanceId
      ? (await db.query('SELECT * FROM wa_instances WHERE id=$1', [instanceId])).rows[0]
      : (await db.query('SELECT * FROM wa_instances WHERE active=true LIMIT 1')).rows[0];
    if (!inst) return res.status(400).json({ error: 'Nenhuma instância conectada' });

    // Verifica se já existe
    let convRes = await db.query('SELECT * FROM wa_conversations WHERE instance_id=$1 AND contact_phone=$2', [inst.id, cleanPhone]);
    if (convRes.rows[0]) return res.json(convRes.rows[0]);

    // Cria nova
    const r = await db.query(
      "INSERT INTO wa_conversations (instance_id,contact_phone,contact_name,department_id,status,bot_active) VALUES ($1,$2,$3,$4,'queue',false) RETURNING *",
      [inst.id, cleanPhone, name || cleanPhone, departmentId || null]
    );
    res.status(201).json(r.rows[0]);
  } catch(e) { next(e); }
});

// ─── Buscar contatos (clientes + leads + conversas existentes) ─────────────
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
    // Deduplica por phone
    const seen = new Set();
    const results = [...clients.rows, ...leads.rows, ...convs.rows].filter(r => {
      const key = (r.phone||'').replace(/\D/g,'');
      if (!key || seen.has(key)) return false;
      seen.add(key); return true;
    });
    res.json(results);
  } catch(e) { next(e); }
});

module.exports = router;
