'use strict';
/**
 * Pedidos de venda: CRUD completo.
 * Lista com filtros (status, search, channel, datas, seller).
 * CriaÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o em transaÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o (nÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºmero sequencial, itens, baixa de estoque conforme status).
 */
const router = require('express').Router();
const db     = require('../database/db');
const auth   = require('../middleware/auth');
const { buildChanges, safeAudit } = require('../middleware/audit');
const { requireAnyPermission } = require('../middleware/rbac');
const {
  canAuthorizeDiscount,
  getUserDiscountLimit,
  normalizePermissions,
  verifyDiscountApprovalToken,
} = require('../utils/discountPermissions');
router.use(auth);
router.use(requireAnyPermission(['orders', 'pdv']));

function roundPercent(value) {
  return Math.round(value * 100) / 100;
}

function calcDiscountPct(subtotal, discount) {
  const subtotalValue = parseFloat(subtotal) || 0;
  const discountValue = parseFloat(discount) || 0;
  if (subtotalValue <= 0 || discountValue <= 0) return 0;
  return roundPercent((discountValue / subtotalValue) * 100);
}

function normalizeOrderItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .map(item => ({
      product_id: item.product_id ? Number(item.product_id) : null,
      unit_id: item.unit_id ? Number(item.unit_id) : null,
      quantity: parseFloat(item.quantity) || 0,
      unit_price: parseFloat(item.unit_price) || 0,
      discount: parseFloat(item.discount) || 0,
      discount_pct: parseFloat(item.discount_pct) || 0,
      total: parseFloat(item.total) || ((parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0) - (parseFloat(item.discount) || 0)),
      item_notes: item.item_notes || null,
      product_name: item.product_name || null,
      sku: item.sku || null,
    }))
    .sort((a, b) => {
      const productDiff = (a.product_id || 0) - (b.product_id || 0);
      if (productDiff !== 0) return productDiff;
      return (a.unit_id || 0) - (b.unit_id || 0);
    });
}

function orderAuditSnapshot(order = {}) {
  return {
    client_id: order.client_id || null,
    seller_id: order.seller_id || null,
    status: order.status || null,
    subtotal: parseFloat(order.subtotal) || 0,
    discount: parseFloat(order.discount) || 0,
    total: parseFloat(order.total) || 0,
    notes: order.notes || null,
    channel: order.channel || null,
    operation_type: order.operation_type || null,
    walk_in: !!order.walk_in,
    walk_in_name: order.walk_in_name || null,
    warehouse_id: order.warehouse_id || null,
    shipping: parseFloat(order.shipping) || 0,
    surcharge: parseFloat(order.surcharge) || 0,
    payment_methods: order.payment_methods || [],
    fiscal_type: order.fiscal_type || null,
    fiscal_notes: order.fiscal_notes || null,
    discount_approved_by: order.discount_approved_by || null,
    discount_approved_pct: parseFloat(order.discount_approved_pct) || 0,
  };
}

function buildOrderItemPriceChanges(beforeItems = [], afterItems = []) {
  const afterByKey = new Map(
    normalizeOrderItems(afterItems).map(item => [String(item.product_id || 'x') + ':' + String(item.unit_id || 'x'), item])
  );
  const changes = [];
  for (const beforeItem of normalizeOrderItems(beforeItems)) {
    const key = String(beforeItem.product_id || 'x') + ':' + String(beforeItem.unit_id || 'x');
    const afterItem = afterByKey.get(key);
    if (!afterItem) continue;
    const fieldChanges = buildChanges(beforeItem, afterItem, ['quantity', 'unit_price', 'discount', 'discount_pct', 'total']);
    if (Object.keys(fieldChanges).length) {
      changes.push({
        product_id: beforeItem.product_id,
        unit_id: beforeItem.unit_id,
        product_name: afterItem.product_name || beforeItem.product_name || null,
        sku: afterItem.sku || beforeItem.sku || null,
        changes: fieldChanges,
      });
    }
  }
  return changes;
}
async function validateDiscountApproval({ user, subtotal, discount, approvalToken }) {
  const normalizedUser = { ...user, permissions: normalizePermissions(user.permissions || {}, user.role) };
  const discountPct = calcDiscountPct(subtotal, discount);
  const limitPct = getUserDiscountLimit(normalizedUser);
  if (discountPct <= limitPct + 0.0001) {
    return { discountPct, limitPct, approvedBy: null };
  }
  if (!approvalToken) {
    const err = new Error(`Desconto de ${discountPct}% excede seu limite de ${limitPct}%. Autorizacao obrigatoria.`);
    err.status = 403;
    throw err;
  }

  let approval;
  try {
    approval = verifyDiscountApprovalToken(approvalToken);
  } catch {
    const err = new Error('Autorizacao de desconto invalida ou expirada');
    err.status = 403;
    throw err;
  }

  if (String(approval.cashierUserId) !== String(user.id)) {
    const err = new Error('Esta autorizacao de desconto nao pertence ao usuario logado');
    err.status = 403;
    throw err;
  }
  if (discountPct > (parseFloat(approval.maxDiscountPct) || 0) + 0.0001) {
    const err = new Error('A autorizacao informada nao cobre o percentual de desconto atual');
    err.status = 403;
    throw err;
  }

  const approverResult = await db.query(
    'SELECT id,name,role,permissions FROM users WHERE id=$1 AND active=true',
    [approval.approverUserId]
  );
  if (!approverResult.rows.length) {
    const err = new Error('Usuario autorizador nao encontrado ou inativo');
    err.status = 403;
    throw err;
  }
  const approver = {
    ...approverResult.rows[0],
    permissions: normalizePermissions(approverResult.rows[0].permissions || {}, approverResult.rows[0].role),
  };
  if (!canAuthorizeDiscount(approver)) {
    const err = new Error('O login autorizador nao possui permissao para aprovar descontos');
    err.status = 403;
    throw err;
  }
  if (discountPct > getUserDiscountLimit(approver) + 0.0001) {
    const err = new Error('O login autorizador nao cobre o percentual de desconto solicitado');
    err.status = 403;
    throw err;
  }

  return { discountPct, limitPct, approvedBy: approver.id };
}

router.get('/', async (req, res, next) => {
  const { status, search, channel, operation_type, start_date, end_date, seller_id } = req.query;
  let q = `SELECT o.*,c.name as client_name,u.name as user_name,
                   s.name as seller_name,os.label as status_label,os.color as status_color,
                   w.name as warehouse_name
            FROM orders o
            LEFT JOIN clients c ON c.id=o.client_id
            LEFT JOIN users u ON u.id=o.user_id
            LEFT JOIN sellers s ON s.id=o.seller_id
            LEFT JOIN order_statuses os ON os.slug=o.status
            LEFT JOIN warehouses w ON w.id=o.warehouse_id
            WHERE 1=1`;
  const p = [];
  if (status) { p.push(status); q += ` AND o.status=$${p.length}`; }
  if (channel) { p.push(channel); q += ` AND o.channel=$${p.length}`; }
  if (operation_type) { p.push(operation_type); q += ` AND o.operation_type=$${p.length}`; }
  if (start_date) { p.push(start_date); q += ` AND o.created_at >= $${p.length}::date`; }
  if (end_date) { p.push(end_date); q += ` AND o.created_at < $${p.length}::date + interval '1 day'`; }
  if (search) { p.push(`%${search}%`); q += ` AND (o.number ILIKE $${p.length} OR c.name ILIKE $${p.length} OR o.walk_in_name ILIKE $${p.length})`; }
  if (seller_id) { p.push(seller_id); q += ` AND o.seller_id=$${p.length}`; }
  q += ' ORDER BY o.created_at DESC';
  try { res.json((await db.query(q, p)).rows); } catch(e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const o = await db.query(
      `SELECT o.*,c.name as client_name,c.phone as client_phone,c.email as client_email,c.document as client_document,
              s.name as seller_name, w.name as warehouse_name,
              u.name as user_name, u.username as user_username,
              au.name as discount_approved_by_name, au.username as discount_approved_by_username,
              os.label as status_label, os.color as status_color
       FROM orders o
       LEFT JOIN clients c ON c.id=o.client_id
       LEFT JOIN sellers s ON s.id=o.seller_id
       LEFT JOIN warehouses w ON w.id=o.warehouse_id
       LEFT JOIN users u ON u.id=o.user_id
       LEFT JOIN users au ON au.id=o.discount_approved_by
       LEFT JOIN order_statuses os ON os.slug=o.status
       WHERE o.id=$1`,
      [req.params.id]
    );
    if (!o.rows.length) return res.status(404).json({ error: 'NÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o encontrado' });
    const items = await db.query(
      `SELECT oi.*,p.name as product_name,p.sku,p.barcode,p.controls_imei,p.brand,p.model,
              p.stock_quantity,p.pix_price,p.card_price,
              pu.imei as unit_imei,pu.imei2 as unit_imei2,pu.serial as unit_serial
       FROM order_items oi
       LEFT JOIN products p ON p.id=oi.product_id
       LEFT JOIN product_units pu ON pu.id=oi.unit_id
       WHERE oi.order_id=$1`,
      [req.params.id]
    );
    const order = o.rows[0];
    let credit = null;
    if (order.return_type) {
      const cr = await db.query(
        `SELECT cc.*, u.name as created_by_name FROM client_credits cc
         LEFT JOIN users u ON u.id=cc.created_by WHERE cc.order_id=$1 ORDER BY cc.created_at DESC LIMIT 1`,
        [req.params.id]
      );
      if (cr.rows.length) credit = cr.rows[0];
    }
    res.json({ ...order, items: items.rows, credit });
  } catch(e) { next(e); }
});

router.post('/', async (req, res, next) => {
  const { client_id, seller_id, items = [], discount = 0, notes,
          channel, operation_type, walk_in, walk_in_name, walk_in_document, walk_in_phone,
          warehouse_id, shipping, surcharge, payment_methods, fiscal_type, fiscal_notes,
          discount_approval_token } = req.body || {};

  if (!walk_in && !client_id) return res.status(400).json({ error: 'Selecione um cliente ou marque como consumidor final' });
  if (!items.length) return res.status(400).json({ error: 'Pedido deve ter pelo menos um item' });
  for (const it of items) {
    if (!it.product_id) return res.status(400).json({ error: 'Todos os itens devem ter product_id' });
    if (!it.quantity || parseFloat(it.quantity) <= 0) return res.status(400).json({ error: 'Quantidade deve ser maior que zero' });
    if (it.unit_price === undefined || parseFloat(it.unit_price) < 0) return res.status(400).json({ error: 'PreÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§o unitÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡rio invÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡lido' });
  }
  let subtotal = 0;
  for (const it of items) subtotal += (parseFloat(it.quantity)||0) * (parseFloat(it.unit_price)||0) - (parseFloat(it.discount)||0);
  let discountApproval;
  try {
    discountApproval = await validateDiscountApproval({
      user: req.user,
      subtotal,
      discount,
      approvalToken: discount_approval_token,
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    return next(e);
  }
  const pmArray = Array.isArray(payment_methods) ? payment_methods : [];
  const creditPayTotal = pmArray.filter(p => p.method === 'credito_loja').reduce((s,p) => s + (parseFloat(p.amount) || 0), 0);
  if (creditPayTotal > 0) {
    if (!client_id) return res.status(400).json({ error: 'CrÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©dito da loja requer cliente cadastrado' });
    const bal = await db.query(
      `SELECT COALESCE(SUM(balance),0) as total FROM client_credits WHERE client_id=$1 AND status='active'`, [client_id]
    );
    if (creditPayTotal > parseFloat(bal.rows[0].total) + 0.01) {
      return res.status(400).json({ error: `Saldo de crÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©dito insuficiente. DisponÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­vel: R$ ${parseFloat(bal.rows[0].total).toFixed(2)}` });
    }
  }
  const conn = await db.connect();
  try {
    await conn.query('BEGIN');
    await conn.query('LOCK TABLE orders IN SHARE ROW EXCLUSIVE MODE');
    const cnt = await conn.query('SELECT COUNT(*) FROM orders');
    const num = `PED-${String(parseInt(cnt.rows[0].count) + 1).padStart(5, '0')}`;
    const ship = parseFloat(shipping) || 0;
    const sur = parseFloat(surcharge) || 0;
    const total = subtotal - parseFloat(discount) + ship + sur;
    const approvedBy = discountApproval?.approvedBy || null;
    const approvedPct = approvedBy ? (discountApproval?.discountPct || 0) : 0;
    const ord = await conn.query(
      `INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,notes,user_id,
       channel,operation_type,walk_in,walk_in_name,walk_in_document,walk_in_phone,
       warehouse_id,shipping,surcharge,payment_methods,fiscal_type,fiscal_notes,
       discount_approved_by,discount_approved_at,discount_approved_pct)
       VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19,$20,
       $21::integer,CASE WHEN $21::integer IS NOT NULL THEN NOW() ELSE NULL::timestamp END,$22::numeric) RETURNING *`,
      [num, client_id||null, seller_id||null, subtotal, discount, total, notes||null, req.user.id,
       channel||'balcao', operation_type||'order', walk_in||false,
       walk_in_name||null, walk_in_document||null, walk_in_phone||null,
       warehouse_id||null, ship, sur,
       JSON.stringify(payment_methods||[]), fiscal_type||null, fiscal_notes||null,
       approvedBy, approvedPct]
    );
    for (const it of items) {
      const t = (parseFloat(it.quantity)||0)*(parseFloat(it.unit_price)||0)-(parseFloat(it.discount)||0);
      await conn.query(
        'INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total,unit_id,item_notes,discount_pct) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [ord.rows[0].id, it.product_id, it.quantity, it.unit_price, it.discount||0, t,
         it.unit_id||null, it.item_notes||null, it.discount_pct||0]
      );
      if (it.unit_id) {
        await conn.query("UPDATE product_units SET status='reserved',order_id=$1,updated_at=NOW() WHERE id=$2", [ord.rows[0].id, it.unit_id]);
      }
    }
    await conn.query('COMMIT');
    res.status(201).json(ord.rows[0]);
  } catch(e) { await conn.query('ROLLBACK'); next(e); }
  finally { conn.release(); }
});

router.put('/:id', async (req, res, next) => {
  const { client_id, seller_id, items = [], discount = 0, notes,
          channel, operation_type, walk_in, walk_in_name, walk_in_document, walk_in_phone,
          warehouse_id, shipping, surcharge, payment_methods, fiscal_type, fiscal_notes,
          discount_approval_token } = req.body || {};

  let subtotal = 0;
  for (const it of items) subtotal += (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0) - (parseFloat(it.discount) || 0);

  let discountApproval;
  try {
    discountApproval = await validateDiscountApproval({
      user: req.user,
      subtotal,
      discount,
      approvalToken: discount_approval_token,
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    return next(e);
  }

  const conn = await db.connect();
  try {
    await conn.query('BEGIN');

    const currentOrderResult = await conn.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!currentOrderResult.rows.length) {
      await conn.query('ROLLBACK');
      return res.status(404).json({ error: 'Nao encontrado' });
    }

    const currentOrder = currentOrderResult.rows[0];
    if (currentOrder.status !== 'draft') {
      await conn.query('ROLLBACK');
      return res.status(400).json({ error: 'So e possivel editar pedidos em rascunho' });
    }

    const currentItemsResult = await conn.query(
      `SELECT oi.*, p.name as product_name, p.sku
         FROM order_items oi
         LEFT JOIN products p ON p.id=oi.product_id
        WHERE oi.order_id=$1
        ORDER BY oi.id`,
      [req.params.id]
    );

    await conn.query("UPDATE product_units SET status='available',order_id=NULL WHERE order_id=$1", [req.params.id]);

    const ship = parseFloat(shipping) || 0;
    const sur = parseFloat(surcharge) || 0;
    const total = subtotal - parseFloat(discount) + ship + sur;
    const approvedBy = discountApproval?.approvedBy || null;
    const approvedPct = approvedBy ? (discountApproval?.discountPct || 0) : 0;

    await conn.query(
      `UPDATE orders SET client_id=$1,seller_id=$2,subtotal=$3,discount=$4,total=$5,notes=$6,
       channel=$7,operation_type=$8,walk_in=$9,walk_in_name=$10,walk_in_document=$11,walk_in_phone=$12,
       warehouse_id=$13,shipping=$14,surcharge=$15,payment_methods=$16::jsonb,fiscal_type=$17,fiscal_notes=$18,
       discount_approved_by=$19::integer,discount_approved_at=CASE WHEN $19::integer IS NOT NULL THEN NOW() ELSE NULL::timestamp END,
       discount_approved_pct=$20::numeric,updated_at=NOW() WHERE id=$21`,
      [client_id || null, seller_id || null, subtotal, discount, total, notes || null,
       channel || 'balcao', operation_type || 'order', walk_in || false,
       walk_in_name || null, walk_in_document || null, walk_in_phone || null,
       warehouse_id || null, ship, sur,
       JSON.stringify(payment_methods || []), fiscal_type || null, fiscal_notes || null,
       approvedBy, approvedPct, req.params.id]
    );

    await conn.query('DELETE FROM order_items WHERE order_id=$1', [req.params.id]);
    for (const it of items) {
      const itemTotal = (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0) - (parseFloat(it.discount) || 0);
      await conn.query(
        'INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total,unit_id,item_notes,discount_pct) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [req.params.id, it.product_id, it.quantity, it.unit_price, it.discount || 0, itemTotal,
         it.unit_id || null, it.item_notes || null, it.discount_pct || 0]
      );
      if (it.unit_id) {
        await conn.query("UPDATE product_units SET status='reserved',order_id=$1,updated_at=NOW() WHERE id=$2", [req.params.id, it.unit_id]);
      }
    }

    const updatedOrder = (await conn.query('SELECT * FROM orders WHERE id=$1', [req.params.id])).rows[0];
    const updatedItemsResult = await conn.query(
      `SELECT oi.*, p.name as product_name, p.sku
         FROM order_items oi
         LEFT JOIN products p ON p.id=oi.product_id
        WHERE oi.order_id=$1
        ORDER BY oi.id`,
      [req.params.id]
    );

    const normalizedCurrentItems = normalizeOrderItems(currentItemsResult.rows);
    const normalizedUpdatedItems = normalizeOrderItems(updatedItemsResult.rows);
    const orderChanges = buildChanges(
      orderAuditSnapshot(currentOrder),
      orderAuditSnapshot(updatedOrder),
      ['client_id', 'seller_id', 'subtotal', 'discount', 'total', 'notes', 'channel', 'operation_type', 'walk_in', 'walk_in_name', 'warehouse_id', 'shipping', 'surcharge', 'payment_methods', 'fiscal_type', 'fiscal_notes', 'discount_approved_by', 'discount_approved_pct']
    );
    const itemsChanged = JSON.stringify(normalizedCurrentItems) !== JSON.stringify(normalizedUpdatedItems);
    const priceChanges = buildOrderItemPriceChanges(currentItemsResult.rows, updatedItemsResult.rows);

    if (Object.keys(orderChanges).length || itemsChanged) {
      await safeAudit(req, {
        action: 'order_updated',
        module: 'orders',
        targetType: 'order',
        targetId: req.params.id,
        details: {
          order_number: currentOrder.number,
          status: currentOrder.status,
          changes: orderChanges,
          items_changed: itemsChanged,
          items_before_count: normalizedCurrentItems.length,
          items_after_count: normalizedUpdatedItems.length,
        },
      }, conn);
    }

    if (priceChanges.length) {
      await safeAudit(req, {
        action: 'price_changed',
        module: 'orders',
        targetType: 'order',
        targetId: req.params.id,
        details: {
          order_number: currentOrder.number,
          price_changes: priceChanges,
        },
      }, conn);
    }

    await conn.query('COMMIT');
    res.json(updatedOrder);
  } catch (e) {
    try { await conn.query('ROLLBACK'); } catch (_) {}
    next(e);
  } finally {
    conn.release();
  }
});

router.patch('/:id/status', async (req, res, next) => {
  const { status, cancel_reason, return_type } = req.body || {};
  if (!status) return res.status(400).json({ error: 'status obrigatorio' });

  const conn = await db.connect();
  try {
    await conn.query('BEGIN');
    const current = await conn.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!current.rows.length) {
      await conn.query('ROLLBACK');
      return res.status(404).json({ error: 'Nao encontrado' });
    }

    const order = current.rows[0];
    const statusRow = await conn.query('SELECT * FROM order_statuses WHERE slug=$1', [status]);
    if (!statusRow.rows.length) {
      await conn.query('ROLLBACK');
      return res.status(400).json({ error: 'Status invalido' });
    }

    const st = statusRow.rows[0];
    if (st.slug === 'cancelled' && !cancel_reason) {
      await conn.query('ROLLBACK');
      return res.status(400).json({ error: 'Informe o motivo do cancelamento' });
    }
    if (st.slug === 'returned' && !cancel_reason) {
      await conn.query('ROLLBACK');
      return res.status(400).json({ error: 'Informe o motivo da devolucao' });
    }
    if (st.slug === 'returned' && !return_type) {
      await conn.query('ROLLBACK');
      return res.status(400).json({ error: 'Informe o tipo da devolucao (refund ou credit)' });
    }
    if (order.status === status) {
      await conn.query('ROLLBACK');
      return res.status(400).json({ error: 'Pedido ja esta neste status' });
    }

    const its = await conn.query(
      `SELECT oi.*, p.name as product_name, p.sku
         FROM order_items oi
         JOIN products p ON p.id=oi.product_id
        WHERE oi.order_id=$1`,
      [req.params.id]
    );

    if (st.stock_action === 'deduct' && order.stock_deducted !== true) {
      const existingTx = await conn.query('SELECT id FROM transactions WHERE order_id=$1', [req.params.id]);
      if (!existingTx.rows.length) {
        const orderTotal = parseFloat(order.total) || 0;
        const dueDate = order.created_at ? new Date(order.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        await conn.query(
          `INSERT INTO transactions (type,title,amount,due_date,paid,paid_date,paid_amount,client_id,order_id,document_ref,seller_id,user_id)
           VALUES ('income',$1,$2,$3::date,true,CURRENT_DATE,$2,$4,$5,$6,$7,$8)`,
          [`Venda Pedido ${order.number}`, orderTotal, dueDate, order.client_id, req.params.id, order.number, order.seller_id, req.user.id]
        );
      }

      for (const it of its.rows) {
        const p = await conn.query('SELECT * FROM products WHERE id=$1', [it.product_id]);
        if (!p.rows.length) continue;
        const prev = parseFloat(p.rows[0].stock_quantity);
        const newQty = prev - parseFloat(it.quantity);
        await conn.query('UPDATE products SET stock_quantity=$1 WHERE id=$2', [newQty, it.product_id]);
        await conn.query(
          `INSERT INTO stock_movements (product_id,type,quantity,previous_qty,new_qty,reason,reference_id,reference_type,user_id,movement_type,document_type,document_number,qty_out)
           VALUES ($1,'out',$2,$3,$4,$5,$6,'order',$7,'sale','order',$8,$2)`,
          [it.product_id, it.quantity, prev, newQty, `Pedido ${order.number} - ${st.label}`, req.params.id, req.user.id, order.number]
        );
      }

      await conn.query('UPDATE orders SET stock_deducted=true WHERE id=$1', [req.params.id]);
      await conn.query("UPDATE product_units SET status='sold',updated_at=NOW() WHERE order_id=$1 AND status='reserved'", [req.params.id]);

      const payMethods = Array.isArray(order.payment_methods) ? order.payment_methods : [];
      const creditPayments = payMethods.filter(p => p.method === 'credito_loja');
      for (const cp of creditPayments) {
        const cpAmount = parseFloat(cp.amount) || 0;
        if (cpAmount <= 0 || !order.client_id) continue;

        let remaining = cpAmount;
        const activeCredits = await conn.query(
          `SELECT * FROM client_credits WHERE client_id=$1 AND status='active' AND balance > 0 ORDER BY created_at ASC`,
          [order.client_id]
        );
        for (const cr of activeCredits.rows) {
          if (remaining <= 0) break;
          const available = parseFloat(cr.balance);
          const consume = Math.min(available, remaining);
          const newUsed = parseFloat(cr.used_amount) + consume;
          const newBal = parseFloat(cr.amount) - newUsed;
          const usedOn = Array.isArray(cr.used_on_orders) ? cr.used_on_orders : [];
          usedOn.push({ order_id: parseInt(req.params.id, 10), order_number: order.number, amount: consume, date: new Date().toISOString(), user_id: req.user.id });
          await conn.query(
            `UPDATE client_credits SET used_amount=$1,balance=$2,status=$3,used_on_orders=$4::jsonb WHERE id=$5`,
            [newUsed, newBal, newBal <= 0 ? 'exhausted' : 'active', JSON.stringify(usedOn), cr.id]
          );
          remaining -= consume;
        }

        if (remaining > 0.01) {
          await conn.query('ROLLBACK');
          return res.status(400).json({ error: `Saldo de credito insuficiente. Faltam R$ ${remaining.toFixed(2)}` });
        }
      }
    }

    if (st.stock_action === 'return' && order.stock_deducted === true) {
      for (const it of its.rows) {
        const p = await conn.query('SELECT * FROM products WHERE id=$1', [it.product_id]);
        if (!p.rows.length) continue;
        const prev = parseFloat(p.rows[0].stock_quantity);
        const newQty = prev + parseFloat(it.quantity);
        await conn.query('UPDATE products SET stock_quantity=$1 WHERE id=$2', [newQty, it.product_id]);
        await conn.query(
          `INSERT INTO stock_movements (product_id,type,quantity,previous_qty,new_qty,reason,reference_id,reference_type,user_id,movement_type,document_type,document_number,qty_in)
           VALUES ($1,'in',$2,$3,$4,$5,$6,'order',$7,'return_client','order',$8,$2)`,
          [it.product_id, it.quantity, prev, newQty, `Devolucao: ${cancel_reason || 'devolucao'}`, req.params.id, req.user.id, order.number]
        );
      }
      await conn.query('UPDATE orders SET stock_deducted=false WHERE id=$1', [req.params.id]);
      await conn.query("UPDATE product_units SET status='available',order_id=NULL,updated_at=NOW() WHERE order_id=$1", [req.params.id]);
    }

    if (st.stock_action === 'reserve') {
      const days = st.reserve_days || 7;
      const reserveUntil = new Date(Date.now() + days * 86400000).toISOString();
      await conn.query('UPDATE orders SET reserved_until=$1 WHERE id=$2', [reserveUntil, req.params.id]);
      await conn.query("UPDATE product_units SET status='reserved',updated_at=NOW() WHERE order_id=$1 AND status IN ('available','sold')", [req.params.id]);
    }

    let creditDoc = null;
    if (st.slug === 'returned' && return_type) {
      const clientId = order.client_id;
      const orderTotal = parseFloat(order.total) || 0;
      const itemsJson = its.rows.map(it => ({
        product_id: it.product_id,
        product_name: it.product_name,
        sku: it.sku,
        quantity: it.quantity,
        unit_price: it.unit_price,
        total: it.total,
      }));

      const creditCnt = await conn.query('SELECT COUNT(*) FROM client_credits');
      const creditNum = `DEV-${String(parseInt(creditCnt.rows[0].count, 10) + 1).padStart(5, '0')}`;

      if (return_type === 'credit' && clientId) {
        const cr = await conn.query(
          `INSERT INTO client_credits (number,client_id,order_id,type,amount,balance,reason,order_number,order_total,order_items,created_by)
           VALUES ($1,$2,$3,'store_credit',$4,$4,$5,$6,$7,$8::jsonb,$9) RETURNING *`,
          [creditNum, clientId, req.params.id, orderTotal, cancel_reason, order.number, orderTotal, JSON.stringify(itemsJson), req.user.id]
        );
        creditDoc = cr.rows[0];
        await conn.query('UPDATE orders SET return_type=$1,credit_amount=$2 WHERE id=$3', ['credit', orderTotal, req.params.id]);
      } else if (return_type === 'refund') {
        const cr = await conn.query(
          `INSERT INTO client_credits (number,client_id,order_id,type,amount,used_amount,balance,status,reason,order_number,order_total,order_items,created_by)
           VALUES ($1,$2,$3,'refund',$4,$4,0,'settled',$5,$6,$7,$8::jsonb,$9) RETURNING *`,
          [creditNum, clientId, req.params.id, orderTotal, cancel_reason, order.number, orderTotal, JSON.stringify(itemsJson), req.user.id]
        );
        creditDoc = cr.rows[0];
        if (clientId) {
          await conn.query(
            `INSERT INTO transactions (type,title,amount,due_date,paid,paid_date,client_id,order_id,notes,user_id)
             VALUES ('expense',$1,$2,CURRENT_DATE,true,CURRENT_DATE,$3,$4,$5,$6)`,
            [`Estorno pedido ${order.number}`, orderTotal, clientId, req.params.id, `Devolucao ${creditNum} - ${cancel_reason}`, req.user.id]
          );
        }
        await conn.query('UPDATE orders SET return_type=$1,credit_amount=$2 WHERE id=$3', ['refund', orderTotal, req.params.id]);
      }
    }

    const r = await conn.query(
      'UPDATE orders SET status=$1,cancel_reason=$2,return_type=COALESCE($4,return_type),updated_at=NOW() WHERE id=$3 RETURNING *',
      [status, cancel_reason || null, req.params.id, return_type || null]
    );

    await safeAudit(req, {
      action: 'order_status_changed',
      module: 'orders',
      targetType: 'order',
      targetId: req.params.id,
      details: {
        order_number: order.number,
        before_status: order.status,
        after_status: status,
        stock_action: st.stock_action || null,
        cancel_reason: cancel_reason || null,
        return_type: return_type || r.rows[0].return_type || null,
        credit_number: creditDoc?.number || null,
        total: parseFloat(order.total) || 0,
        item_count: its.rows.length,
      },
    }, conn);

    await conn.query('COMMIT');
    res.json({ ...r.rows[0], credit: creditDoc });
  } catch (e) {
    try { await conn.query('ROLLBACK'); } catch (_) {}
    next(e);
  } finally {
    conn.release();
  }
});

router.patch('/:id/payment', async (req, res, next) => {
  const { payment_methods } = req.body || {};
  try {
    const beforeResult = await db.query('SELECT * FROM orders WHERE id=$1', [req.params.id]);
    if (!beforeResult.rows.length) return res.status(404).json({ error: 'Nao encontrado' });

    const r = await db.query(
      'UPDATE orders SET payment_methods=$1::jsonb,updated_at=NOW() WHERE id=$2 RETURNING *',
      [JSON.stringify(payment_methods || []), req.params.id]
    );

    const changes = buildChanges(orderAuditSnapshot(beforeResult.rows[0]), orderAuditSnapshot(r.rows[0]), ['payment_methods']);
    if (Object.keys(changes).length) {
      await safeAudit(req, {
        action: 'order_updated',
        module: 'orders',
        targetType: 'order',
        targetId: req.params.id,
        details: {
          order_number: beforeResult.rows[0].number,
          status: beforeResult.rows[0].status,
          changes,
        },
      });
    }

    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  const conn = await db.connect();
  try {
    await conn.query('BEGIN');

    const currentResult = await conn.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!currentResult.rows.length) {
      await conn.query('ROLLBACK');
      return res.status(404).json({ error: 'Nao encontrado' });
    }

    const currentOrder = currentResult.rows[0];
    if (currentOrder.status !== 'draft') {
      await conn.query('ROLLBACK');
      return res.status(400).json({ error: 'So e possivel excluir pedidos em rascunho' });
    }

    const itemsResult = await conn.query(
      `SELECT oi.*, p.name as product_name, p.sku
         FROM order_items oi
         LEFT JOIN products p ON p.id=oi.product_id
        WHERE oi.order_id=$1
        ORDER BY oi.id`,
      [req.params.id]
    );

    await conn.query("UPDATE product_units SET status='available',order_id=NULL WHERE order_id=$1", [req.params.id]);
    const r = await conn.query('DELETE FROM orders WHERE id=$1 RETURNING id', [req.params.id]);
    if (!r.rows.length) {
      await conn.query('ROLLBACK');
      return res.status(404).json({ error: 'Nao encontrado' });
    }

    await safeAudit(req, {
      action: 'order_deleted',
      module: 'orders',
      targetType: 'order',
      targetId: req.params.id,
      details: {
        order_number: currentOrder.number,
        status: currentOrder.status,
        subtotal: parseFloat(currentOrder.subtotal) || 0,
        total: parseFloat(currentOrder.total) || 0,
        item_count: itemsResult.rows.length,
        items: normalizeOrderItems(itemsResult.rows),
      },
    }, conn);

    await conn.query('COMMIT');
    res.json({ success: true });
  } catch (e) {
    try { await conn.query('ROLLBACK'); } catch (_) {}
    next(e);
  } finally {
    conn.release();
  }
});

module.exports = router;
