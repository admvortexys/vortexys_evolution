'use strict';
/**
 * Financeiro: transações, contas, categorias, resumo, fontes de receita.
 * Suporta filtros por month/year ou start_date+end_date.
 * income-sources: unifica transações + pedidos sem transação + CRM ganho + OS entregues.
 */
const router = require('express').Router();
const db     = require('../database/db');
const auth   = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { validate, schemas } = require('../middleware/validate');
router.use(auth);
router.use(requirePermission('financial'));

const PAY_METHODS = ['dinheiro','pix','debito','credito','boleto','transferencia','cheque','credito_loja','outro'];

// ── Categorias de contas (expense para contas a pagar) ───────────────────────
router.get('/categories', async (req, res, next) => {
  const { type } = req.query;
  try {
    const r = await db.query(
      'SELECT * FROM financial_categories WHERE (type=$1 OR $1 IS NULL) AND active!=false ORDER BY name',
      [type || 'expense']
    );
    res.json(r.rows);
  } catch(e) { next(e); }
});

router.post('/categories', async (req, res, next) => {
  const { name, type, color } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
  try {
    const t = type || 'expense';
    const existing = await db.query(
      'SELECT id FROM financial_categories WHERE LOWER(name)=LOWER($1) AND type=$2',
      [name.trim(), t]
    );
    if (existing.rows.length) return res.status(400).json({ error: 'Categoria já existe' });
    const r = await db.query(
      'INSERT INTO financial_categories (name,type,color) VALUES ($1,$2,$3) RETURNING *',
      [name.trim(), t, color || '#7c3aed']
    );
    res.status(201).json(r.rows[0]);
  } catch(e) { next(e); }
});

router.delete('/categories/:id', async (req, res, next) => {
  try {
    await db.query('DELETE FROM financial_categories WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch(e) {
    if (e.code === '23503') return res.status(400).json({ error: 'Categoria em uso, não pode excluir' });
    next(e);
  }
});
const ACCOUNT_TYPES = ['cash','bank','card_machine','pix','other'];

// ── Listar transações com filtros avançados ──────────────────────────────────
router.get('/', async (req, res, next) => {
  const { type, paid, account_id, payment_method, client_id, seller_id, order_id, overdue, search } = req.query;
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
  const dw = txDateWhere(req, 't.due_date');
  const baseParamCount = p.length;
  const shiftedClause = dw.clause.replace(/\$(\d+)/g, (_, n) => `$${baseParamCount + Number(n)}`);
  p.push(...dw.params);
  q += ` AND ${shiftedClause}`;
  q += ' ORDER BY t.due_date ASC, t.id ASC';
  try { res.json((await db.query(q, p)).rows); } catch(e) { next(e); }
});

// ── Fontes de receita (transações + pedidos + CRM + assistência) ─────────────
router.get('/income-sources', async (req, res, next) => {
  const { search, paid } = req.query;
  const txWhere = txDateWhere(req, 't.due_date');
  const orderWhere = txDateWhere(req, 'o.created_at');
  const leadWhere = txDateWhere(req, 'l.created_at');
  const serviceWhere = txDateWhere(req, 'COALESCE(so.delivered_at, so.completed_at, so.updated_at)');
  try {
    const [txRows, orders, leads, serviceOrders] = await Promise.all([
      db.query(
        `SELECT t.id, t.due_date, t.title, t.amount, t.paid, t.paid_date, t.order_id,
                fc.name as category_name, c.name as client_name, s.name as seller_name,
                o.number as order_number,
                'transaction' as source
         FROM transactions t
         LEFT JOIN financial_categories fc ON fc.id=t.category_id
         LEFT JOIN clients c ON c.id=t.client_id
         LEFT JOIN sellers s ON s.id=t.seller_id
         LEFT JOIN orders o ON o.id=t.order_id
         WHERE t.type='income'
           AND ${txWhere.clause}` +
        (paid === 'true' ? ' AND t.paid=true' : paid === 'false' ? ' AND t.paid=false' : ''),
        txWhere.params
      ),
      db.query(
        `SELECT o.id, o.created_at as due_date, o.total as amount, o.number,
                c.name as client_name, s.name as seller_name,
                'order' as source
         FROM orders o
         LEFT JOIN clients c ON c.id=o.client_id
         LEFT JOIN sellers s ON s.id=o.seller_id
         LEFT JOIN transactions tx ON tx.order_id=o.id AND tx.type='income'
         WHERE o.status NOT IN ('draft','cancelled','returned')
           AND tx.id IS NULL
           AND ${orderWhere.clause}`,
        orderWhere.params
      ),
      db.query(
        `SELECT l.id, l.created_at as due_date, l.name as title, l.estimated_value as amount,
                p.name as pipeline, 'crm' as source
         FROM leads l
         LEFT JOIN pipelines p ON p.id=l.pipeline_id
         WHERE l.status='won'
           AND ${leadWhere.clause}`,
        leadWhere.params
      ),
      db.query(
        `SELECT so.id, COALESCE(so.delivered_at, so.completed_at, so.updated_at) as due_date,
                (SELECT SUM((COALESCE(soi.quantity,1) * COALESCE(soi.unit_price,0)) - COALESCE(soi.discount,0))
                 FROM service_order_items soi WHERE soi.service_order_id=so.id) as amount,
                so.number, 'service' as source
         FROM service_orders so
         WHERE so.status='delivered'
           AND ${serviceWhere.clause}`,
        serviceWhere.params
      )
    ]);
    const rows = [];
    for (const r of txRows.rows) {
      rows.push({
        id: `tx-${r.id}`,
        transaction_id: r.id,
        due_date: r.due_date,
        title: r.title,
        amount: parseFloat(r.amount),
        paid: r.paid,
        paid_date: r.paid_date,
        type: 'income',
        category_name: r.category_name,
        client_name: r.client_name,
        seller_name: r.seller_name,
        order_number: r.order_number,
        source: 'transaction',
        source_label: r.order_number ? 'Venda' : (r.category_name || 'Outras receitas'),
      });
    }
    for (const r of orders.rows) {
      if (paid === 'false') continue;
      const amt = parseFloat(r.amount) || 0;
      if (amt <= 0) continue;
      rows.push({
        id: `order-${r.id}`,
        due_date: r.due_date,
        title: `Venda Pedido ${r.number}`,
        amount: amt,
        paid: true,
        paid_date: r.due_date,
        type: 'income',
        category_name: 'Vendas',
        client_name: r.client_name,
        seller_name: r.seller_name,
        order_number: r.number,
        source: 'order',
        source_label: 'Pedido',
      });
    }
    for (const r of leads.rows) {
      if (paid === 'false') continue;
      const amt = parseFloat(r.amount) || 0;
      if (amt <= 0) continue;
      rows.push({
        id: `lead-${r.id}`,
        due_date: r.due_date,
        title: r.title || `Lead CRM #${r.id}`,
        amount: amt,
        paid: true,
        paid_date: r.due_date,
        type: 'income',
        category_name: 'CRM',
        client_name: null,
        seller_name: null,
        order_number: null,
        source: 'crm',
        source_label: 'CRM',
      });
    }
    for (const r of serviceOrders.rows) {
      if (paid === 'false') continue;
      const amt = parseFloat(r.amount) || 0;
      if (amt <= 0) continue;
      rows.push({
        id: `os-${r.id}`,
        due_date: r.due_date,
        title: `Assistência ${r.number}`,
        amount: amt,
        paid: true,
        paid_date: r.due_date,
        type: 'income',
        category_name: 'Serviços',
        client_name: null,
        seller_name: null,
        order_number: null,
        source: 'service',
        source_label: 'Assistência',
      });
    }
    if (search) {
      const s = search.toLowerCase();
      const filtered = rows.filter(r =>
        `${r.title || ''} ${r.client_name || ''} ${r.order_number || ''} ${r.source_label || ''}`.toLowerCase().includes(s)
      );
      while (rows.length) rows.pop();
      filtered.forEach(r => rows.push(r));
    }
    rows.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    res.json(rows);
  } catch(e) { next(e); }
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function txDateWhere(req, col) {
  const start = req.query.start_date || req.query.date;
  const end = req.query.end_date || req.query.date || start;
  if (start && end && DATE_RE.test(start) && DATE_RE.test(end)) {
    return { clause: `${col}::date >= $1 AND ${col}::date <= $2`, params: [start, end] };
  }
  const m = parseInt(req.query.month) || new Date().getMonth() + 1;
  const y = parseInt(req.query.year) || new Date().getFullYear();
  return { clause: `EXTRACT(MONTH FROM ${col})=$1 AND EXTRACT(YEAR FROM ${col})=$2`, params: [m, y] };
}

// ── Resumo do período ────────────────────────────────────────────────────────
router.get('/summary', async (req, res, next) => {
  const dw = txDateWhere(req, 'due_date');
  const ow = txDateWhere(req, 'o.created_at');
  const lw = txDateWhere(req, 'created_at');
  const sw = txDateWhere(req, 'COALESCE(so.delivered_at, so.completed_at, so.updated_at)');
  try {
    const [tx, crm, osRev, ordersRev] = await Promise.all([
      db.query(
        `SELECT
          (COALESCE(SUM(CASE WHEN type='income'  AND paid=true  THEN COALESCE(paid_amount,amount) END),0)
           + COALESCE((SELECT SUM(o.total) FROM orders o
               LEFT JOIN transactions tx ON tx.order_id=o.id AND tx.type='income'
               WHERE o.status NOT IN ('draft','cancelled','returned') AND tx.id IS NULL
                 AND ${ow.clause}),0)) as income_paid,
          COALESCE(SUM(CASE WHEN type='expense' AND paid=true  THEN COALESCE(paid_amount,amount) END),0) as expense_paid,
          COALESCE(SUM(CASE WHEN type='income'  AND paid=false THEN amount END),0) as income_pending,
          COALESCE(SUM(CASE WHEN type='expense' AND paid=false THEN amount END),0) as expense_pending,
          COALESCE(SUM(CASE WHEN type='income'  AND paid=false AND due_date < CURRENT_DATE THEN amount END),0) as income_overdue,
          COALESCE(SUM(CASE WHEN type='expense' AND paid=false AND due_date < CURRENT_DATE THEN amount END),0) as expense_overdue,
          COALESCE(SUM(CASE WHEN paid=true THEN COALESCE(fee_amount,0) END),0) as total_fees,
          COUNT(CASE WHEN paid=false AND due_date < CURRENT_DATE THEN 1 END)::int as overdue_count
         FROM transactions
         WHERE ${dw.clause}`,
        dw.params
      ),
      db.query(
        `SELECT COALESCE(SUM(CASE WHEN status='won' THEN estimated_value END),0) as crm_won_value
         FROM leads WHERE ${lw.clause}`,
        lw.params
      ),
      db.query(
        `SELECT COALESCE(SUM(
          (SELECT SUM((COALESCE(soi.quantity,1) * COALESCE(soi.unit_price,0)) - COALESCE(soi.discount,0))
           FROM service_order_items soi WHERE soi.service_order_id=so.id)
        ),0) as os_revenue
         FROM service_orders so
         WHERE so.status='delivered'
           AND ${sw.clause}`,
        sw.params
      ),
      db.query(
        `SELECT (COALESCE(SUM(CASE WHEN t.order_id IS NOT NULL THEN COALESCE(t.paid_amount,t.amount) END),0)
           + COALESCE((SELECT SUM(o.total) FROM orders o
               LEFT JOIN transactions tx ON tx.order_id=o.id AND tx.type='income'
               WHERE o.status NOT IN ('draft','cancelled','returned') AND tx.id IS NULL AND ${ow.clause}),0)) as orders_revenue
         FROM transactions t
         WHERE t.type='income' AND t.paid=true AND ${dw.clause}`,
        dw.params
      )
    ]);
    const row = tx.rows[0] || {};
    row.crm_won_value = parseFloat(crm.rows[0]?.crm_won_value || 0);
    row.os_revenue = parseFloat(osRev.rows[0]?.os_revenue || 0);
    row.orders_revenue = parseFloat(ordersRev.rows[0]?.orders_revenue || 0);
    res.json(row);
  } catch(e) { next(e); }
});

// ── Evolução mensal (receita = transações + CRM ganho + OS entregues) ─────────
router.get('/monthly-evolution', async (req, res, next) => {
  try {
    const [tx, crm, osRev] = await Promise.all([
      db.query(
        `SELECT EXTRACT(MONTH FROM due_date)::int as month, EXTRACT(YEAR FROM due_date)::int as year,
         COALESCE(SUM(CASE WHEN type='income'  AND paid=true THEN COALESCE(paid_amount,amount) END),0) as income,
         COALESCE(SUM(CASE WHEN type='expense' AND paid=true THEN COALESCE(paid_amount,amount) END),0) as expense
         FROM transactions
         WHERE due_date >= DATE_TRUNC('month', NOW()) - INTERVAL '5 months'
         GROUP BY 1,2 ORDER BY 2,1`
      ),
      db.query(
        `SELECT EXTRACT(MONTH FROM created_at)::int as month, EXTRACT(YEAR FROM created_at)::int as year,
         COALESCE(SUM(CASE WHEN status='won' THEN estimated_value END),0) as crm_won
         FROM leads
         WHERE created_at >= DATE_TRUNC('month', NOW()) - INTERVAL '5 months'
         GROUP BY 1,2 ORDER BY 2,1`
      ),
      db.query(
        `SELECT EXTRACT(MONTH FROM COALESCE(delivered_at, completed_at, updated_at))::int as month,
         EXTRACT(YEAR FROM COALESCE(delivered_at, completed_at, updated_at))::int as year,
         COALESCE(SUM(
           (SELECT SUM((COALESCE(soi.quantity,1) * COALESCE(soi.unit_price,0)) - COALESCE(soi.discount,0))
            FROM service_order_items soi WHERE soi.service_order_id=so.id)
         ),0) as os_revenue
         FROM service_orders so
         WHERE so.status='delivered'
           AND COALESCE(so.delivered_at, so.completed_at, so.updated_at) >= DATE_TRUNC('month', NOW()) - INTERVAL '5 months'
         GROUP BY 1,2 ORDER BY 2,1`
      ),
    ]);
    const txMap = new Map((tx.rows || []).map(r => [`${r.year}-${r.month}`, r]));
    const crmMap = new Map((crm.rows || []).map(r => [`${r.year}-${r.month}`, parseFloat(r.crm_won) || 0]));
    const osMap = new Map((osRev.rows || []).map(r => [`${r.year}-${r.month}`, parseFloat(r.os_revenue) || 0]));
    const allKeys = [...new Set([...txMap.keys(), ...crmMap.keys(), ...osMap.keys()])].sort();
    const merged = allKeys.map(k => {
      const [year, month] = k.split('-').map(Number);
      const t = txMap.get(k) || { income: 0, expense: 0 };
      const inc = parseFloat(t.income) || 0;
      const exp = parseFloat(t.expense) || 0;
      const crmVal = crmMap.get(k) || 0;
      const osVal = osMap.get(k) || 0;
      return {
        month: Number(month),
        year: Number(year),
        income: inc + crmVal + osVal,
        expense: exp,
      };
    });
    res.json(merged);
  } catch(e) { next(e); }
});

// ── Por categoria ────────────────────────────────────────────────────────────
router.get('/by-category', async (req, res, next) => {
  const dw = txDateWhere(req, 't.due_date');
  try {
    const r = await db.query(
      `SELECT fc.name, fc.color, t.type,
              COALESCE(SUM(t.amount),0) as total
       FROM transactions t
       LEFT JOIN financial_categories fc ON fc.id=t.category_id
       WHERE ${dw.clause}
       GROUP BY fc.name,fc.color,t.type ORDER BY total DESC`,
      dw.params
    );
    res.json(r.rows);
  } catch(e) { next(e); }
});

// ── Previsão de entradas (faturamento) ────────────────────────────────────────
// Só entradas. Dias passados: faturamento real. Dias futuros: projeção por ticket médio.
// Aceita month/year ou start_date/end_date ou date para alinhar com o filtro do dashboard
router.get('/cash-flow-projected', async (req, res, next) => {
  try {
    const now = new Date();
    let startStr, endStr, todayStr, daysElapsed, projStartStr, projEndStr;
    const qStart = req.query.start_date || req.query.date;
    const qEnd = req.query.end_date || req.query.date || qStart;
    if (qStart && qEnd && DATE_RE.test(qStart) && DATE_RE.test(qEnd)) {
      startStr = qStart;
      endStr = qEnd;
      todayStr = qEnd;
      projStartStr = startStr;
      projEndStr = endStr;
      const d1 = new Date(startStr);
      const d2 = new Date(endStr);
      daysElapsed = Math.max(1, Math.ceil((d2 - d1) / (24 * 60 * 60 * 1000)) + 1);
    } else {
      const m = parseInt(req.query.month) || now.getMonth() + 1;
      const y = parseInt(req.query.year) || now.getFullYear();
      const monthStart = new Date(y, m - 1, 1);
      const monthEnd = new Date(y, m, 0);
      const today = (m === now.getMonth() + 1 && y === now.getFullYear()) ? now : new Date(y, m - 1, Math.min(monthEnd.getDate(), now.getDate() || 1));
      todayStr = toYMD(today);
      const dayOfMonth = (m === today.getMonth() + 1 && y === today.getFullYear())
        ? today.getDate()
        : Math.min(monthEnd.getDate(), 30);
      daysElapsed = Math.max(dayOfMonth, 1);
      startStr = toYMD(monthStart);
      endStr = (m === now.getMonth() + 1 && y === now.getFullYear()) ? todayStr : toYMD(monthEnd);
      projStartStr = startStr;
      projEndStr = toYMD(monthEnd);
    }

    const realIncomeRows = await db.query(
      `SELECT d::date as date, COALESCE(SUM(v), 0) as receita FROM (
        SELECT t.due_date::date as d, COALESCE(t.paid_amount, t.amount) as v
        FROM transactions t
        WHERE t.type='income' AND t.paid AND t.due_date::date >= $1 AND t.due_date::date <= $2
        UNION ALL
        SELECT o.created_at::date as d, o.total as v
        FROM orders o
        LEFT JOIN transactions tx ON tx.order_id=o.id AND tx.type='income'
        WHERE o.status NOT IN ('draft','cancelled','returned') AND tx.id IS NULL
          AND o.created_at::date >= $1 AND o.created_at::date <= $2
        UNION ALL
        SELECT l.created_at::date as d, l.estimated_value as v
        FROM leads l
        WHERE l.status='won' AND l.created_at::date >= $1 AND l.created_at::date <= $2
        UNION ALL
        SELECT COALESCE(so.delivered_at, so.completed_at, so.updated_at)::date as d,
          (SELECT COALESCE(SUM((COALESCE(soi.quantity,1)*COALESCE(soi.unit_price,0))-COALESCE(soi.discount,0)),0)
           FROM service_order_items soi WHERE soi.service_order_id=so.id) as v
        FROM service_orders so
        WHERE so.status='delivered'
          AND COALESCE(so.delivered_at,so.completed_at,so.updated_at)::date >= $1
          AND COALESCE(so.delivered_at,so.completed_at,so.updated_at)::date <= $2
      ) u GROUP BY d`,
      [startStr, todayStr]
    );

    const realByDate = {};
    for (const row of (realIncomeRows.rows || [])) {
      const key = typeof row.date === 'string' ? row.date.split('T')[0] : toYMD(new Date(row.date));
      realByDate[key] = parseFloat(row.receita || 0) || 0;
    }

    let totalEntrada = 0;
    for (const d of Object.keys(realByDate)) {
      totalEntrada += realByDate[d];
    }
    if (totalEntrada === 0 && daysElapsed <= 1) {
      const prev = await db.query(
        `SELECT COALESCE(SUM(CASE WHEN type='income' AND paid THEN COALESCE(paid_amount,amount) END),0) as te
         FROM transactions
         WHERE due_date >= CURRENT_DATE - INTERVAL '1 month' AND due_date < DATE_TRUNC('month', CURRENT_DATE)`
      );
      totalEntrada = parseFloat(prev.rows?.[0]?.te || 0) || 0;
    }
    const denom = Math.max(daysElapsed, 1);
    const mediaDiariaEntrada = totalEntrada / denom;

    const [sy, sm, sd] = projStartStr.split('-').map(Number);
    const [ey, em, ed] = projEndStr.split('-').map(Number);
    const [ty, tm, td] = todayStr.split('-').map(Number);
    const projStartUtc = Date.UTC(sy, sm - 1, sd);
    const projEndUtc = Date.UTC(ey, em - 1, ed);
    const todayUtc = Date.UTC(ty, tm - 1, td);
    const rows = [];
    let dUtc = projStartUtc;
    const oneDay = 24 * 60 * 60 * 1000;

    while (dUtc <= projEndUtc) {
      const d = new Date(dUtc);
      const dateStr = toYMDUtc(d);
      const isPastOrToday = dUtc <= todayUtc;
      const receita = isPastOrToday
        ? (realByDate[dateStr] || 0)
        : mediaDiariaEntrada;
      rows.push({
        date: dateStr,
        receita,
        despesa: 0,
        saldo: receita,
      });
      dUtc += oneDay;
    }

    let acum = 0;
    const withAcum = rows.map(r => {
      acum += r.receita;
      return { ...r, acumulado: acum };
    });
    res.json(withAcum);
  } catch(e) { next(e); }
});

function toYMD(dt) {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function toYMDUtc(dt) {
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

// ── Fluxo de caixa projetado (tela completa: contas, agrupamento, tabela) ────
router.get('/cash-flow-projection', async (req, res, next) => {
  const accountId = req.query.account_id || null;
  const group = ['day', 'week', 'month'].includes(req.query.group) ? req.query.group : 'day';
  const days = Math.min(365, Math.max(30, parseInt(req.query.days, 10) || 90));

  try {
    const [accountsRes, txRes] = await Promise.all([
      db.query(
        `SELECT fa.id, fa.name, fa.type,
          COALESCE((SELECT SUM(CASE WHEN t.type='income' AND t.paid THEN COALESCE(t.paid_amount,t.amount) ELSE 0 END) -
                          SUM(CASE WHEN t.type='expense' AND t.paid THEN COALESCE(t.paid_amount,t.amount) ELSE 0 END)
                    FROM transactions t WHERE t.account_id=fa.id),0) + fa.initial_balance as current_balance
         FROM financial_accounts fa WHERE fa.active=true ORDER BY fa.name`
      ),
      db.query(
        `SELECT type, due_date::date as date,
           (COALESCE(amount,0) - COALESCE(paid_amount,0))::numeric as saldo_restante
         FROM transactions
         WHERE paid = false
           AND due_date >= CURRENT_DATE
           AND due_date < CURRENT_DATE + ($1::int || ' days')::interval
           AND (COALESCE(amount,0) - COALESCE(paid_amount,0)) > 0`,
        [days]
      ),
    ]);

    const accounts = (accountsRes.rows || []).map(a => ({
      id: a.id,
      name: a.name,
      type: a.type,
      current_balance: parseFloat(a.current_balance || 0),
    }));

    const saldoInicial = accountId
      ? (accounts.find(a => String(a.id) === String(accountId))?.current_balance ?? 0)
      : accounts.reduce((s, a) => s + a.current_balance, 0);

    const byDate = {};
    for (const row of (txRes.rows || [])) {
      const amt = parseFloat(row.saldo_restante || 0) || 0;
      if (amt <= 0) continue;
      const d = row.date;
      if (!byDate[d]) byDate[d] = { entradas: 0, saidas: 0 };
      if (row.type === 'income') byDate[d].entradas += amt;
      else byDate[d].saidas += amt;
    }

    const dateToKey = (d, g) => {
      const x = new Date(d);
      if (g === 'day') return d;
      if (g === 'week') {
        const day = x.getDay();
        const diff = x.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(x);
        monday.setDate(diff);
        return monday.toISOString().split('T')[0];
      }
      return `${d.slice(0, 7)}-01`;
    };

    const aggregated = {};
    for (const [d, v] of Object.entries(byDate)) {
      const key = dateToKey(d, group);
      if (!aggregated[key]) aggregated[key] = { entradas: 0, saidas: 0 };
      aggregated[key].entradas += v.entradas;
      aggregated[key].saidas += v.saidas;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setDate(end.getDate() + days);

    const keys = new Set(Object.keys(aggregated));
    const dd = new Date(today);
    while (dd < end) {
      const str = dd.toISOString().split('T')[0];
      keys.add(dateToKey(str, group));
      if (group === 'day') dd.setDate(dd.getDate() + 1);
      else if (group === 'week') dd.setDate(dd.getDate() + 7);
      else dd.setMonth(dd.getMonth() + 1);
    }

    const sorted = [...keys].filter(Boolean).sort();
    let acum = saldoInicial;
    const projection = sorted.map(k => {
      const v = aggregated[k] || { entradas: 0, saidas: 0 };
      const fluxo = v.entradas - v.saidas;
      acum += fluxo;
      return {
        periodo: k,
        entradas: v.entradas,
        saidas: v.saidas,
        fluxo_liquido: fluxo,
        saldo_acumulado: acum,
      };
    });

    res.json({
      accounts,
      saldo_inicial: saldoInicial,
      projection,
      group,
      days,
    });
  } catch (e) { next(e); }
});

// ── Inadimplência (receitas vencidas e não pagas) ─────────────────────────────
router.get('/overdue', async (req, res, next) => {
  try {
    const r = await db.query(
      `SELECT t.id,t.title,t.amount,t.due_date,t.paid,c.name as client_name,o.number as order_number
       FROM transactions t
       LEFT JOIN clients c ON c.id=t.client_id
       LEFT JOIN orders o ON o.id=t.order_id
       WHERE t.type='income' AND t.paid=false AND t.due_date < CURRENT_DATE
       ORDER BY t.due_date ASC`
    );
    const total = (r.rows || []).reduce((s, x) => s + parseFloat(x.amount || 0), 0);
    res.json({ items: r.rows, total });
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
          account_id, payment_method, seller_id, order_id, document_ref, fee_amount, discount_amount,
          is_recurring, recurrence_type, recurrence_end } = req.body || {};
  try {
    const r = await db.query(
      `UPDATE transactions SET type=$1,title=$2,amount=$3,due_date=$4,category_id=$5,
        client_id=$6,notes=$7,paid=$8,paid_date=$9,account_id=$10,payment_method=$11,
        seller_id=$12,order_id=$13,document_ref=$14,fee_amount=$15,discount_amount=$16,
        is_recurring=$17,recurrence_type=$18,recurrence_end=$19,
        updated_at=NOW() WHERE id=$20 RETURNING *`,
      [type, title, amount, due_date, category_id||null, client_id||null, notes||null,
       paid, paid_date||null, account_id||null, payment_method||null,
       seller_id||null, order_id||null, document_ref||null, fee_amount||0, discount_amount||0,
       !!is_recurring, recurrence_type||null, recurrence_end||null, req.params.id]
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
