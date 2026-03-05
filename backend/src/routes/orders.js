'use strict';
const router = require('express').Router();
const db     = require('../database/db');
const auth   = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
router.use(auth);
router.use(requirePermission('orders'));

const SYSTEM_STATUSES = ['draft','confirmed','separated','delivered','cancelled'];

router.get('/', async (req, res, next) => {
  const { status, search } = req.query;
  let q = `SELECT o.*,c.name as client_name,u.name as user_name,
                   s.name as seller_name,os.label as status_label,os.color as status_color
            FROM orders o
            LEFT JOIN clients c ON c.id=o.client_id
            LEFT JOIN users u ON u.id=o.user_id
            LEFT JOIN sellers s ON s.id=o.seller_id
            LEFT JOIN order_statuses os ON os.slug=o.status
            WHERE 1=1`;
  const p = [];
  if (status) { p.push(status); q += ` AND o.status=$${p.length}`; }
  if (search) { p.push(`%${search}%`); q += ` AND (o.number ILIKE $${p.length} OR c.name ILIKE $${p.length})`; }
  q += ' ORDER BY o.created_at DESC';
  try { res.json((await db.query(q, p)).rows); } catch(e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const o = await db.query(
      `SELECT o.*,c.name as client_name,c.phone as client_phone,c.email as client_email,c.document as client_document,
               s.name as seller_name
       FROM orders o LEFT JOIN clients c ON c.id=o.client_id LEFT JOIN sellers s ON s.id=o.seller_id
       WHERE o.id=$1`,
      [req.params.id]
    );
    if (!o.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    const items = await db.query(
      `SELECT oi.*,p.name as product_name,p.sku,p.barcode FROM order_items oi
       JOIN products p ON p.id=oi.product_id WHERE oi.order_id=$1`,
      [req.params.id]
    );
    res.json({ ...o.rows[0], items: items.rows });
  } catch(e) { next(e); }
});

router.post('/', async (req, res, next) => {
  const { client_id, seller_id, items = [], discount = 0, notes } = req.body || {};
  if (!client_id) return res.status(400).json({ error: 'client_id é obrigatório' });
  if (!items.length) return res.status(400).json({ error: 'Pedido deve ter pelo menos um item' });
  for (const it of items) {
    if (!it.product_id) return res.status(400).json({ error: 'Todos os itens devem ter product_id' });
    if (!it.quantity || parseFloat(it.quantity) <= 0) return res.status(400).json({ error: 'Quantidade deve ser maior que zero' });
    if (it.unit_price === undefined || parseFloat(it.unit_price) < 0) return res.status(400).json({ error: 'Preço unitário inválido' });
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    // Número sequencial idempotente com lock
    await client.query('LOCK TABLE orders IN SHARE ROW EXCLUSIVE MODE');
    const cnt = await client.query('SELECT COUNT(*) FROM orders');
    const num = `PED-${String(parseInt(cnt.rows[0].count) + 1).padStart(5, '0')}`;
    let subtotal = 0;
    for (const it of items) subtotal += (parseFloat(it.quantity)||0) * (parseFloat(it.unit_price)||0) - (parseFloat(it.discount)||0);
    const total = subtotal - parseFloat(discount);
    const ord = await client.query(
      "INSERT INTO orders (number,client_id,seller_id,status,subtotal,discount,total,notes,user_id) VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,$8) RETURNING *",
      [num, client_id, seller_id||null, subtotal, discount, total, notes||null, req.user.id]
    );
    for (const it of items) {
      const t = (parseFloat(it.quantity)||0)*(parseFloat(it.unit_price)||0)-(parseFloat(it.discount)||0);
      await client.query(
        'INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES ($1,$2,$3,$4,$5,$6)',
        [ord.rows[0].id, it.product_id, it.quantity, it.unit_price, it.discount||0, t]
      );
    }
    await client.query('COMMIT');
    res.status(201).json(ord.rows[0]);
  } catch(e) { await client.query('ROLLBACK'); next(e); }
  finally { client.release(); }
});

router.put('/:id', async (req, res, next) => {
  const check = await db.query('SELECT status FROM orders WHERE id=$1', [req.params.id]);
  if (!check.rows.length) return res.status(404).json({ error: 'Não encontrado' });
  if (check.rows[0].status !== 'draft') return res.status(400).json({ error: 'Só é possível editar pedidos em rascunho' });
  const { client_id, seller_id, items = [], discount = 0, notes } = req.body || {};
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    let subtotal = 0;
    for (const it of items) subtotal += (parseFloat(it.quantity)||0)*(parseFloat(it.unit_price)||0)-(parseFloat(it.discount)||0);
    const total = subtotal - parseFloat(discount);
    await client.query(
      'UPDATE orders SET client_id=$1,seller_id=$2,subtotal=$3,discount=$4,total=$5,notes=$6,updated_at=NOW() WHERE id=$7',
      [client_id, seller_id||null, subtotal, discount, total, notes||null, req.params.id]
    );
    await client.query('DELETE FROM order_items WHERE order_id=$1', [req.params.id]);
    for (const it of items) {
      const t = (parseFloat(it.quantity)||0)*(parseFloat(it.unit_price)||0)-(parseFloat(it.discount)||0);
      await client.query(
        'INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount,total) VALUES ($1,$2,$3,$4,$5,$6)',
        [req.params.id, it.product_id, it.quantity, it.unit_price, it.discount||0, t]
      );
    }
    await client.query('COMMIT');
    const r = await db.query('SELECT * FROM orders WHERE id=$1', [req.params.id]);
    res.json(r.rows[0]);
  } catch(e) { await client.query('ROLLBACK'); next(e); }
  finally { client.release(); }
});

router.patch('/:id/status', async (req, res, next) => {
  const { status, cancel_reason } = req.body || {};
  if (!status) return res.status(400).json({ error: 'status é obrigatório' });

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!current.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    const order = current.rows[0];

    // Busca o status customizado
    const statusRow = await client.query('SELECT * FROM order_statuses WHERE slug=$1', [status]);
    if (!statusRow.rows.length) return res.status(400).json({ error: 'Status inválido' });
    const st = statusRow.rows[0];

    if (st.slug === 'cancelled' && !cancel_reason)
      return res.status(400).json({ error: 'Informe o motivo do cancelamento' });

    // Previne confirmação dupla
    if (order.status === status) return res.status(400).json({ error: 'Pedido já está neste status' });

    const its = await client.query('SELECT * FROM order_items WHERE order_id=$1', [req.params.id]);

    // Ação de estoque conforme configuração do status
    if (st.stock_action === 'deduct' && order.stock_deducted !== true) {
      for (const it of its.rows) {
        const p = await client.query('SELECT * FROM products WHERE id=$1', [it.product_id]);
        if (!p.rows.length) continue;
        const prev = parseFloat(p.rows[0].stock_quantity);
        const newQty = prev - parseFloat(it.quantity);
        await client.query('UPDATE products SET stock_quantity=$1 WHERE id=$2', [newQty, it.product_id]);
        await client.query(
          "INSERT INTO stock_movements (product_id,type,quantity,previous_qty,new_qty,reason,reference_id,reference_type,user_id) VALUES ($1,'out',$2,$3,$4,$5,$6,'order',$7)",
          [it.product_id, it.quantity, prev, newQty, `Pedido ${order.number} — ${st.label}`, req.params.id, req.user.id]
        );
      }
      await client.query('UPDATE orders SET stock_deducted=true WHERE id=$1', [req.params.id]);
    }

    if (st.stock_action === 'return' && order.stock_deducted === true) {
      for (const it of its.rows) {
        const p = await client.query('SELECT * FROM products WHERE id=$1', [it.product_id]);
        if (!p.rows.length) continue;
        const prev = parseFloat(p.rows[0].stock_quantity);
        const newQty = prev + parseFloat(it.quantity);
        await client.query('UPDATE products SET stock_quantity=$1 WHERE id=$2', [newQty, it.product_id]);
        await client.query(
          "INSERT INTO stock_movements (product_id,type,quantity,previous_qty,new_qty,reason,reference_id,reference_type,user_id) VALUES ($1,'in',$2,$3,$4,$5,$6,'order',$7)",
          [it.product_id, it.quantity, prev, newQty, `Devolução: ${cancel_reason||'cancelamento'}`, req.params.id, req.user.id]
        );
      }
      await client.query('UPDATE orders SET stock_deducted=false WHERE id=$1', [req.params.id]);
    }

    if (st.stock_action === 'reserve') {
      const reserveUntil = st.reserve_days
        ? new Date(Date.now() + st.reserve_days * 86400000).toISOString()
        : null;
      await client.query('UPDATE orders SET reserved_until=$1 WHERE id=$2', [reserveUntil, req.params.id]);
    }

    const r = await client.query(
      'UPDATE orders SET status=$1,cancel_reason=$2,updated_at=NOW() WHERE id=$3 RETURNING *',
      [status, cancel_reason||null, req.params.id]
    );
    await client.query('COMMIT');
    res.json(r.rows[0]);
  } catch(e) { await client.query('ROLLBACK'); next(e); }
  finally { client.release(); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const r = await db.query("DELETE FROM orders WHERE id=$1 AND status='draft' RETURNING id", [req.params.id]);
    if (!r.rows.length) return res.status(400).json({ error: 'Só é possível excluir pedidos em rascunho' });
    res.json({ success: true });
  } catch(e) { next(e); }
});

module.exports = router;
