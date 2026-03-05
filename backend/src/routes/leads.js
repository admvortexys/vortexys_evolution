'use strict';
const router = require('express').Router();
const db     = require('../database/db');
const auth   = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
router.use(auth);
router.use(requirePermission('crm'));

async function runAutomations(trigger, leadId) {
  try {
    const rules = await db.query('SELECT * FROM automation_rules WHERE "trigger"=$1 AND active=true', [trigger]);
    const lead = (await db.query('SELECT * FROM leads WHERE id=$1', [leadId])).rows[0];
    if (!lead) return;
    for (const rule of rules.rows) {
      const cond = typeof rule.condition === 'string' ? JSON.parse(rule.condition) : (rule.condition || {});
      const conf = typeof rule.config === 'string' ? JSON.parse(rule.config) : (rule.config || {});
      if (cond.source && cond.source !== lead.source) continue;
      if (cond.pipeline_id && parseInt(cond.pipeline_id) !== lead.pipeline_id) continue;
      if (cond.min_value && parseFloat(lead.estimated_value) < parseFloat(cond.min_value)) continue;
      if (rule.action === 'move_pipeline' && conf.pipeline_id) await db.query('UPDATE leads SET pipeline_id=$1,updated_at=NOW() WHERE id=$2', [conf.pipeline_id, leadId]);
      if (rule.action === 'assign_user' && conf.user_id) await db.query('UPDATE leads SET user_id=$1,updated_at=NOW() WHERE id=$2', [conf.user_id, leadId]);
      if (rule.action === 'create_activity' && conf.activity_title) {
        const due = new Date(); due.setDate(due.getDate() + (parseInt(conf.due_days) || 1));
        await db.query('INSERT INTO activities (lead_id,type,title,description,due_date,user_id) VALUES ($1,$2,$3,$4,$5,$6)',
          [leadId, conf.activity_type || 'task', conf.activity_title, conf.activity_description || '', due, lead.user_id]);
      }
      if (rule.action === 'change_status' && conf.status) await db.query('UPDATE leads SET status=$1,updated_at=NOW() WHERE id=$2', [conf.status, leadId]);
    }
  } catch(e) { console.error('Automation error:', e.message); }
}

router.get('/', async (req, res, next) => {
  const { pipeline_id, status, search, source, user_id, start_date, end_date } = req.query;
  let q = `SELECT l.*,p.name as pipeline_name,p.color as pipeline_color,u.name as user_name
           FROM leads l
           LEFT JOIN pipelines p ON p.id=l.pipeline_id
           LEFT JOIN users u ON u.id=l.user_id
           WHERE 1=1`;
  const params = [];
  if (pipeline_id) { params.push(pipeline_id); q += ` AND l.pipeline_id=$${params.length}`; }
  if (status)      { params.push(status);       q += ` AND l.status=$${params.length}`; }
  if (source)      { params.push(source);       q += ` AND l.source=$${params.length}`; }
  if (user_id)     { params.push(user_id);      q += ` AND l.user_id=$${params.length}`; }
  if (search)      { params.push(`%${search}%`); q += ` AND (l.name ILIKE $${params.length} OR l.company ILIKE $${params.length} OR l.phone ILIKE $${params.length})`; }
  if (start_date)  { params.push(start_date);    q += ` AND l.created_at >= $${params.length}::date`; }
  if (end_date)    { params.push(end_date);      q += ` AND l.created_at < $${params.length}::date + interval '1 day'`; }
  q += ' ORDER BY l.created_at DESC';
  try { res.json((await db.query(q, params)).rows); } catch(e) { next(e); }
});

router.get('/kanban', async (req, res, next) => {
  const { source, user_id, min_value, max_value } = req.query;
  try {
    const pipes = await db.query('SELECT * FROM pipelines ORDER BY position');
    let q = `SELECT l.*,u.name as user_name FROM leads l
             LEFT JOIN users u ON u.id=l.user_id WHERE 1=1`;
    const params = [];
    if (source)    { params.push(source);    q += ` AND l.source=$${params.length}`; }
    if (user_id)   { params.push(user_id);   q += ` AND l.user_id=$${params.length}`; }
    if (min_value) { params.push(min_value); q += ` AND l.estimated_value >= $${params.length}`; }
    if (max_value) { params.push(max_value); q += ` AND l.estimated_value <= $${params.length}`; }
    q += ' ORDER BY l.updated_at DESC';
    const leads = await db.query(q, params);
    res.json(pipes.rows.map(p => ({ ...p, leads: leads.rows.filter(l => l.pipeline_id === p.id) })));
  } catch(e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const l = await db.query(
      `SELECT l.*,p.name as pipeline_name,u.name as user_name,c.name as client_name
       FROM leads l
       LEFT JOIN pipelines p ON p.id=l.pipeline_id
       LEFT JOIN users u ON u.id=l.user_id
       LEFT JOIN clients c ON c.id=l.client_id
       WHERE l.id=$1`,
      [req.params.id]
    );
    if (!l.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    const [acts, events, prods, props] = await Promise.all([
      db.query('SELECT a.*,u.name as user_name FROM activities a LEFT JOIN users u ON u.id=a.user_id WHERE a.lead_id=$1 ORDER BY a.created_at DESC', [req.params.id]),
      db.query('SELECT e.*,u.name as user_name FROM lead_events e LEFT JOIN users u ON u.id=e.user_id WHERE e.lead_id=$1 ORDER BY e.created_at DESC', [req.params.id]),
      db.query('SELECT lp.*,pr.name as product_name,pr.sku,pr.sale_price FROM lead_products lp LEFT JOIN products pr ON pr.id=lp.product_id WHERE lp.lead_id=$1', [req.params.id]),
      db.query('SELECT id,number,title,total,status,created_at FROM proposals WHERE lead_id=$1 ORDER BY created_at DESC', [req.params.id]),
    ]);
    res.json({ ...l.rows[0], activities: acts.rows, events: events.rows, products: prods.rows, proposals: props.rows });
  } catch(e) { next(e); }
});

router.post('/', async (req, res, next) => {
  const { name, company, email, phone, document, source, pipeline_id, estimated_value, probability, expected_close, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'name é obrigatório' });
  try {
    const r = await db.query(
      `INSERT INTO leads (name,company,email,phone,document,source,pipeline_id,estimated_value,probability,expected_close,notes,user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [name, company, email, phone, document, source, pipeline_id, estimated_value || 0, probability || 0, expected_close, notes, req.user.id]
    );
    await db.query('INSERT INTO lead_events (lead_id,type,description,user_id) VALUES ($1,$2,$3,$4)',
      [r.rows[0].id, 'created', 'Lead criado', req.user.id]);
    runAutomations('lead_created', r.rows[0].id);
    res.status(201).json(r.rows[0]);
  } catch(e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  const { name, company, email, phone, document, source, pipeline_id, estimated_value, probability, expected_close, status, lost_reason, notes } = req.body;
  try {
    const old = await db.query('SELECT pipeline_id,status FROM leads WHERE id=$1', [req.params.id]);
    if (!old.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    const r = await db.query(
      `UPDATE leads SET name=$1,company=$2,email=$3,phone=$4,document=$5,source=$6,pipeline_id=$7,
       estimated_value=$8,probability=$9,expected_close=$10,status=$11,lost_reason=$12,
       notes=$13,updated_at=NOW() WHERE id=$14 RETURNING *`,
      [name, company, email, phone, document, source, pipeline_id, estimated_value, probability, expected_close, status, lost_reason, notes, req.params.id]
    );
    if (old.rows[0].pipeline_id !== pipeline_id) {
      const pName = await db.query('SELECT name FROM pipelines WHERE id=$1', [pipeline_id]);
      await db.query('INSERT INTO lead_events (lead_id,type,description,user_id) VALUES ($1,$2,$3,$4)',
        [req.params.id, 'moved', `Movido para ${pName.rows[0]?.name || 'etapa'}`, req.user.id]);
    }
    if (old.rows[0].status !== status && (status === 'won' || status === 'lost')) {
      await db.query('INSERT INTO lead_events (lead_id,type,description,metadata,user_id) VALUES ($1,$2,$3,$4,$5)',
        [req.params.id, status === 'won' ? 'won' : 'lost', status === 'won' ? 'Negocio ganho' : `Negocio perdido: ${lost_reason || 'sem motivo'}`, JSON.stringify({ lost_reason }), req.user.id]);
      runAutomations(status === 'won' ? 'lead_won' : 'lead_lost', req.params.id);
    }
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

router.patch('/:id/move', async (req, res, next) => {
  const { pipeline_id } = req.body;
  if (!pipeline_id) return res.status(400).json({ error: 'pipeline_id é obrigatório' });
  try {
    const pipe = await db.query('SELECT id,name FROM pipelines WHERE id=$1', [pipeline_id]);
    if (!pipe.rows.length) return res.status(400).json({ error: 'Pipeline não encontrado' });
    const r = await db.query('UPDATE leads SET pipeline_id=$1,updated_at=NOW() WHERE id=$2 RETURNING *', [pipeline_id, req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    await db.query('INSERT INTO lead_events (lead_id,type,description,user_id) VALUES ($1,$2,$3,$4)',
      [req.params.id, 'moved', `Movido para ${pipe.rows[0].name}`, req.user.id]);
    runAutomations('lead_moved', req.params.id);
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

router.post('/:id/convert', async (req, res, next) => {
  try {
    const lead = await db.query('SELECT * FROM leads WHERE id=$1', [req.params.id]);
    if (!lead.rows.length) return res.status(404).json({ error: 'Lead não encontrado' });
    const l = lead.rows[0];
    if (l.client_id) return res.json({ client_id: l.client_id, existing: true });
    const c = await db.query(
      'INSERT INTO clients (type,name,document,email,phone,notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      ['client', l.name, l.document, l.email, l.phone, `Convertido de lead #${l.id} — ${l.company || ''}`]
    );
    await db.query('UPDATE leads SET client_id=$1,updated_at=NOW() WHERE id=$2', [c.rows[0].id, req.params.id]);
    await db.query('INSERT INTO lead_events (lead_id,type,description,user_id) VALUES ($1,$2,$3,$4)',
      [req.params.id, 'converted', `Convertido em cliente: ${c.rows[0].name}`, req.user.id]);
    res.status(201).json({ client_id: c.rows[0].id, client: c.rows[0], existing: false });
  } catch(e) { next(e); }
});

router.post('/:id/products', async (req, res, next) => {
  const { product_id, quantity, notes } = req.body;
  if (!product_id) return res.status(400).json({ error: 'product_id é obrigatório' });
  try {
    const r = await db.query(
      'INSERT INTO lead_products (lead_id,product_id,quantity,notes) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.params.id, product_id, quantity || 1, notes]
    );
    res.status(201).json(r.rows[0]);
  } catch(e) { next(e); }
});

router.delete('/:id/products/:prodId', async (req, res, next) => {
  try {
    await db.query('DELETE FROM lead_products WHERE id=$1 AND lead_id=$2', [req.params.prodId, req.params.id]);
    res.json({ success: true });
  } catch(e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await db.query('DELETE FROM leads WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch(e) { next(e); }
});

module.exports = router;
