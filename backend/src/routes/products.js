'use strict';
/**
 * Produtos: CRUD, busca, geração de SKU, unidades (IMEI).
 * Campos permitidos em ALLOWED. Imagem em image_base64.
 */
const router = require('express').Router();
const db     = require('../database/db');
const auth   = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { buildChanges, safeAudit } = require('../middleware/audit');
router.use(auth);

const ALLOWED = [
  'sku','name','description','category_id','unit','cost_price','sale_price','min_stock',
  'warehouse_id','active','barcode','image_base64',
  'brand','model','color','condition','supplier','gtin','photos','variations',
  'promotion_price','pix_price','card_price','commission',
  'ncm','cest','cst_csosn','cfop','fiscal_origin','nfe_rules',
  'controls_stock','controls_imei','controls_serial','location',
  'warranty_manufacturer','warranty_store','exchange_policy','technical_support',
  'ram','storage','screen','battery','is_5g','dual_chip','esim',
];

const JSONB_FIELDS = ['photos','variations','nfe_rules'];
const PRICE_AUDIT_FIELDS = ['cost_price', 'sale_price', 'pix_price', 'card_price', 'promotion_price', 'commission'];

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
      `SELECT id,sku,name,brand,model,barcode,sale_price,pix_price,cost_price,stock_quantity,unit,controls_imei
       FROM products WHERE active=true AND (name ILIKE $1 OR sku ILIKE $1 OR barcode ILIKE $1 OR brand ILIKE $1 OR model ILIKE $1) LIMIT 15`,
      [`%${q}%`]
    );
    res.json(r.rows);
  } catch(e) { next(e); }
});

router.get('/units/search', requirePermission('products'), async (req, res, next) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  try {
    const r = await db.query(
      `SELECT u.*,p.name as product_name,p.sku,p.brand,p.model
       FROM product_units u
       JOIN products p ON p.id=u.product_id
       WHERE u.imei ILIKE $1 OR u.imei2 ILIKE $1 OR u.serial ILIKE $1
       ORDER BY u.created_at DESC LIMIT 20`,
      [`%${q}%`]
    );
    res.json(r.rows);
  } catch(e) { next(e); }
});

router.get('/', requirePermission('products'), async (req, res, next) => {
  const { search, category_id, low_stock, brand, condition } = req.query;
  let q = `SELECT p.id,p.sku,p.name,p.brand,p.model,p.color,p.condition,p.description,p.category_id,p.unit,
                   p.cost_price,p.sale_price,p.pix_price,p.card_price,p.promotion_price,
                   p.stock_quantity,p.min_stock,p.warehouse_id,p.active,p.barcode,p.gtin,
                   p.controls_imei,p.controls_serial,p.controls_stock,
                   p.created_at,p.updated_at,p.image_base64,
                   c.name as category_name,w.name as warehouse_name,
                   (SELECT COUNT(*) FROM product_units pu WHERE pu.product_id=p.id AND pu.status='available')::int as units_available,
                   (SELECT COUNT(*) FROM product_units pu WHERE pu.product_id=p.id)::int as units_total
            FROM products p
            LEFT JOIN categories c ON c.id=p.category_id
            LEFT JOIN warehouses w ON w.id=p.warehouse_id
            WHERE p.active=true`;
  const params = [];
  if (search) {
    params.push(`%${search}%`);
    q += ` AND (p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR p.barcode ILIKE $${params.length} OR p.brand ILIKE $${params.length} OR p.model ILIKE $${params.length})`;
  }
  if (category_id)  { params.push(category_id); q += ` AND p.category_id=$${params.length}`; }
  if (brand)        { params.push(brand);        q += ` AND p.brand ILIKE $${params.length}`; }
  if (condition)    { params.push(condition);     q += ` AND p.condition=$${params.length}`; }
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
    const units = await db.query(
      `SELECT u.*,o.number as order_number FROM product_units u LEFT JOIN orders o ON o.id=u.order_id WHERE u.product_id=$1 ORDER BY u.created_at DESC`,
      [req.params.id]
    );
    res.json({ ...r.rows[0], units: units.rows });
  } catch(e) { next(e); }
});

router.post('/', requirePermission('products'), async (req, res, next) => {
  const body = req.body || {};
  const { name, stock_quantity, image_base64 } = body;
  let { sku } = body;
  if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
  if (image_base64 && image_base64.length > 3 * 1024 * 1024)
    return res.status(400).json({ error: 'Imagem deve ter no máximo 2MB' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    if (!sku || !sku.trim()) {
      const last = await client.query("SELECT sku FROM products WHERE sku ~ '^PRD-[0-9]+$' ORDER BY CAST(SUBSTRING(sku FROM 5) AS INTEGER) DESC LIMIT 1");
      const num = last.rows.length ? parseInt(last.rows[0].sku.replace('PRD-', ''), 10) + 1 : 1;
      sku = `PRD-${String(num).padStart(5, '0')}`;
    }
    const cols = ['sku','name','description','category_id','unit','cost_price','sale_price','stock_quantity','min_stock','warehouse_id','barcode','image_base64',
      'brand','model','color','condition','supplier','gtin','photos','variations',
      'promotion_price','pix_price','card_price','commission',
      'ncm','cest','cst_csosn','cfop','fiscal_origin','nfe_rules',
      'controls_stock','controls_imei','controls_serial','location',
      'warranty_manufacturer','warranty_store','exchange_policy','technical_support',
      'ram','storage','screen','battery','is_5g','dual_chip','esim'];
    const vals = cols.map(c => {
      if (c === 'sku') return sku;
      if (JSONB_FIELDS.includes(c)) return JSON.stringify(body[c] || (c === 'nfe_rules' ? {} : []));
      return body[c] !== undefined && body[c] !== '' ? body[c] : (
        ['cost_price','sale_price','stock_quantity','min_stock','commission'].includes(c) ? 0 :
        ['controls_stock'].includes(c) ? true :
        ['controls_imei','controls_serial','is_5g','dual_chip','esim'].includes(c) ? false :
        ['condition'].includes(c) ? 'new' :
        ['fiscal_origin'].includes(c) ? '0' :
        ['unit'].includes(c) ? 'un' : null
      );
    });
    const placeholders = cols.map((_, i) => {
      if (JSONB_FIELDS.includes(cols[i])) return `$${i+1}::jsonb`;
      return `$${i+1}`;
    }).join(',');
    const r = await client.query(
      `INSERT INTO products (${cols.join(',')}) VALUES (${placeholders}) RETURNING *`, vals
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
  if (body.image_base64 && body.image_base64.length > 3 * 1024 * 1024)
    return res.status(400).json({ error: 'Imagem deve ter no máximo 2MB' });
  const safe = {};
  for (const k of ALLOWED) {
    if (k in body) {
      safe[k] = JSONB_FIELDS.includes(k) ? JSON.stringify(body[k]) : body[k];
    }
  }
  if (!Object.keys(safe).length) return res.status(400).json({ error: 'Nenhum campo válido' });
  const keys = Object.keys(safe);
  const sets = keys.map((k, i) => {
    if (JSONB_FIELDS.includes(k)) return `${k}=$${i+1}::jsonb`;
    return `${k}=$${i+1}`;
  }).join(',');
  const vals = [...Object.values(safe), req.params.id];
  try {
    const current = await db.query(
      'SELECT id,sku,name,cost_price,sale_price,pix_price,card_price,promotion_price,commission FROM products WHERE id=$1',
      [req.params.id]
    );
    if (!current.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    const previousProduct = current.rows[0];

    const r = await db.query(`UPDATE products SET ${sets},updated_at=NOW() WHERE id=$${vals.length} RETURNING *`, vals);
    if (!r.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    const updatedProduct = r.rows[0];

    const priceChanges = buildChanges(previousProduct, updatedProduct, PRICE_AUDIT_FIELDS);
    if (Object.keys(priceChanges).length) {
      await safeAudit(req, {
        action: 'price_changed',
        module: 'products',
        targetType: 'product',
        targetId: updatedProduct.id,
        details: {
          sku: updatedProduct.sku,
          name: updatedProduct.name,
          changes: priceChanges,
        },
      });
    }

    res.json(updatedProduct);
  } catch(e) { next(e); }
});

router.delete('/:id', requirePermission('products'), async (req, res, next) => {
  try {
    await db.query('UPDATE products SET active=false WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch(e) { next(e); }
});

// ─── IMEI / UNITS ────────────────────────────────────────────────────────────

router.get('/:id/units', requirePermission('products'), async (req, res, next) => {
  const { status } = req.query;
  let q = `SELECT u.*,o.number as order_number FROM product_units u LEFT JOIN orders o ON o.id=u.order_id WHERE u.product_id=$1`;
  const params = [req.params.id];
  if (status) { params.push(status); q += ` AND u.status=$${params.length}`; }
  q += ' ORDER BY u.created_at DESC';
  try { res.json((await db.query(q, params)).rows); } catch(e) { next(e); }
});

router.post('/:id/units', requirePermission('products'), async (req, res, next) => {
  const { imei, imei2, serial, condition, supplier, purchase_date, notes } = req.body;
  if (!imei && !serial) return res.status(400).json({ error: 'IMEI ou serial é obrigatório' });
  try {
    const r = await db.query(
      `INSERT INTO product_units (product_id,imei,imei2,serial,condition,supplier,purchase_date,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.params.id, imei||null, imei2||null, serial||null, condition||'new', supplier||null, purchase_date||null, notes||null]
    );
    await db.query('UPDATE products SET stock_quantity=stock_quantity+1,updated_at=NOW() WHERE id=$1', [req.params.id]);
    res.status(201).json(r.rows[0]);
  } catch(e) {
    if (e.code === '23505') return res.status(400).json({ error: 'IMEI ou serial já cadastrado' });
    next(e);
  }
});

router.post('/:id/units/batch', requirePermission('products'), async (req, res, next) => {
  const { units } = req.body;
  if (!Array.isArray(units) || !units.length) return res.status(400).json({ error: 'Lista de unidades vazia' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const results = [];
    for (const u of units) {
      if (!u.imei && !u.serial) continue;
      const r = await client.query(
        `INSERT INTO product_units (product_id,imei,imei2,serial,condition,supplier,purchase_date,notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [req.params.id, u.imei||null, u.imei2||null, u.serial||null, u.condition||'new', u.supplier||null, u.purchase_date||null, u.notes||null]
      );
      results.push(r.rows[0]);
    }
    if (results.length > 0) {
      await client.query('UPDATE products SET stock_quantity=stock_quantity+$1,updated_at=NOW() WHERE id=$2', [results.length, req.params.id]);
    }
    await client.query('COMMIT');
    res.status(201).json({ added: results.length, units: results });
  } catch(e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') return res.status(400).json({ error: 'IMEI ou serial duplicado na lista' });
    next(e);
  } finally { client.release(); }
});

router.put('/units/:unitId', requirePermission('products'), async (req, res, next) => {
  const { imei, imei2, serial, condition, supplier, purchase_date, notes, status } = req.body;
  try {
    const r = await db.query(
      `UPDATE product_units SET imei=COALESCE($1,imei),imei2=COALESCE($2,imei2),serial=COALESCE($3,serial),
       condition=COALESCE($4,condition),supplier=COALESCE($5,supplier),purchase_date=COALESCE($6,purchase_date),
       notes=COALESCE($7,notes),status=COALESCE($8,status),updated_at=NOW() WHERE id=$9 RETURNING *`,
      [imei, imei2, serial, condition, supplier, purchase_date, notes, status, req.params.unitId]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    res.json(r.rows[0]);
  } catch(e) {
    if (e.code === '23505') return res.status(400).json({ error: 'IMEI ou serial já cadastrado' });
    next(e);
  }
});

router.patch('/units/:unitId/status', requirePermission('products'), async (req, res, next) => {
  const { status } = req.body;
  const valid = ['available','sold','reserved','defective','returned','quarantine','in_service','scrapped','supplier_return'];
  if (!valid.includes(status)) return res.status(400).json({ error: `Status inválido. Use: ${valid.join(', ')}` });
  try {
    const r = await db.query('UPDATE product_units SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING *', [status, req.params.unitId]);
    if (!r.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

router.delete('/units/:unitId', requirePermission('products'), async (req, res, next) => {
  try {
    const unit = await db.query('SELECT product_id,status FROM product_units WHERE id=$1', [req.params.unitId]);
    if (!unit.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    if (unit.rows[0].status === 'sold') return res.status(400).json({ error: 'Não é possível excluir unidade vendida' });
    await db.query('DELETE FROM product_units WHERE id=$1', [req.params.unitId]);
    if (unit.rows[0].status === 'available') {
      await db.query('UPDATE products SET stock_quantity=GREATEST(stock_quantity-1,0),updated_at=NOW() WHERE id=$1', [unit.rows[0].product_id]);
    }
    res.json({ success: true });
  } catch(e) { next(e); }
});

module.exports = router;
