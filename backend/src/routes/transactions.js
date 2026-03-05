'use strict';
const router = require('express').Router();
const db     = require('../database/db');
const auth   = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { validate, schemas } = require('../middleware/validate');
router.use(auth);
router.use(requirePermission('financial'));

const PAY_METHODS = ['dinheiro','pix','debito','credito','boleto','transferencia','cheque','credito_loja','outro'];
const ACCOUNT_TYPES = ['cash','bank','card_machine','pix','other'];

// ── Listar transações com filtros avançados ──────────────────────────────────
router.get('/', async (req, res, next) => {
  const { type, paid, month, year, account_id, payment_method, client_id, seller_id, order_id, overdue, search } = req.query;
  let q = `SELECT t.*,
    fc.name as category_name, fc.color as category_color,
    c.name as client_name, s.name as seller_name,
    fa.name as account_name,
    o.number as order_number
    FROM transactions t
    LEFT JOIN financial_categories fc ON fc.id=t.category_id
    LEFT JOIN clients c ON c.id=t.client_id
    LEFT JOIN sellers s ON s.id=t.seller_id
    LEFT JOIN financial_accounts fa ON fa.id=t.account_id
    LEFT JOIN orders o ON o.id=t.order_id
    WHERE 1=1`;
  const p = [];
  if (type) { p.push(type); q += ` AND t.type=$${p.length}`; }
  if (paid !== undefined && paid !== '') { p.push(paid === 'true'); q += ` AND t.paid=$${p.length}`; }
  if (account_id) { p.push(account_id); q += ` AND t.account_id=$${p.length}`; }
  if (payment_method) { p.push(payment_method); q += ` AND t.payment_method=$${p.length}`; }
  if (client_id) { p.push(client_id); q += ` AND t.client_id=$${p.length}`; }
  if (seller_id) { p.push(seller_id); q += ` AND t.seller_id=$${p.length}`; }
  if (order_id) { p.push(order_id); q += ` AND t.order_id=$${p.length}`; }
  if (overdue === 'true') q += ` AND t.paid=false AND t.due_date < CURRENT_DATE`;
  if (search) { p.push(`%${search}%`); q += ` AND (t.title ILIKE $${p.length} OR c.name ILIKE $${p.length} OR o.number ILIKE $${p.length})`; }
  if (month && year) {
    p.push(month, year);
    q += ` AND EXTRACT(MONTH FROM t.due_date)=$${p.length-1} AND EXTRACT(YEAR FROM t.due_date)=$${p.length}`;
  }
  q += ' ORDER BY t.due_date ASC, t.id ASC';
  try { res.json((await db.query(q, p)).rows); } catch(e) { next(e); }
});

// ── Resumo do período ────────────────────────────────────────────────────────
router.get('/summary', async (req, res, next) => {
  const { month, year } = req.query;
  const m = parseInt(month) || new Date().getMonth() + 1;
  const y = parseInt(year)  || new Date().getFullYear();
  try {
    const [tx, crm, osRev] = await Promise.all([
      db.query(
        `SELECT
          (COALESCE(SUM(CASE WHEN type='income'  AND paid=true  THEN COALESCE(paid_amount,amount) END),0)
           + COALESCE((SELECT SUM(o.total) FROM orders o
               LEFT JOIN transactions tx ON tx.order_id=o.id AND tx.type='income'
               WHERE o.status NOT IN ('draft','cancelled','returned') AND tx.id IS NULL
                 AND EXTRACT(MONTH FROM o.created_at)=$1 AND EXTRACT(YEAR FROM o.created_at)=$2),0)) as income_paid,
          COALESCE(SUM(CASE WHEN type='expense' AND paid=true  THEN COALESCE(paid_amount,amount) END),0) as expense_paid,
          COALESCE(SUM(CASE WHEN type='income'  AND paid=false THEN amount END),0) as income_pending,
          COALESCE(SUM(CASE WHEN type='expense' AND paid=false THEN amount END),0) as expense_pending,
          COALESCE(SUM(CASE WHEN type='income'  AND paid=false AND due_date < CURRENT_DATE THEN amount END),0) as income_overdue,
          COALESCE(SUM(CASE WHEN type='expense' AND paid=false AND due_date < CURRENT_DATE THEN amount END),0) as expense_overdue,
          COALESCE(SUM(CASE WHEN paid=true THEN COALESCE(fee_amount,0) END),0) as total_fees,
          COUNT(CASE WHEN paid=false AND due_date < CURRENT_DATE THEN 1 END)::int as overdue_count
         FROM transactions
         WHERE EXTRACT(MONTH FROM due_date)=$1 AND EXTRACT(YEAR FROM due_date)=$2`,
        [m, y]
      ),
      db.query(
        `SELECT COALESCE(SUM(CASE WHEN status='won' THEN estimated_value END),0) as crm_won_value
         FROM leads
         WHERE EXTRACT(MONTH FROM created_at)=$1 AND EXTRACT(YEAR FROM created_at)=$2`,
        [m, y]
      ),
      db.query(
        `SELECT COALESCE(SUM(
          (SELECT SUM((COALESCE(soi.quantity,1) * COALESCE(soi.unit_price,0)) - COALESCE(soi.discount,0))
           FROM service_order_items soi WHERE soi.service_order_id=so.id)
        ),0) as os_revenue
         FROM service_orders so
         WHERE so.status='delivered'
           AND EXTRACT(MONTH FROM so.delivered_at)=$1 AND EXTRACT(YEAR FROM so.delivered_at)=$2`,
        [m, y]
      )
    ]);
    const row = tx.rows[0] || {};
    row.crm_won_value = parseFloat(crm.rows[0]?.crm_won_value || 0);
    row.os_revenue = parseFloat(osRev.rows[0]?.os_revenue || 0);
    res.json(row);
  } catch(e) { next(e); }
});

// ── Evolução mensal ──────────────────────────────────────────────────────────
router.get('/monthly-evolution', async (req, res, next) => {
  try {
    const r = await db.query(
      `SELECT
         EXTRACT(MONTH FROM due_date)::int as month,
         EXTRACT(YEAR FROM due_date)::int as year,
         COALESCE(SUM(CASE WHEN type='income'  AND paid=true THEN COALESCE(paid_amount,amount) END),0) as income,
         COALESCE(SUM(CASE WHEN type='expense' AND paid=true THEN COALESCE(paid_amount,amount) END),0) as expense
       FROM transactions
       WHERE due_date >= DATE_TRUNC('month', NOW()) - INTERVAL '5 months'
       GROUP BY 1,2 ORDER BY 2,1`
    );
    res.json(r.rows);
  } catch(e) { next(e); }
});

// ── Por categoria ────────────────────────────────────────────────────────────
router.get('/by-category', async (req, res, next) => {
  const { month, year } = req.query;
  const m = parseInt(month) || new Date().getMonth() + 1;
  const y = parseInt(year) || new Date().getFullYear();
  try {
    const r = await db.query(
      `SELECT fc.name, fc.color, t.type,
              COALESCE(SUM(t.amount),0) as total
       FROM transactions t
       LEFT JOIN financial_categories fc ON fc.id=t.category_id
       WHERE EXTRACT(MONTH FROM t.due_date)=$1 AND EXTRACT(YEAR FROM t.due_date)=$2
       GROUP BY fc.name,fc.color,t.type ORDER BY total DESC`,
      [m, y]
    );
    res.json(r.rows);
  } catch(e) { next(e); }
});

// ── Por forma de pagamento ───────────────────────────────────────────────────
router.get('/by-method', async (req, res, next) => {
  const { month, year } = req.query;
  const m = parseInt(month) || new Date().getMonth() + 1;
  const y = parseInt(year) || new Date().getFullYear();
  try {
    const r = await db.query(
      `SELECT payment_method, type,
              COUNT(*)::int as count,
              COALESCE(SUM(COALESCE(paid_amount,amount)),0) as total,
              COALESCE(SUM(fee_amount),0) as fees
       FROM transactions
       WHERE paid=true AND EXTRACT(MONTH FROM due_date)=$1 AND EXTRACT(YEAR FROM due_date)=$2
         AND payment_method IS NOT NULL
       GROUP BY payment_method, type ORDER BY total DESC`,
      [m, y]
    );
    res.json(r.rows);
  } catch(e) { next(e); }
});

// ── Recorrentes ──────────────────────────────────────────────────────────────
router.get('/recurring', async (req, res, next) => {
  try {
    const r = await db.query(
      `SELECT t.*,fc.name as category_name
       FROM transactions t
       LEFT JOIN financial_categories fc ON fc.id=t.category_id
       WHERE t.is_recurring=true AND t.recurrence_parent_id IS NULL
       ORDER BY t.title`
    );
    res.json(r.rows);
  } catch(e) { next(e); }
});

router.post('/recurring', async (req, res, next) => {
  const { type, title, amount, category_id, day_of_month, frequency, notes } = req.body || {};
  if (!title || !amount) return res.status(400).json({ error: 'Título e valor são obrigatórios' });
  try {
    const r = await db.query(
      `INSERT INTO transactions (type,title,amount,due_date,category_id,notes,is_recurring,recurrence_type,user_id)
       VALUES ($1,$2,$3,NOW(),$4,$5,true,$6,$7) RETURNING *`,
      [type||'expense', title, amount, category_id||null, notes||null, frequency||'monthly', req.user.id]
    );
    res.status(201).json(r.rows[0]);
  } catch(e) { next(e); }
});

router.put('/recurring/:id', async (req, res, next) => {
  const { type, title, amount, category_id, day_of_month, frequency, notes } = req.body || {};
  try {
    const r = await db.query(
      'UPDATE transactions SET type=$1,title=$2,amount=$3,category_id=$4,recurrence_type=$5,notes=$6,updated_at=NOW() WHERE id=$7 RETURNING *',
      [type, title, amount, category_id||null, frequency, notes||null, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

router.delete('/recurring/:id', async (req, res, next) => {
  try {
    await db.query('UPDATE transactions SET is_recurring=false WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch(e) { next(e); }
});

router.post('/recurring/:id/generate', async (req, res, next) => {
  const { month, year } = req.body || {};
  try {
    const t = await db.query('SELECT * FROM transactions WHERE id=$1', [req.params.id]);
    if (!t.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    const tmpl = t.rows[0];
    const day = tmpl.day_of_month || 1;
    const dueDate = `${year}-${String(month).padStart(2,'0')}-${String(Math.min(day,28)).padStart(2,'0')}`;
    const existing = await db.query(
      'SELECT id FROM transactions WHERE recurrence_parent_id=$1 AND due_date=$2',
      [tmpl.id, dueDate]
    );
    if (existing.rows.length) return res.status(409).json({ error: 'Já existe lançamento para este mês' });
    const r = await db.query(
      `INSERT INTO transactions (type,title,amount,due_date,category_id,client_id,notes,is_recurring,recurrence_type,recurrence_parent_id,user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9,$10) RETURNING *`,
      [tmpl.type, tmpl.title, tmpl.amount, dueDate, tmpl.category_id, tmpl.client_id, tmpl.notes,
       tmpl.recurrence_type, tmpl.id, req.user.id]
    );
    res.status(201).json(r.rows[0]);
  } catch(e) { next(e); }
});

// ── Criar transação ──────────────────────────────────────────────────────────
router.post('/', validate(schemas.createTransaction), async (req, res, next) => {
  const { type, title, amount, due_date, category_id, client_id, notes, paid, paid_date,
          is_recurring, recurrence_type, recurrence_end,
          account_id, payment_method, installment_total, seller_id, order_id, document_ref,
          fee_amount, discount_amount } = req.validated;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const instTotal = parseInt(installment_total) || 1;

    if (instTotal > 1) {
      const baseDate = new Date(due_date);
      const results = [];
      for (let i = 0; i < instTotal; i++) {
        const d = new Date(baseDate);
        d.setMonth(d.getMonth() + i);
        const parcAmt = (parseFloat(amount) / instTotal).toFixed(2);
        const r = await client.query(
          `INSERT INTO transactions (type,title,amount,original_amount,due_date,category_id,client_id,notes,paid,paid_date,
            account_id,payment_method,installment_number,installment_total,seller_id,order_id,document_ref,
            fee_amount,discount_amount,user_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
          [type, `${title} (${i+1}/${instTotal})`, parcAmt, amount, d.toISOString().split('T')[0],
           category_id||null, client_id||null, notes||null, i===0 && paid ? true : false, i===0 && paid ? (paid_date||new Date().toISOString().split('T')[0]) : null,
           account_id||null, payment_method||null, i+1, instTotal,
           seller_id||null, order_id||null, document_ref||null,
           i===0 ? (fee_amount||0) : 0, i===0 ? (discount_amount||0) : 0, req.user.id]
        );
        results.push(r.rows[0]);
      }
      await client.query('COMMIT');
      res.status(201).json(results[0]);
    } else {
      const base = await client.query(
        `INSERT INTO transactions (type,title,amount,original_amount,due_date,category_id,client_id,notes,paid,paid_date,
          is_recurring,recurrence_type,recurrence_end,
          account_id,payment_method,installment_number,installment_total,seller_id,order_id,document_ref,
          fee_amount,discount_amount,user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) RETURNING *`,
        [type, title, amount, amount, due_date, category_id||null, client_id||null, notes||null,
         paid||false, paid_date||null, is_recurring||false, recurrence_type||null, recurrence_end||null,
         account_id||null, payment_method||null, 1, 1, seller_id||null, order_id||null, document_ref||null,
         fee_amount||0, discount_amount||0, req.user.id]
      );

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
    }
  } catch(e) { await client.query('ROLLBACK'); next(e); }
  finally { client.release(); }
});

function buildRecurring(startDate, endDate, recurrenceType) {
  const dates = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  for (let i = 1; i <= 120; i++) {
    const d = new Date(start);
    if (recurrenceType === 'monthly')  d.setMonth(d.getMonth() + i);
    else if (recurrenceType === 'weekly') d.setDate(d.getDate() + 7 * i);
    else if (recurrenceType === 'yearly') d.setFullYear(d.getFullYear() + i);
    else break;
    if (d > end) break;
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

// ── Baixar/Receber (com pagamento parcial e misto) ───────────────────────────
router.patch('/:id/pay', async (req, res, next) => {
  const { paid_date, paid_amount, payment_method, account_id, fee_amount, discount_amount, interest_amount, notes } = req.body || {};
  try {
    const orig = await db.query('SELECT * FROM transactions WHERE id=$1', [req.params.id]);
    if (!orig.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    const t = orig.rows[0];
    if (t.paid) return res.status(400).json({ error: 'Já está pago' });

    const finalPaid = parseFloat(paid_amount) || parseFloat(t.amount);
    const r = await db.query(
      `UPDATE transactions SET paid=true, paid_date=$1, paid_amount=$2,
        payment_method=COALESCE($3,payment_method), account_id=COALESCE($4,account_id),
        fee_amount=COALESCE($5,fee_amount), discount_amount=COALESCE($6,discount_amount),
        interest_amount=COALESCE($7,interest_amount),
        notes=CASE WHEN $8 IS NOT NULL THEN COALESCE(notes,'')||E'\n'||$8 ELSE notes END,
        overdue=false, updated_at=NOW()
       WHERE id=$9 RETURNING *`,
      [paid_date || new Date().toISOString().split('T')[0], finalPaid,
       payment_method||null, account_id||null, fee_amount||null, discount_amount||null, interest_amount||null,
       notes||null, req.params.id]
    );
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

// ── Estornar ─────────────────────────────────────────────────────────────────
router.patch('/:id/reverse', async (req, res, next) => {
  const { reason } = req.body || {};
  try {
    const orig = await db.query('SELECT * FROM transactions WHERE id=$1', [req.params.id]);
    if (!orig.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    const t = orig.rows[0];
    if (!t.paid) return res.status(400).json({ error: 'Não está pago — não pode estornar' });

    await db.query(
      `UPDATE transactions SET paid=false, paid_date=NULL, paid_amount=NULL,
        notes=COALESCE(notes,'')||E'\n[ESTORNO '||NOW()::text||'] '||COALESCE($1,''),
        updated_at=NOW() WHERE id=$2`,
      [reason||'', req.params.id]
    );
    res.json({ success: true });
  } catch(e) { next(e); }
});

// ── Editar ───────────────────────────────────────────────────────────────────
router.put('/:id', async (req, res, next) => {
  const { type, title, amount, due_date, category_id, client_id, notes, paid, paid_date,
          account_id, payment_method, seller_id, order_id, document_ref, fee_amount, discount_amount } = req.body || {};
  try {
    const r = await db.query(
      `UPDATE transactions SET type=$1,title=$2,amount=$3,due_date=$4,category_id=$5,
        client_id=$6,notes=$7,paid=$8,paid_date=$9,account_id=$10,payment_method=$11,
        seller_id=$12,order_id=$13,document_ref=$14,fee_amount=$15,discount_amount=$16,
        updated_at=NOW() WHERE id=$17 RETURNING *`,
      [type, title, amount, due_date, category_id||null, client_id||null, notes||null,
       paid, paid_date||null, account_id||null, payment_method||null,
       seller_id||null, order_id||null, document_ref||null, fee_amount||0, discount_amount||0, req.params.id]
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

// ── Contas financeiras ───────────────────────────────────────────────────────
router.get('/accounts', async (req, res, next) => {
  try {
    const r = await db.query(
      `SELECT fa.*,
        COALESCE((SELECT SUM(CASE WHEN t.type='income' AND t.paid THEN COALESCE(t.paid_amount,t.amount) ELSE 0 END) -
                        SUM(CASE WHEN t.type='expense' AND t.paid THEN COALESCE(t.paid_amount,t.amount) ELSE 0 END)
                  FROM transactions t WHERE t.account_id=fa.id),0) + fa.initial_balance as current_balance
       FROM financial_accounts fa WHERE fa.active=true ORDER BY fa.name`
    );
    res.json(r.rows);
  } catch(e) { next(e); }
});

router.post('/accounts', async (req, res, next) => {
  const { name, type, bank_name, agency, account_number, initial_balance } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'Nome obrigatório' });
  try {
    const r = await db.query(
      'INSERT INTO financial_accounts (name,type,bank_name,agency,account_number,initial_balance) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [name.trim(), type||'bank', bank_name||null, agency||null, account_number||null, initial_balance||0]
    );
    res.status(201).json(r.rows[0]);
  } catch(e) { next(e); }
});

router.put('/accounts/:id', async (req, res, next) => {
  const { name, type, bank_name, agency, account_number, initial_balance } = req.body || {};
  try {
    const r = await db.query(
      'UPDATE financial_accounts SET name=$1,type=$2,bank_name=$3,agency=$4,account_number=$5,initial_balance=$6 WHERE id=$7 RETURNING *',
      [name, type, bank_name||null, agency||null, account_number||null, initial_balance||0, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

// ── Caixa (Sessões) ─────────────────────────────────────────────────────────
router.get('/cash', async (req, res, next) => {
  const { status } = req.query;
  let q = `SELECT cs.*, u1.name as opened_by_name, u2.name as closed_by_name, fa.name as account_name
           FROM cash_sessions cs
           LEFT JOIN users u1 ON u1.id=cs.opened_by
           LEFT JOIN users u2 ON u2.id=cs.closed_by
           LEFT JOIN financial_accounts fa ON fa.id=cs.account_id
           WHERE 1=1`;
  const p = [];
  if (status) { p.push(status); q += ` AND cs.status=$${p.length}`; }
  q += ' ORDER BY cs.opened_at DESC LIMIT 50';
  try { res.json((await db.query(q, p)).rows); } catch(e) { next(e); }
});

router.get('/cash/current', async (req, res, next) => {
  try {
    const r = await db.query(
      `SELECT cs.*, u.name as opened_by_name, fa.name as account_name
       FROM cash_sessions cs
       LEFT JOIN users u ON u.id=cs.opened_by
       LEFT JOIN financial_accounts fa ON fa.id=cs.account_id
       WHERE cs.status='open' ORDER BY cs.opened_at DESC LIMIT 1`
    );
    if (!r.rows.length) return res.json(null);
    const session = r.rows[0];
    const moves = await db.query(
      `SELECT cm.*, u.name as user_name FROM cash_movements cm
       LEFT JOIN users u ON u.id=cm.user_id WHERE cm.session_id=$1 ORDER BY cm.created_at`,
      [session.id]
    );
    session.movements = moves.rows;
    res.json(session);
  } catch(e) { next(e); }
});

router.post('/cash/open', async (req, res, next) => {
  const { account_id, opening_balance, notes } = req.body || {};
  try {
    const open = await db.query("SELECT id FROM cash_sessions WHERE status='open'");
    if (open.rows.length) return res.status(400).json({ error: 'Já existe um caixa aberto. Feche-o primeiro.' });

    const cashAcct = account_id || (await db.query("SELECT id FROM financial_accounts WHERE type='cash' LIMIT 1")).rows[0]?.id;
    const r = await db.query(
      'INSERT INTO cash_sessions (account_id,opened_by,opening_balance,notes) VALUES ($1,$2,$3,$4) RETURNING *',
      [cashAcct, req.user.id, opening_balance||0, notes||null]
    );
    res.status(201).json(r.rows[0]);
  } catch(e) { next(e); }
});

router.post('/cash/close', async (req, res, next) => {
  const { closing_balance, notes } = req.body || {};
  try {
    const open = await db.query("SELECT * FROM cash_sessions WHERE status='open' ORDER BY opened_at DESC LIMIT 1");
    if (!open.rows.length) return res.status(400).json({ error: 'Nenhum caixa aberto' });
    const session = open.rows[0];

    const movs = await db.query('SELECT type, SUM(amount) as total FROM cash_movements WHERE session_id=$1 GROUP BY type', [session.id]);
    let cashIn = 0, cashOut = 0;
    for (const m of movs.rows) {
      if (m.type === 'in' || m.type === 'supply') cashIn += parseFloat(m.total);
      else cashOut += parseFloat(m.total);
    }

    const expected = parseFloat(session.opening_balance) + cashIn - cashOut;
    const actual = parseFloat(closing_balance) || expected;
    const diff = actual - expected;

    const r = await db.query(
      `UPDATE cash_sessions SET status='closed', closed_by=$1, closing_balance=$2,
        cash_in=$3, cash_out=$4, difference=$5, notes=COALESCE(notes,'')||COALESCE($6,''),
        closed_at=NOW() WHERE id=$7 RETURNING *`,
      [req.user.id, actual, cashIn, cashOut, diff, notes ? '\n'+notes : '', session.id]
    );
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

router.post('/cash/movement', async (req, res, next) => {
  const { type, amount, description } = req.body || {};
  if (!type || !amount) return res.status(400).json({ error: 'Tipo e valor são obrigatórios' });
  try {
    const open = await db.query("SELECT id FROM cash_sessions WHERE status='open' ORDER BY opened_at DESC LIMIT 1");
    if (!open.rows.length) return res.status(400).json({ error: 'Nenhum caixa aberto' });
    const r = await db.query(
      'INSERT INTO cash_movements (session_id,type,amount,description,user_id) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [open.rows[0].id, type, Math.abs(parseFloat(amount)), description||null, req.user.id]
    );
    res.status(201).json(r.rows[0]);
  } catch(e) { next(e); }
});

module.exports = router;
