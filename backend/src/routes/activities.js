'use strict';
const router = require('express').Router();
const db     = require('../database/db');
const auth   = require('../middleware/auth');
const { requireAnyPermission } = require('../middleware/rbac');
router.use(auth);
router.use(requireAnyPermission(['crm', 'calendar']));

const EVENT_TYPES = {
  task:       { label:'Tarefa',           color:'#6366f1' },
  call:       { label:'Ligação',          color:'#3b82f6' },
  meeting:    { label:'Reunião',          color:'#8b5cf6' },
  followup:   { label:'Follow-up',        color:'#f59e0b' },
  delivery:   { label:'Entrega',          color:'#10b981' },
  service:    { label:'Assistência/OS',   color:'#ef4444' },
  billing:    { label:'Cobrança',         color:'#f97316' },
  birthday:   { label:'Aniversário',      color:'#ec4899' },
  recurring:  { label:'Recorrente',       color:'#6b7280' },
  visit:      { label:'Visita',           color:'#14b8a6' },
  demo:       { label:'Demonstração',     color:'#a855f7' },
  whatsapp:   { label:'WhatsApp',         color:'#22c55e' },
  note:       { label:'Nota',             color:'#64748b' },
  email:      { label:'E-mail',           color:'#0ea5e9' },
  internal:   { label:'Interno',          color:'#78716c' },
};

// ── Metadata ──
router.get('/meta', (req, res) => res.json({ event_types: EVENT_TYPES }));

// ── Listar com filtros ──
router.get('/', async (req, res, next) => {
  const { lead_id, client_id, done, user_id, event_type, order_id } = req.query;
  let q = `SELECT a.*,u.name as user_name,l.name as lead_name,c.name as client_name,
    o.number as order_number, s.name as seller_name
    FROM activities a
    LEFT JOIN users u ON u.id=a.user_id
    LEFT JOIN leads l ON l.id=a.lead_id
    LEFT JOIN clients c ON c.id=a.client_id
    LEFT JOIN orders o ON o.id=a.order_id
    LEFT JOIN sellers s ON s.id=a.seller_id
    WHERE 1=1`;
  const p = [];
  if (lead_id)    { p.push(lead_id);    q += ` AND a.lead_id=$${p.length}`; }
  if (client_id)  { p.push(client_id);  q += ` AND a.client_id=$${p.length}`; }
  if (user_id)    { p.push(user_id);    q += ` AND a.user_id=$${p.length}`; }
  if (event_type) { p.push(event_type); q += ` AND a.event_type=$${p.length}`; }
  if (order_id)   { p.push(order_id);   q += ` AND a.order_id=$${p.length}`; }
  if (done !== undefined) { p.push(done === 'true'); q += ` AND a.done=$${p.length}`; }
  q += ' ORDER BY a.due_date ASC NULLS LAST, a.created_at DESC';
  try { res.json((await db.query(q, p)).rows); } catch(e) { next(e); }
});

// ── Pendentes do usuário ──
router.get('/pending', async (req, res, next) => {
  try {
    const r = await db.query(
      `SELECT a.*,l.name as lead_name,c.name as client_name,o.number as order_number
       FROM activities a
       LEFT JOIN leads l ON l.id=a.lead_id
       LEFT JOIN clients c ON c.id=a.client_id
       LEFT JOIN orders o ON o.id=a.order_id
       WHERE a.done=false AND a.user_id=$1 AND (a.due_date IS NULL OR a.due_date <= NOW() + interval '1 day')
       ORDER BY a.due_date ASC NULLS LAST LIMIT 20`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch(e) { next(e); }
});

router.get('/pending-count', async (req, res, next) => {
  try {
    const r = await db.query(
      'SELECT COUNT(*)::int as count FROM activities WHERE done=false AND user_id=$1 AND due_date <= NOW()',
      [req.user.id]
    );
    res.json({ count: r.rows[0].count });
  } catch(e) { next(e); }
});

// ── Calendário (mês) ──
router.get('/calendar', async (req, res, next) => {
  const { month, year } = req.query;
  const m = parseInt(month) || new Date().getMonth() + 1;
  const y = parseInt(year) || new Date().getFullYear();
  try {
    const r = await db.query(
      `SELECT a.*,l.name as lead_name,c.name as client_name,u.name as user_name,
        o.number as order_number, s.name as seller_name
       FROM activities a
       LEFT JOIN leads l ON l.id=a.lead_id
       LEFT JOIN clients c ON c.id=a.client_id
       LEFT JOIN users u ON u.id=a.user_id
       LEFT JOIN orders o ON o.id=a.order_id
       LEFT JOIN sellers s ON s.id=a.seller_id
       WHERE a.due_date IS NOT NULL
         AND EXTRACT(YEAR FROM a.due_date)=$1
         AND EXTRACT(MONTH FROM a.due_date)=$2
       ORDER BY a.due_date ASC`,
      [y, m]
    );
    res.json(r.rows);
  } catch(e) { next(e); }
});

// ── Próximos eventos (hoje + futuro) ──
router.get('/upcoming', async (req, res, next) => {
  const days = parseInt(req.query.days) || 7;
  try {
    const r = await db.query(
      `SELECT a.*,l.name as lead_name,c.name as client_name,u.name as user_name,
        o.number as order_number, s.name as seller_name
       FROM activities a
       LEFT JOIN leads l ON l.id=a.lead_id
       LEFT JOIN clients c ON c.id=a.client_id
       LEFT JOIN users u ON u.id=a.user_id
       LEFT JOIN orders o ON o.id=a.order_id
       LEFT JOIN sellers s ON s.id=a.seller_id
       WHERE a.done=false AND a.due_date IS NOT NULL
         AND a.due_date >= CURRENT_DATE
         AND a.due_date < CURRENT_DATE + ($1 * INTERVAL '1 day')
       ORDER BY a.due_date ASC LIMIT 50`,
      [days]
    );
    res.json(r.rows);
  } catch(e) { next(e); }
});

// ── Criar evento ──
router.post('/', async (req, res, next) => {
  const { lead_id, client_id, type, event_type, title, description, due_date, end_date, all_day,
          order_id, transaction_id, seller_id, priority, color, recurrence,
          wa_scheduled, wa_send_at, wa_phone, wa_message, wa_template } = req.body;
  if (!title) return res.status(400).json({ error: 'Título é obrigatório' });
  try {
    const r = await db.query(
      `INSERT INTO activities (lead_id,client_id,type,event_type,title,description,due_date,end_date,all_day,
        order_id,transaction_id,seller_id,priority,color,recurrence,
        wa_scheduled,wa_send_at,wa_phone,wa_message,wa_template,wa_status,user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING *`,
      [lead_id||null, client_id||null, type||event_type||'task', event_type||type||'task',
       title, description||null, due_date||null, end_date||null, all_day||false,
       order_id||null, transaction_id||null, seller_id||null, priority||'normal', color||null, recurrence||null,
       wa_scheduled||false, wa_send_at||null, wa_phone||null, wa_message||null, wa_template||null,
       wa_scheduled ? 'scheduled' : 'pending', req.user.id]
    );
    if (lead_id) {
      await db.query('INSERT INTO lead_events (lead_id,type,description,user_id) VALUES ($1,$2,$3,$4)',
        [lead_id, 'activity', `Atividade: ${title}`, req.user.id]);
    }
    res.status(201).json(r.rows[0]);
  } catch(e) { next(e); }
});

// ── Editar evento ──
router.put('/:id', async (req, res, next) => {
  const { lead_id, client_id, type, event_type, title, description, due_date, end_date, all_day,
          order_id, transaction_id, seller_id, priority, color, recurrence,
          wa_scheduled, wa_send_at, wa_phone, wa_message, wa_template } = req.body;
  try {
    const r = await db.query(
      `UPDATE activities SET lead_id=$1,client_id=$2,type=COALESCE($3,type),event_type=COALESCE($4,event_type),
        title=$5,description=$6,due_date=$7,end_date=$8,all_day=$9,
        order_id=$10,transaction_id=$11,seller_id=$12,priority=$13,color=$14,recurrence=$15,
        wa_scheduled=$16,wa_send_at=$17,wa_phone=$18,wa_message=$19,wa_template=$20
       WHERE id=$21 RETURNING *`,
      [lead_id||null, client_id||null, type||null, event_type||null,
       title, description||null, due_date||null, end_date||null, all_day||false,
       order_id||null, transaction_id||null, seller_id||null, priority||'normal', color||null, recurrence||null,
       wa_scheduled||false, wa_send_at||null, wa_phone||null, wa_message||null, wa_template||null,
       req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

// ── Marcar concluído ──
router.patch('/:id/done', async (req, res, next) => {
  try {
    const r = await db.query(
      'UPDATE activities SET done=true,completed_at=NOW(),completed_by=$1 WHERE id=$2 RETURNING *',
      [req.user.id, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

// ── Reabrir ──
router.patch('/:id/reopen', async (req, res, next) => {
  try {
    const r = await db.query(
      'UPDATE activities SET done=false,completed_at=NULL,completed_by=NULL WHERE id=$1 RETURNING *',
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

// ── Mover (drag & drop) ──
router.patch('/:id/move', async (req, res, next) => {
  const { due_date } = req.body;
  if (!due_date) return res.status(400).json({ error: 'due_date obrigatório' });
  try {
    const r = await db.query('UPDATE activities SET due_date=$1 WHERE id=$2 RETURNING *', [due_date, req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

// ── WhatsApp: marcar como enviado ──
router.patch('/:id/wa-sent', async (req, res, next) => {
  const { error } = req.body || {};
  try {
    if (error) {
      await db.query('UPDATE activities SET wa_status=$1,wa_error=$2 WHERE id=$3', ['failed', error, req.params.id]);
    } else {
      await db.query('UPDATE activities SET wa_status=$1,wa_sent_at=NOW() WHERE id=$2', ['sent', req.params.id]);
    }
    res.json({ success: true });
  } catch(e) { next(e); }
});

// ── WhatsApp: enviar agora (usa evolutionApi como serviceOrders) ──
router.post('/:id/wa-send', async (req, res, next) => {
  try {
    const evo = require('../services/evolutionApi');
    const act = (await db.query('SELECT * FROM activities WHERE id=$1', [req.params.id])).rows[0];
    if (!act) return res.status(404).json({ error: 'Não encontrado' });
    if (!act.wa_phone || !act.wa_message) return res.status(400).json({ error: 'Telefone e mensagem são obrigatórios' });

    const inst = (await db.query("SELECT * FROM wa_instances WHERE status='connected' AND active=true ORDER BY id LIMIT 1")).rows[0];
    if (!inst) return res.status(400).json({ error: 'Nenhuma instância WhatsApp conectada' });

    const phone = act.wa_phone.replace(/\D/g, '');
    const phoneNorm = phone.startsWith('55') ? phone : '55' + phone;
    const evoResp = await evo.sendText(inst.name, phoneNorm, act.wa_message);
    if (evoResp?.status >= 200 && evoResp?.status < 300) {
      await db.query('UPDATE activities SET wa_status=$1,wa_sent_at=NOW() WHERE id=$2', ['sent', act.id]);
      res.json({ success: true, data: evoResp?.data });
    } else {
      const errMsg = evoResp?.data?.message || 'Erro ao enviar';
      await db.query('UPDATE activities SET wa_status=$1,wa_error=$2 WHERE id=$3', ['failed', errMsg, act.id]);
      res.status(400).json({ error: errMsg });
    }
  } catch(e) { next(e); }
});

// ── Excluir ──
router.delete('/:id', async (req, res, next) => {
  try {
    await db.query('DELETE FROM activities WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch(e) { next(e); }
});

module.exports = router;
