/**
 * Créditos: crédito loja, estornos. Vinculados a clientes. Exige financial write.
 */
const { Router } = require('express');
const db = require('../database/db');
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

const router = Router();
router.use(auth);
router.use(requirePermission('financial', 'write'));

router.get('/', async (req, res, next) => {
  try {
    const { client_id, status, search, start_date, end_date } = req.query;
    const where = [];
    const params = [];
    let idx = 0;

    if (client_id) { where.push(`cc.client_id=$${++idx}`); params.push(client_id); }
    if (status) { where.push(`cc.status=$${++idx}`); params.push(status); }
    if (start_date) { where.push(`cc.created_at >= $${++idx}`); params.push(start_date); }
    if (end_date) { where.push(`cc.created_at <= ($${++idx}::date + interval '1 day')`); params.push(end_date); }
    if (search) {
      where.push(`(cc.number ILIKE $${++idx} OR cc.reason ILIKE $${idx} OR c.name ILIKE $${idx} OR cc.order_number ILIKE $${idx})`);
      params.push(`%${search}%`);
    }

    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await db.query(
      `SELECT cc.*, c.name as client_name, c.phone as client_phone, c.document as client_document,
              u.name as created_by_name
       FROM client_credits cc
       LEFT JOIN clients c ON c.id = cc.client_id
       LEFT JOIN users u ON u.id = cc.created_by
       ${w} ORDER BY cc.created_at DESC LIMIT 500`, params
    );
    res.json(rows.rows);
  } catch(e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const r = await db.query(
      `SELECT cc.*, c.name as client_name, c.phone as client_phone, c.document as client_document,
              c.email as client_email, u.name as created_by_name
       FROM client_credits cc
       LEFT JOIN clients c ON c.id = cc.client_id
       LEFT JOIN users u ON u.id = cc.created_by
       WHERE cc.id=$1`, [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Crédito não encontrado' });
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

router.get('/client/:clientId', async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT cc.*, u.name as created_by_name
       FROM client_credits cc
       LEFT JOIN users u ON u.id = cc.created_by
       WHERE cc.client_id=$1 ORDER BY cc.created_at DESC`, [req.params.clientId]
    );
    const summary = await db.query(
      `SELECT
         COALESCE(SUM(CASE WHEN status='active' THEN balance ELSE 0 END),0) as total_available,
         COALESCE(SUM(amount),0) as total_generated,
         COALESCE(SUM(used_amount),0) as total_used,
         COUNT(*) as total_credits
       FROM client_credits WHERE client_id=$1`, [req.params.clientId]
    );
    res.json({ credits: rows.rows, summary: summary.rows[0] });
  } catch(e) { next(e); }
});

router.patch('/:id/use', async (req, res, next) => {
  const { amount, order_id, order_number } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Valor inválido' });
  const conn = await db.connect();
  try {
    await conn.query('BEGIN');
    const cr = await conn.query('SELECT * FROM client_credits WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!cr.rows.length) return res.status(404).json({ error: 'Crédito não encontrado' });
    const credit = cr.rows[0];
    if (credit.status !== 'active') return res.status(400).json({ error: 'Crédito não está ativo' });
    if (amount > parseFloat(credit.balance)) return res.status(400).json({ error: 'Saldo insuficiente' });

    const newUsed = parseFloat(credit.used_amount) + amount;
    const newBalance = parseFloat(credit.amount) - newUsed;
    const usedOn = Array.isArray(credit.used_on_orders) ? credit.used_on_orders : [];
    usedOn.push({ order_id, order_number, amount, date: new Date().toISOString(), user_id: req.user.id });

    await conn.query(
      `UPDATE client_credits SET used_amount=$1,balance=$2,status=$3,used_on_orders=$4::jsonb WHERE id=$5`,
      [newUsed, newBalance, newBalance <= 0 ? 'exhausted' : 'active', JSON.stringify(usedOn), req.params.id]
    );
    await conn.query('COMMIT');
    const updated = await db.query('SELECT * FROM client_credits WHERE id=$1', [req.params.id]);
    res.json(updated.rows[0]);
  } catch(e) { await conn.query('ROLLBACK'); next(e); }
  finally { conn.release(); }
});

router.patch('/:id/cancel', async (req, res, next) => {
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ error: 'Motivo é obrigatório' });
  try {
    const r = await db.query(
      `UPDATE client_credits SET status='cancelled',notes=COALESCE(notes,'')||E'\nCancelado: '||$1 WHERE id=$2 AND status='active' RETURNING *`,
      [reason, req.params.id]
    );
    if (!r.rows.length) return res.status(400).json({ error: 'Não foi possível cancelar' });
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

module.exports = router;
