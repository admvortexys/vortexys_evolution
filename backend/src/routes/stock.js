'use strict';
const router = require('express').Router();
const db     = require('../database/db');
const auth   = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
router.use(auth);
router.use(requirePermission('stock'));

router.get('/', async (req, res, next) => {
  const { product_id, search } = req.query;
  let q = `SELECT sm.*,p.name as product_name,p.sku,p.barcode,
                   u.name as user_name,
                   o.number as order_number
            FROM stock_movements sm
            JOIN products p ON p.id=sm.product_id
            LEFT JOIN users u ON u.id=sm.user_id
            LEFT JOIN orders o ON o.id=sm.reference_id AND sm.reference_type='order'
            WHERE 1=1`;
  const params = [];
  if (product_id) { params.push(product_id); q += ` AND sm.product_id=$${params.length}`; }
  if (search) {
    params.push(`%${search}%`);
    q += ` AND (p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR p.barcode ILIKE $${params.length})`;
  }
  q += ' ORDER BY sm.created_at DESC LIMIT 500';
  try { res.json((await db.query(q, params)).rows); } catch(e) { next(e); }
});

// Busca produto com seu histórico completo
router.get('/product/:id', async (req, res, next) => {
  try {
    const prod = await db.query(
      `SELECT p.*,c.name as category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=$1`,
      [req.params.id]
    );
    if (!prod.rows.length) return res.status(404).json({ error: 'Produto não encontrado' });
    const movs = await db.query(
      `SELECT sm.*,u.name as user_name,o.number as order_number
       FROM stock_movements sm
       LEFT JOIN users u ON u.id=sm.user_id
       LEFT JOIN orders o ON o.id=sm.reference_id AND sm.reference_type='order'
       WHERE sm.product_id=$1 ORDER BY sm.created_at DESC`,
      [req.params.id]
    );
    res.json({ product: prod.rows[0], movements: movs.rows });
  } catch(e) { next(e); }
});

router.post('/', async (req, res, next) => {
  const { product_id, type, quantity, reason } = req.body || {};
  if (!product_id || !type || !quantity) return res.status(400).json({ error: 'product_id, type e quantity são obrigatórios' });
  if (!['in','out','adjustment'].includes(type)) return res.status(400).json({ error: 'type deve ser in, out ou adjustment' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const p = await client.query('SELECT * FROM products WHERE id=$1', [product_id]);
    if (!p.rows.length) return res.status(404).json({ error: 'Produto não encontrado' });
    const prev   = parseFloat(p.rows[0].stock_quantity);
    const qty    = parseFloat(quantity);
    const newQty = type === 'in' ? prev + qty : type === 'out' ? prev - qty : qty;
    await client.query('UPDATE products SET stock_quantity=$1,updated_at=NOW() WHERE id=$2', [newQty, product_id]);
    const r = await client.query(
      'INSERT INTO stock_movements (product_id,type,quantity,previous_qty,new_qty,reason,user_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [product_id, type, qty, prev, newQty, reason || null, req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json(r.rows[0]);
  } catch(e) { await client.query('ROLLBACK'); next(e); }
  finally { client.release(); }
});

module.exports = router;
