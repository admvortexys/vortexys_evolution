'use strict';
const router = require('express').Router();
const db     = require('../database/db');
const auth   = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
router.use(auth);
router.use(requirePermission('financial'));

router.get('/', async (req, res, next) => {
  const { type, paid, month, year } = req.query;
  let q = `SELECT t.*,fc.name as category_name,fc.color as category_color,c.name as client_name
           FROM transactions t
           LEFT JOIN financial_categories fc ON fc.id=t.category_id
           LEFT JOIN clients c ON c.id=t.client_id
           WHERE 1=1`;
  const p = [];
  if (type)  { p.push(type);  q += ` AND t.type=$${p.length}`; }
  if (paid !== undefined && paid !== '') { p.push(paid === 'true'); q += ` AND t.paid=$${p.length}`; }
  if (month && year) {
    p.push(month, year);
    q += ` AND EXTRACT(MONTH FROM t.due_date)=$${p.length-1} AND EXTRACT(YEAR FROM t.due_date)=$${p.length}`;
  }
  q += ' ORDER BY t.due_date ASC';
  try { res.json((await db.query(q, p)).rows); } catch(e) { next(e); }
});

router.get('/summary', async (req, res, next) => {
  const { month, year } = req.query;
  const m = parseInt(month) || new Date().getMonth() + 1;
  const y = parseInt(year)  || new Date().getFullYear();
  try {
    const r = await db.query(
      `SELECT
        COALESCE(SUM(CASE WHEN type='income'  AND paid=true  THEN amount END),0) as income_paid,
        COALESCE(SUM(CASE WHEN type='expense' AND paid=true  THEN amount END),0) as expense_paid,
        COALESCE(SUM(CASE WHEN type='income'  AND paid=false THEN amount END),0) as income_pending,
        COALESCE(SUM(CASE WHEN type='expense' AND paid=false THEN amount END),0) as expense_pending
       FROM transactions
       WHERE EXTRACT(MONTH FROM due_date)=$1 AND EXTRACT(YEAR FROM due_date)=$2`,
      [m, y]
    );
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

// Resumo mensal para gráfico (últimos N meses)
router.get('/monthly', async (req, res, next) => {
  const months = Math.min(parseInt(req.query.months) || 6, 24);
  try {
    const r = await db.query(
      `SELECT
         TO_CHAR(DATE_TRUNC('month', due_date),'YYYY-MM') as month,
         COALESCE(SUM(CASE WHEN type='income'  AND paid=true THEN amount END),0) as income,
         COALESCE(SUM(CASE WHEN type='expense' AND paid=true THEN amount END),0) as expense
       FROM transactions
       WHERE due_date >= DATE_TRUNC('month', NOW()) - INTERVAL '${months - 1} months'
       GROUP BY 1 ORDER BY 1`
    );
    res.json(r.rows);
  } catch(e) { next(e); }
});

router.post('/', async (req, res, next) => {
  const { type, title, amount, due_date, category_id, client_id, notes, paid, paid_date,
          is_recurring, recurrence_type, recurrence_end } = req.body || {};
  if (!type || !title || !amount || !due_date)
    return res.status(400).json({ error: 'type, title, amount e due_date são obrigatórios' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const base = await client.query(
      `INSERT INTO transactions (type,title,amount,due_date,category_id,client_id,notes,paid,paid_date,
                                  is_recurring,recurrence_type,recurrence_end,user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [type, title, amount, due_date, category_id||null, client_id||null, notes||null,
       paid||false, paid_date||null, is_recurring||false, recurrence_type||null, recurrence_end||null, req.user.id]
    );

    // Gera parcelas da recorrência se solicitado
    if (is_recurring && recurrence_type && recurrence_end) {
      const parcelas = buildRecurring(due_date, recurrence_end, recurrence_type);
      for (const d of parcelas) {
        await client.query(
          `INSERT INTO transactions (type,title,amount,due_date,category_id,client_id,notes,paid,is_recurring,recurrence_type,recurrence_end,recurrence_parent_id,user_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,false,$8,$9,$10,$11,$12)`,
          [type, title, amount, d, category_id||null, client_id||null, notes||null,
           true, recurrence_type, recurrence_end, base.rows[0].id, req.user.id]
        );
      }
    }
    await client.query('COMMIT');
    res.status(201).json(base.rows[0]);
  } catch(e) { await client.query('ROLLBACK'); next(e); }
  finally { client.release(); }
});

function buildRecurring(startDate, endDate, type) {
  const dates = [];
  let d = new Date(startDate);
  const end = new Date(endDate);
  let iterations = 0;
  while (iterations++ < 120) {
    if (type === 'monthly')  d.setMonth(d.getMonth() + 1);
    else if (type === 'weekly') d.setDate(d.getDate() + 7);
    else if (type === 'yearly') d.setFullYear(d.getFullYear() + 1);
    else break;
    if (d > end) break;
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

router.patch('/:id/pay', async (req, res, next) => {
  const { paid_date } = req.body || {};
  try {
    const r = await db.query(
      'UPDATE transactions SET paid=true,paid_date=$1,updated_at=NOW() WHERE id=$2 RETURNING *',
      [paid_date || new Date().toISOString().split('T')[0], req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  const { type, title, amount, due_date, category_id, notes, paid, paid_date } = req.body || {};
  try {
    const r = await db.query(
      'UPDATE transactions SET type=$1,title=$2,amount=$3,due_date=$4,category_id=$5,notes=$6,paid=$7,paid_date=$8,updated_at=NOW() WHERE id=$9 RETURNING *',
      [type, title, amount, due_date, category_id||null, notes||null, paid, paid_date||null, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await db.query('DELETE FROM transactions WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch(e) { next(e); }
});

// Deletar todas as recorrências futuras a partir de uma
router.delete('/:id/recurring-forward', async (req, res, next) => {
  try {
    const t = await db.query('SELECT * FROM transactions WHERE id=$1', [req.params.id]);
    if (!t.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    const row = t.rows[0];
    const parentId = row.recurrence_parent_id || row.id;
    await db.query(
      'DELETE FROM transactions WHERE (recurrence_parent_id=$1 OR id=$1) AND paid=false AND due_date >= $2',
      [parentId, row.due_date]
    );
    res.json({ success: true });
  } catch(e) { next(e); }
});

module.exports = router;
