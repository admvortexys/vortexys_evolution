const router = require('express').Router();
const db     = require('../database/db');
const auth = require('../middleware/auth');
router.use(auth);

// ─── Autocomplete ──────────────────────────────────────────────────────────
router.get('/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  try {
    const r = await db.query(
      `SELECT id, name, email, phone, commission FROM sellers
       WHERE active=true AND (name ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1)
       ORDER BY name LIMIT 15`,
      [`%${q}%`]
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── Listar ────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { search, active } = req.query;
  let q = `SELECT s.*,
    COUNT(o.id) FILTER (WHERE DATE_TRUNC('month', o.created_at) = DATE_TRUNC('month', NOW())) AS orders_month,
    COALESCE(SUM(o.total) FILTER (WHERE o.status='delivered' AND DATE_TRUNC('month', o.created_at) = DATE_TRUNC('month', NOW())), 0) AS sales_month
    FROM sellers s
    LEFT JOIN orders o ON o.seller_id = s.id
    WHERE 1=1`;
  const p = [];
  if (active !== undefined) { p.push(active === 'true'); q += ` AND s.active=$${p.length}`; }
  else { q += ` AND s.active=true`; }
  if (search) { p.push(`%${search}%`); q += ` AND (s.name ILIKE $${p.length} OR s.email ILIKE $${p.length} OR s.phone ILIKE $${p.length})`; }
  q += ' GROUP BY s.id ORDER BY s.name';
  try { res.json((await db.query(q, p)).rows); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── Detalhe + histórico de pedidos ────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const s = await db.query('SELECT * FROM sellers WHERE id=$1', [req.params.id]);
    if (!s.rows.length) return res.status(404).json({ error: 'Não encontrado' });

    const orders = await db.query(
      `SELECT o.id, o.code, o.total, o.status, o.created_at,
              c.name AS client_name
       FROM orders o
       LEFT JOIN clients c ON c.id = o.client_id
       WHERE o.seller_id = $1
       ORDER BY o.created_at DESC LIMIT 50`,
      [req.params.id]
    );

    // Comissões por mês (últimos 6 meses)
    const commissions = await db.query(
      `SELECT TO_CHAR(DATE_TRUNC('month', o.created_at), 'YYYY-MM') AS month,
              COALESCE(SUM(o.total * s.commission / 100), 0) AS commission_total,
              COALESCE(SUM(o.total), 0) AS sales_total
       FROM orders o
       JOIN sellers s ON s.id = o.seller_id
       WHERE o.seller_id = $1 AND o.status = 'delivered'
         AND o.created_at >= NOW() - INTERVAL '6 months'
       GROUP BY DATE_TRUNC('month', o.created_at)
       ORDER BY month`,
      [req.params.id]
    );

    res.json({ ...s.rows[0], orders: orders.rows, commissions: commissions.rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── Criar ─────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { name, email, phone, document, commission, goal, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
  try {
    const r = await db.query(
      `INSERT INTO sellers (name, email, phone, document, commission, goal, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name, email, phone, document, commission || 5, goal || 0, notes]
    );
    res.status(201).json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── Atualizar ─────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  const { name, email, phone, document, commission, goal, notes, active } = req.body;
  try {
    const r = await db.query(
      `UPDATE sellers SET name=$1, email=$2, phone=$3, document=$4,
       commission=$5, goal=$6, notes=$7, active=$8, updated_at=NOW()
       WHERE id=$9 RETURNING *`,
      [name, email, phone, document, commission, goal, notes, active, req.params.id]
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── Inativar (soft delete) ────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    await db.query('UPDATE sellers SET active=false, updated_at=NOW() WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
