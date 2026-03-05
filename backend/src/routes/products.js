'use strict';
const router = require('express').Router();
const db     = require('../database/db');
const auth   = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
router.use(auth);

const ALLOWED = ['sku','name','description','category_id','unit','cost_price','sale_price','min_stock','warehouse_id','active','barcode','image_base64'];

router.get('/next-sku', requirePermission('products'), async (req, res, next) => {
  try {
    const r = await db.query("SELECT sku FROM products WHERE sku ~ '^PRD-[0-9]+$' ORDER BY CAST(SUBSTRING(sku FROM 5) AS INTEGER) DESC LIMIT 1");
    const last = r.rows.length ? parseInt(r.rows[0].sku.replace('PRD-', ''), 10) : 0;
    res.json({ sku: `PRD-${String(last + 1).padStart(5, '0')}` });
  } catch(e) { next(e); }
});

router.get('/search', requirePermission('products'), async (req, res, next) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  try {
    const r = await db.query(
      `SELECT id,sku,name,barcode,sale_price,cost_price,stock_quantity,unit
       FROM products WHERE active=true AND (name ILIKE $1 OR sku ILIKE $1 OR barcode ILIKE $1) LIMIT 15`,
      [`%${q}%`]
    );
    res.json(r.rows);
  } catch(e) { next(e); }
});

router.get('/', requirePermission('products'), async (req, res, next) => {
  const { search, category_id, low_stock } = req.query;
  let q = `SELECT p.id,p.sku,p.name,p.description,p.category_id,p.unit,p.cost_price,p.sale_price,
                   p.stock_quantity,p.min_stock,p.warehouse_id,p.active,p.barcode,p.created_at,p.updated_at,
                   p.image_base64,c.name as category_name,w.name as warehouse_name
            FROM products p
            LEFT JOIN categories c ON c.id=p.category_id
            LEFT JOIN warehouses w ON w.id=p.warehouse_id
            WHERE p.active=true`;
  const params = [];
  if (search)       { params.push(`%${search}%`); q += ` AND (p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR p.barcode ILIKE $${params.length})`; }
  if (category_id)  { params.push(category_id); q += ` AND p.category_id=$${params.length}`; }
  if (low_stock === 'true') q += ` AND p.stock_quantity<=p.min_stock`;
  q += ' ORDER BY p.name';
  try { res.json((await db.query(q, params)).rows); } catch(e) { next(e); }
});

router.get('/:id', requirePermission('products'), async (req, res, next) => {
  try {
    const r = await db.query(
      `SELECT p.*,c.name as category_name,w.name as warehouse_name
       FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN warehouses w ON w.id=p.warehouse_id
       WHERE p.id=$1`,
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

router.post('/', requirePermission('products'), async (req, res, next) => {
  const body = req.body || {};
  const { name, stock_quantity, image_base64 } = body;
  let { sku } = body;
  if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
  if (image_base64 && Buffer.byteLength(image_base64, 'base64') > 2 * 1024 * 1024)
    return res.status(400).json({ error: 'Imagem deve ter no máximo 2MB' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    if (!sku || !sku.trim()) {
      const last = await client.query("SELECT sku FROM products WHERE sku ~ '^PRD-[0-9]+$' ORDER BY CAST(SUBSTRING(sku FROM 5) AS INTEGER) DESC LIMIT 1");
      const num = last.rows.length ? parseInt(last.rows[0].sku.replace('PRD-', ''), 10) + 1 : 1;
      sku = `PRD-${String(num).padStart(5, '0')}`;
    }
    const r = await client.query(
      `INSERT INTO products (sku,name,description,category_id,unit,cost_price,sale_price,stock_quantity,min_stock,warehouse_id,barcode,image_base64)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [sku, name, body.description||null, body.category_id||null, body.unit||'un',
       body.cost_price||0, body.sale_price||0, body.stock_quantity||0,
       body.min_stock||0, body.warehouse_id||null, body.barcode||null, image_base64||null]
    );
    if (parseFloat(stock_quantity) > 0) {
      await client.query(
        "INSERT INTO stock_movements (product_id,type,quantity,previous_qty,new_qty,reason,user_id) VALUES ($1,'in',$2,0,$2,'Saldo inicial',$3)",
        [r.rows[0].id, stock_quantity, req.user.id]
      );
    }
    await client.query('COMMIT');
    res.status(201).json(r.rows[0]);
  } catch(e) { await client.query('ROLLBACK'); if (e.code==='23505') return res.status(400).json({error:'SKU já cadastrado'}); next(e); }
  finally { client.release(); }
});

router.put('/:id', requirePermission('products'), async (req, res, next) => {
  const body = req.body || {};
  if (body.image_base64 && Buffer.byteLength(body.image_base64, 'base64') > 2 * 1024 * 1024)
    return res.status(400).json({ error: 'Imagem deve ter no máximo 2MB' });
  const safe = Object.fromEntries(ALLOWED.filter(k => k in body).map(k => [k, body[k]]));
  if (!Object.keys(safe).length) return res.status(400).json({ error: 'Nenhum campo válido' });
  const sets = Object.keys(safe).map((k, i) => `${k}=$${i + 1}`).join(',');
  const vals = [...Object.values(safe), req.params.id];
  try {
    const r = await db.query(`UPDATE products SET ${sets},updated_at=NOW() WHERE id=$${vals.length} RETURNING *`, vals);
    if (!r.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

router.delete('/:id', requirePermission('products'), async (req, res, next) => {
  try {
    await db.query('UPDATE products SET active=false WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch(e) { next(e); }
});

module.exports = router;
