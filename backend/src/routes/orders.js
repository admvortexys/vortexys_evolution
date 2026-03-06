'use strict';
/**
 * Pedidos de venda: CRUD completo.
 * Lista com filtros (status, search, channel, datas, seller).
 * Criação em transação (número sequencial, itens, baixa de estoque conforme status).
 */
const router = require('express').Router();
const db     = require('../database/db');
const auth   = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
router.use(auth);
router.use(requirePermission('orders'));

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
              os.label as status_label, os.color as status_color
       FROM orders o
       LEFT JOIN clients c ON c.id=o.client_id
       LEFT JOIN sellers s ON s.id=o.seller_id
       LEFT JOIN warehouses w ON w.id=o.warehouse_id
       LEFT JOIN order_statuses os ON os.slug=o.status
       WHERE o.id=$1`,
      [req.params.id]
    );
    if (!o.rows.length) return res.status(404).json({ error: 'Não encontrado' });
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
          warehouse_id, shipping, surcharge, payment_methods, fiscal_type, fiscal_notes } = req.body || {};

  if (!walk_in && !client_id) return res.status(400).json({ error: 'Selecione um cliente ou marque como consumidor final' });
  if (!items.length) return res.status(400).json({ error: 'Pedido deve ter pelo menos um item' });
  for (const it of items) {
    if (!it.product_id) return res.status(400).json({ error: 'Todos os itens devem ter product_id' });
    if (!it.quantity || parseFloat(it.quantity) <= 0) return res.status(400).json({ error: 'Quantidade deve ser maior que zero' });
    if (it.unit_price === undefined || parseFloat(it.unit_price) < 0) return res.status(400).json({ error: 'Preço unitário inválido' });
  }
  const pmArray = Array.isArray(payment_methods) ? payment_methods : [];
  const creditPayTotal = pmArray.filter(p => p.method === 'credito_loja').reduce((s,p) => s + (parseFloat(p.amount) || 0), 0);
  if (creditPayTotal > 0) {
    if (!client_id) return res.status(400).json({ error: 'Crédito da loja requer cliente cadastrado' });
    const bal = await db.query(
      `SELECT COALESCE(SUM(balance),0) as total FROM client_credits WHERE client_id=$1 AND status='active'`, [client_id]
    );
    if (creditPayTotal > parseFloat(bal.rows[0].total) + 0.01) {
      return res.status(400).json({ error: `Saldo de crédito insuficiente. Disponível: R$ ${parseFloat(bal.rows[0].total).toFixed(2)}` });
    }
  }
  const conn = await db.connect();
  try {
    await conn.query('BEGIN');
    await conn.query('LOCK TABLE orders IN SHARE ROW EXCLUSIVE MODE');
    const cnt = await conn.query('SELECT COUNT(*) FROM orders');
    const num = `PED-${String(parseInt(cnt.rows[0].count) + 1).padStart(5, '0')}`;
    let subtotal = 0;
    for (const it of items) subtotal += (parseFloat(it.quantity)||0) * (parseFloat(it.unit_price)||0) - (parseFloat(it.discount)||0);
    const ship = parseFloat(shipping) || 0;
    const sur = parseFloat(surcharge) || 0;
    const total = subtotal - parseFloat(discount) + ship + sur;
    const ord = await conn.query(
      `INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,notes,user_id,
       channel,operation_type,walk_in,walk_in_name,walk_in_document,walk_in_phone,
       warehouse_id,shipping,surcharge,payment_methods,fiscal_type,fiscal_notes)
       VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19,$20) RETURNING *`,
      [num, client_id||null, seller_id||null, subtotal, discount, total, notes||null, req.user.id,
       channel||'balcao', operation_type||'order', walk_in||false,
       walk_in_name||null, walk_in_document||null, walk_in_phone||null,
       warehouse_id||null, ship, sur,
       JSON.stringify(payment_methods||[]), fiscal_type||null, fiscal_notes||null]
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
  const check = await db.query('SELECT status FROM orders WHERE id=$1', [req.params.id]);
  if (!check.rows.length) return res.status(404).json({ error: 'Não encontrado' });
  if (check.rows[0].status !== 'draft') return res.status(400).json({ error: 'Só é possível editar pedidos em rascunho' });
  const { client_id, seller_id, items = [], discount = 0, notes,
          channel, operation_type, walk_in, walk_in_name, walk_in_document, walk_in_phone,
          warehouse_id, shipping, surcharge, payment_methods, fiscal_type, fiscal_notes } = req.body || {};
  const conn = await db.connect();
  try {
    await conn.query('BEGIN');
    await conn.query("UPDATE product_units SET status='available',order_id=NULL WHERE order_id=$1", [req.params.id]);
    let subtotal = 0;
    for (const it of items) subtotal += (parseFloat(it.quantity)||0)*(parseFloat(it.unit_price)||0)-(parseFloat(it.discount)||0);
    const ship = parseFloat(shipping) || 0;
    const sur = parseFloat(surcharge) || 0;
    const total = subtotal - parseFloat(discount) + ship + sur;
    await conn.query(
      `UPDATE orders SET client_id=$1,seller_id=$2,subtotal=$3,discount=$4,total=$5,notes=$6,
       channel=$7,operation_type=$8,walk_in=$9,walk_in_name=$10,walk_in_document=$11,walk_in_phone=$12,
       warehouse_id=$13,shipping=$14,surcharge=$15,payment_methods=$16::jsonb,fiscal_type=$17,fiscal_notes=$18,
       updated_at=NOW() WHERE id=$19`,
      [client_id||null, seller_id||null, subtotal, discount, total, notes||null,
       channel||'balcao', operation_type||'order', walk_in||false,
       walk_in_name||null, walk_in_document||null, walk_in_phone||null,
       warehouse_id||null, ship, sur,
       JSON.stringify(payment_methods||[]), fiscal_type||null, fiscal_notes||null,
       req.params.id]
    );
    await conn.query('DELETE FROM order_items WHERE order_id=$1', [req.params.id]);
    for (const it of items) {
      const t = (parseFloat(it.quantity)||0)*(parseFloat(it.unit_price)||0)-(parseFloat(it.discount)||0);
      await conn.query(
        'INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total,unit_id,item_notes,discount_pct) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [req.params.id, it.product_id, it.quantity, it.unit_price, it.discount||0, t,
         it.unit_id||null, it.item_notes||null, it.discount_pct||0]
      );
      if (it.unit_id) {
        await conn.query("UPDATE product_units SET status='reserved',order_id=$1,updated_at=NOW() WHERE id=$2", [req.params.id, it.unit_id]);
      }
    }
    await conn.query('COMMIT');
    const r = await db.query('SELECT * FROM orders WHERE id=$1', [req.params.id]);
    res.json(r.rows[0]);
  } catch(e) { await conn.query('ROLLBACK'); next(e); }
  finally { conn.release(); }
});

router.patch('/:id/status', async (req, res, next) => {
  const { status, cancel_reason, return_type } = req.body || {};
  if (!status) return res.status(400).json({ error: 'status é obrigatório' });
  const conn = await db.connect();
  try {
    await conn.query('BEGIN');
    const current = await conn.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!current.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    const order = current.rows[0];
    const statusRow = await conn.query('SELECT * FROM order_statuses WHERE slug=$1', [status]);
    if (!statusRow.rows.length) return res.status(400).json({ error: 'Status inválido' });
    const st = statusRow.rows[0];
    if (st.slug === 'cancelled' && !cancel_reason)
      return res.status(400).json({ error: 'Informe o motivo do cancelamento' });
    if (st.slug === 'returned' && !cancel_reason)
      return res.status(400).json({ error: 'Informe o motivo da devolução' });
    if (st.slug === 'returned' && !return_type)
      return res.status(400).json({ error: 'Informe o tipo da devolução (estorno ou crédito)' });
    if (order.status === status) return res.status(400).json({ error: 'Pedido já está neste status' });
    const its = await conn.query(
      `SELECT oi.*,p.name as product_name,p.sku FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=$1`,
      [req.params.id]
    );

    if (st.stock_action === 'deduct' && order.stock_deducted !== true) {
      // Criar transação de receita para o pedido (vincula Financeiro ↔ Pedidos)
      const existingTx = await conn.query('SELECT id FROM transactions WHERE order_id=$1', [req.params.id]);
      if (!existingTx.rows.length) {
        const cat = await conn.query(`SELECT id FROM financial_categories WHERE type='income' ORDER BY name LIMIT 1`);
        const catId = cat.rows[0]?.id || null;
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
          [it.product_id, it.quantity, prev, newQty, `Pedido ${order.number} — ${st.label}`, req.params.id, req.user.id, order.number]
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
          usedOn.push({ order_id: parseInt(req.params.id), order_number: order.number, amount: consume, date: new Date().toISOString(), user_id: req.user.id });
          await conn.query(
            `UPDATE client_credits SET used_amount=$1,balance=$2,status=$3,used_on_orders=$4::jsonb WHERE id=$5`,
            [newUsed, newBal, newBal <= 0 ? 'exhausted' : 'active', JSON.stringify(usedOn), cr.id]
          );
          remaining -= consume;
        }
        if (remaining > 0.01) {
          await conn.query('ROLLBACK');
          return res.status(400).json({ error: `Saldo de crédito insuficiente. Faltam R$ ${remaining.toFixed(2)}` });
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
          [it.product_id, it.quantity, prev, newQty, `Devolução: ${cancel_reason||'devolução'}`, req.params.id, req.user.id, order.number]
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
        product_id: it.product_id, product_name: it.product_name, sku: it.sku,
        quantity: it.quantity, unit_price: it.unit_price, total: it.total,
      }));

      const creditCnt = await conn.query('SELECT COUNT(*) FROM client_credits');
      const creditNum = `DEV-${String(parseInt(creditCnt.rows[0].count) + 1).padStart(5, '0')}`;

      if (return_type === 'credit' && clientId) {
        const cr = await conn.query(
          `INSERT INTO client_credits (number,client_id,order_id,type,amount,balance,reason,order_number,order_total,order_items,created_by)
           VALUES ($1,$2,$3,'store_credit',$4,$4,$5,$6,$7,$8::jsonb,$9) RETURNING *`,
          [creditNum, clientId, req.params.id, orderTotal, cancel_reason,
           order.number, orderTotal, JSON.stringify(itemsJson), req.user.id]
        );
        creditDoc = cr.rows[0];
        await conn.query('UPDATE orders SET return_type=$1,credit_amount=$2 WHERE id=$3',
          ['credit', orderTotal, req.params.id]);
      } else if (return_type === 'refund') {
        const cr = await conn.query(
          `INSERT INTO client_credits (number,client_id,order_id,type,amount,used_amount,balance,status,reason,order_number,order_total,order_items,created_by)
           VALUES ($1,$2,$3,'refund',$4,$4,0,'settled',$5,$6,$7,$8::jsonb,$9) RETURNING *`,
          [creditNum, clientId, req.params.id, orderTotal, cancel_reason,
           order.number, orderTotal, JSON.stringify(itemsJson), req.user.id]
        );
        creditDoc = cr.rows[0];
        if (clientId) {
          await conn.query(
            `INSERT INTO transactions (type,title,amount,due_date,paid,paid_date,client_id,order_id,notes,user_id)
             VALUES ('expense',$1,$2,CURRENT_DATE,true,CURRENT_DATE,$3,$4,$5,$6)`,
            [`Estorno pedido ${order.number}`, orderTotal, clientId, req.params.id,
             `Devolução ${creditNum} — ${cancel_reason}`, req.user.id]
          );
        }
        await conn.query('UPDATE orders SET return_type=$1,credit_amount=$2 WHERE id=$3',
          ['refund', orderTotal, req.params.id]);
      }
    }

    const r = await conn.query(
      'UPDATE orders SET status=$1,cancel_reason=$2,return_type=COALESCE($4,return_type),updated_at=NOW() WHERE id=$3 RETURNING *',
      [status, cancel_reason||null, req.params.id, return_type||null]
    );
    await conn.query('COMMIT');
    res.json({ ...r.rows[0], credit: creditDoc });
  } catch(e) { await conn.query('ROLLBACK'); next(e); }
  finally { conn.release(); }
});

router.patch('/:id/payment', async (req, res, next) => {
  const { payment_methods } = req.body || {};
  try {
    const r = await db.query(
      'UPDATE orders SET payment_methods=$1::jsonb,updated_at=NOW() WHERE id=$2 RETURNING *',
      [JSON.stringify(payment_methods || []), req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await db.query("UPDATE product_units SET status='available',order_id=NULL WHERE order_id=$1", [req.params.id]);
    const r = await db.query("DELETE FROM orders WHERE id=$1 AND status='draft' RETURNING id", [req.params.id]);
    if (!r.rows.length) return res.status(400).json({ error: 'Só é possível excluir pedidos em rascunho' });
    res.json({ success: true });
  } catch(e) { next(e); }
});

module.exports = router;
