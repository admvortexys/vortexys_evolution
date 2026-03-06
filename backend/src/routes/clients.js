'use strict';
/**
 * Clientes e fornecedores: CRUD, busca, filtros (tipo, cidade, com pedidos).
 */
const router = require('express').Router();
const db     = require('../database/db');
const auth   = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
router.use(auth);
router.use(requirePermission('clients'));

router.get('/search', async (req, res, next) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  try {
    const r = await db.query(
      `SELECT id,name,document,phone,email,type FROM clients
       WHERE active=true AND (name ILIKE $1 OR document ILIKE $1 OR phone ILIKE $1 OR email ILIKE $1)
       ORDER BY name LIMIT 15`,
      [`%${q}%`]
    );
    res.json(r.rows);
  } catch(e) { next(e); }
});

router.get('/', async (req, res, next) => {
  const { type, search, city, state, has_orders } = req.query;
  let q = `SELECT c.*, 
    (SELECT COUNT(*) FROM orders o WHERE o.client_id=c.id)::int as order_count,
    (SELECT COALESCE(SUM(o.total),0) FROM orders o WHERE o.client_id=c.id) as total_bought,
    (SELECT MAX(o.created_at) FROM orders o WHERE o.client_id=c.id) as last_order
    FROM clients c WHERE c.active=true`;
  const p = [];
  if (type === 'client')   q += ` AND c.type IN ('client','both')`;
  else if (type === 'supplier') q += ` AND c.type IN ('supplier','both')`;
  else if (type === 'both')     { p.push('both'); q += ` AND c.type=$${p.length}`; }
  if (city)   { p.push(city);          q += ` AND c.city ILIKE $${p.length}`; }
  if (state)  { p.push(state);         q += ` AND c.state ILIKE $${p.length}`; }
  if (search) { p.push(`%${search}%`); q += ` AND (c.name ILIKE $${p.length} OR c.document ILIKE $${p.length} OR c.phone ILIKE $${p.length})`; }
  if (has_orders === 'true') q += ` AND EXISTS (SELECT 1 FROM orders o WHERE o.client_id=c.id)`;
  if (has_orders === 'false') q += ` AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.client_id=c.id)`;
  q += ' ORDER BY c.name';
  try { res.json((await db.query(q, p)).rows); } catch(e) { next(e); }
});

router.get('/by-phone/:phone', async (req, res, next) => {
  const phone = (req.params.phone || '').replace(/\D/g, '');
  if (!phone || phone.length < 10) return res.json({ exists: false });
  try {
    const r = await db.query(
      "SELECT id,name,phone,email FROM clients WHERE active=true AND regexp_replace(phone,'[^0-9]','','g') LIKE $1",
      ['%' + phone.slice(-11)]
    );
    if (r.rows[0]) return res.json({ exists: true, client: r.rows[0] });
    res.json({ exists: false });
  } catch(e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const r = await db.query('SELECT * FROM clients WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

router.get('/:id/history', async (req, res, next) => {
  try {
    const [orders, transactions, leads, activities, conversations] = await Promise.all([
      db.query(`SELECT id,number,status,total,created_at FROM orders WHERE client_id=$1 ORDER BY created_at DESC LIMIT 20`, [req.params.id]),
      db.query(`SELECT id,type,title,amount,due_date,paid,paid_date FROM transactions WHERE client_id=$1 ORDER BY due_date DESC LIMIT 20`, [req.params.id]),
      db.query(`SELECT l.id,l.name,l.status,l.estimated_value,l.created_at,p.name as pipeline_name FROM leads l LEFT JOIN pipelines p ON p.id=l.pipeline_id WHERE l.client_id=$1 ORDER BY l.created_at DESC`, [req.params.id]),
      db.query(`SELECT a.*,u.name as user_name FROM activities a LEFT JOIN users u ON u.id=a.user_id WHERE a.client_id=$1 ORDER BY a.created_at DESC LIMIT 20`, [req.params.id]),
      db.query(`SELECT id,contact_phone,contact_name,status,last_message,last_message_at FROM wa_conversations WHERE client_id=$1 ORDER BY updated_at DESC LIMIT 10`, [req.params.id]),
    ]);
    res.json({
      orders: orders.rows,
      transactions: transactions.rows,
      leads: leads.rows,
      activities: activities.rows,
      conversations: conversations.rows,
    });
  } catch(e) { next(e); }
});

router.post('/', async (req, res, next) => {
  const { type, name, document, email, phone, address, city, state, notes, birthday, tags } = req.body;
  if (!name) return res.status(400).json({ error: 'name é obrigatório' });
  try {
    const r = await db.query(
      'INSERT INTO clients (type,name,document,email,phone,address,city,state,notes,birthday,tags) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
      [type || 'client', name, document, email, phone, address, city, state, notes, birthday || null, JSON.stringify(tags || [])]
    );
    res.status(201).json(r.rows[0]);
  } catch(e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  const { type, name, document, email, phone, address, city, state, notes, active, birthday, tags } = req.body;
  try {
    const r = await db.query(
      `UPDATE clients SET type=$1,name=$2,document=$3,email=$4,phone=$5,address=$6,city=$7,state=$8,notes=$9,active=$10,birthday=$11,tags=$12,updated_at=NOW() WHERE id=$13 RETURNING *`,
      [type, name, document, email, phone, address, city, state, notes, active, birthday || null, JSON.stringify(tags || []), req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await db.query('UPDATE clients SET active=false WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch(e) { next(e); }
});

module.exports = router;
