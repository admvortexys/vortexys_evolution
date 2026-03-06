'use strict';
/**
 * Estoque: movimentações (compra, venda, ajuste, transferência, devoluções).
 * Registra em stock_movements e atualiza stock_quantity do produto.
 */
const router = require('express').Router();
const db     = require('../database/db');
const auth   = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { validate, schemas } = require('../middleware/validate');
router.use(auth);
router.use(requirePermission('stock'));

const MOVEMENT_TYPES = {
  purchase:        { label:'Compra',               dir:'in',  color:'#3b82f6' },
  sale:            { label:'Venda',                dir:'out', color:'#8b5cf6' },
  return_client:   { label:'Devolução cliente',    dir:'in',  color:'#10b981' },
  return_supplier: { label:'Devolução fornecedor', dir:'out', color:'#f97316' },
  transfer_out:    { label:'Saída transferência',  dir:'out', color:'#eab308' },
  transfer_in:     { label:'Entrada transferência',dir:'in',  color:'#06b6d4' },
  adjustment_pos:  { label:'Ajuste positivo',      dir:'in',  color:'#22c55e' },
  adjustment_neg:  { label:'Ajuste negativo',      dir:'out', color:'#ef4444' },
  inventory:       { label:'Inventário',           dir:'adj', color:'#1e40af' },
  reserve:         { label:'Reserva',              dir:'none',color:'#6b7280' },
  unreserve:       { label:'Baixa reserva',        dir:'none',color:'#9ca3af' },
  service_in:      { label:'Entrada assistência',  dir:'in',  color:'#ec4899' },
  service_out:     { label:'Saída assistência',    dir:'out', color:'#be185d' },
  service_discard: { label:'Descarte assistência', dir:'out', color:'#991b1b' },
};

router.get('/types', (_req, res) => res.json(MOVEMENT_TYPES));

// ─── OVERVIEW (cards gerenciais) ──────────────────────────────────────────

router.get('/overview', async (req, res, next) => {
  const { warehouse_id } = req.query;
  const today = new Date().toISOString().slice(0, 10);
  const whFilter = warehouse_id ? ' AND p.warehouse_id=$1' : '';
  const prodParams = warehouse_id ? [warehouse_id] : [];
  const movWhFilter = warehouse_id ? ' AND (sm.warehouse_id=$2 OR sm.warehouse_dest_id=$2)' : '';
  const movParams = warehouse_id ? [today, warehouse_id] : [today];
  try {
    const [products, lowStock, noStock, movementsToday, valueTotal] = await Promise.all([
      db.query(`SELECT COUNT(*)::int as c FROM products p WHERE p.active=true${whFilter}`, prodParams),
      db.query(`SELECT COUNT(*)::int as c FROM products p WHERE p.active=true AND p.min_stock > 0 AND p.stock_quantity <= p.min_stock${whFilter}`, prodParams),
      db.query(`SELECT COUNT(*)::int as c FROM products p WHERE p.active=true AND (p.stock_quantity IS NULL OR p.stock_quantity <= 0)${whFilter}`, prodParams),
      db.query(
        `SELECT 
          COALESCE(SUM(CASE WHEN sm.type='in' THEN sm.quantity ELSE 0 END), 0)::numeric as qty_in,
          COALESCE(SUM(CASE WHEN sm.type='out' THEN sm.quantity ELSE 0 END), 0)::numeric as qty_out
         FROM stock_movements sm WHERE sm.created_at >= $1::date AND sm.created_at < $1::date + interval '1 day' AND sm.cancelled=false${movWhFilter}`,
        movParams
      ),
      db.query(
        `SELECT COALESCE(SUM(p.stock_quantity * COALESCE(p.cost_price, 0)), 0)::numeric as total FROM products p WHERE p.active=true AND p.stock_quantity > 0${whFilter}`,
        prodParams
      ),
    ]);
    const units = await db.query(
      `SELECT status, COUNT(*)::int as c FROM product_units GROUP BY status`
    );
    const reserved = units.rows.find(r => r.status === 'reserved')?.c || 0;
    res.json({
      products_active: products.rows[0].c,
      low_stock: lowStock.rows[0].c,
      no_stock: noStock.rows[0].c,
      movements_today: { in: parseFloat(movementsToday.rows[0]?.qty_in || 0), out: parseFloat(movementsToday.rows[0]?.qty_out || 0) },
      value_total: parseFloat(valueTotal.rows[0]?.total || 0),
      reserved_units: reserved,
    });
  } catch (e) { next(e); }
});

// ─── POSITION (posição de estoque por produto) ───────────────────────────

router.get('/position', async (req, res, next) => {
  const { search, warehouse_id, status_filter, low_only } = req.query;
  let q = `
    SELECT p.id, p.sku, p.name, p.stock_quantity, p.min_stock, p.cost_price, p.unit,
           p.warehouse_id, c.name as category_name, w.name as warehouse_name
    FROM products p
    LEFT JOIN categories c ON c.id=p.category_id
    LEFT JOIN warehouses w ON w.id=p.warehouse_id
    WHERE p.active=true
  `;
  const params = [];
  if (search) { params.push(`%${search}%`); q += ` AND (p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR p.barcode ILIKE $${params.length})`; }
  if (warehouse_id) { params.push(warehouse_id); q += ` AND p.warehouse_id=$${params.length}`; }
  if (low_only === 'true') q += ` AND p.min_stock > 0 AND p.stock_quantity <= p.min_stock`;
  q += ` ORDER BY p.name`;
  try {
    const rows = (await db.query(q, params)).rows;
    const unitCounts = await db.query(
      `SELECT product_id, status, COUNT(*)::int as c FROM product_units GROUP BY product_id, status`
    );
    const byProduct = {};
    for (const r of unitCounts.rows) {
      if (!byProduct[r.product_id]) byProduct[r.product_id] = { reserved: 0, available: 0, sold: 0 };
      if (r.status === 'reserved') byProduct[r.product_id].reserved = r.c;
      if (r.status === 'available') byProduct[r.product_id].available = r.c;
      if (r.status === 'sold') byProduct[r.product_id].sold = r.c;
    }
    const enriched = rows.map(r => {
      const u = byProduct[r.id] || { reserved: 0, available: 0 };
      const physical = parseFloat(r.stock_quantity) || 0;
      const reserved = u.reserved || 0;
      const available = Math.max(physical - reserved, 0);
      const cost = parseFloat(r.cost_price) || 0;
      const value = physical * cost;
      let stockStatus = 'normal';
      if (physical <= 0) stockStatus = 'zerado';
      else if (r.min_stock > 0 && physical <= r.min_stock) stockStatus = 'baixo';
      return {
        ...r,
        physical,
        reserved,
        available,
        value,
        stock_status: stockStatus,
      };
    });
    if (status_filter === 'zerado') return res.json(enriched.filter(r => r.stock_status === 'zerado'));
    if (status_filter === 'baixo') return res.json(enriched.filter(r => r.stock_status === 'baixo'));
    res.json(enriched);
  } catch (e) { next(e); }
});

// ─── LIST with full filters + pagination ─────────────────────────────────

router.get('/', async (req, res, next) => {
  const { product_id, movement_type, warehouse_id, document_number, partner_name,
          user_id, imei_search, start_date, end_date, search, cancelled: showCancelled,
          limit: rawLimit, offset: rawOffset } = req.query;
  const params = [];
  let q = `SELECT sm.*,
                  p.name as product_name, p.sku, p.barcode, p.brand, p.model,
                  p.controls_imei, p.image_base64,
                  u.name as user_name,
                  o.number as order_number,
                  w.name as warehouse_name,
                  wd.name as warehouse_dest_name,
                  pu.imei as unit_imei, pu.imei2 as unit_imei2, pu.serial as unit_serial,
                  cl.name as partner_client_name
           FROM stock_movements sm
           JOIN products p ON p.id=sm.product_id
           LEFT JOIN users u ON u.id=sm.user_id
           LEFT JOIN orders o ON o.id=sm.reference_id AND sm.reference_type='order'
           LEFT JOIN warehouses w ON w.id=sm.warehouse_id
           LEFT JOIN warehouses wd ON wd.id=sm.warehouse_dest_id
           LEFT JOIN product_units pu ON pu.id=sm.unit_id
           LEFT JOIN clients cl ON cl.id=sm.partner_id
           WHERE 1=1`;

  if (product_id) { params.push(product_id); q += ` AND sm.product_id=$${params.length}`; }
  if (movement_type) { params.push(movement_type); q += ` AND sm.movement_type=$${params.length}`; }
  if (warehouse_id) { params.push(warehouse_id); q += ` AND (sm.warehouse_id=$${params.length} OR sm.warehouse_dest_id=$${params.length})`; }
  if (document_number) { params.push(`%${document_number}%`); q += ` AND (sm.document_number ILIKE $${params.length} OR o.number ILIKE $${params.length})`; }
  if (partner_name) { params.push(`%${partner_name}%`); q += ` AND (sm.partner_name ILIKE $${params.length} OR cl.name ILIKE $${params.length})`; }
  if (user_id) { params.push(user_id); q += ` AND sm.user_id=$${params.length}`; }
  if (start_date) { params.push(start_date); q += ` AND sm.created_at >= $${params.length}::date`; }
  if (end_date) { params.push(end_date); q += ` AND sm.created_at < $${params.length}::date + interval '1 day'`; }
  if (showCancelled !== 'true') q += ` AND sm.cancelled=false`;
  if (search) {
    params.push(`%${search}%`);
    q += ` AND (p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR p.barcode ILIKE $${params.length} OR p.brand ILIKE $${params.length} OR p.model ILIKE $${params.length})`;
  }
  if (imei_search) {
    params.push(`%${imei_search}%`);
    q += ` AND (pu.imei ILIKE $${params.length} OR pu.imei2 ILIKE $${params.length} OR pu.serial ILIKE $${params.length})`;
  }

  const limit = Math.min(parseInt(rawLimit) || 200, 1000);
  const offset = parseInt(rawOffset) || 0;
  q += ` ORDER BY sm.created_at DESC LIMIT ${limit} OFFSET ${offset}`;
  try { res.json((await db.query(q, params)).rows); } catch(e) { next(e); }
});

// ─── TRANSFERS list ──────────────────────────────────────────────────────

router.get('/transfers', async (req, res, next) => {
  const { warehouse_id, status } = req.query;
  let q = `
    SELECT sm.*, sm.reference_id as transfer_pair_id,
           p.name as product_name, p.sku,
           w.name as warehouse_name, wd.name as warehouse_dest_name,
           u.name as user_name
    FROM stock_movements sm
    JOIN products p ON p.id=sm.product_id
    LEFT JOIN warehouses w ON w.id=sm.warehouse_id
    LEFT JOIN warehouses wd ON wd.id=sm.warehouse_dest_id
    LEFT JOIN users u ON u.id=sm.user_id
    WHERE sm.movement_type IN ('transfer_out','transfer_in') AND sm.cancelled=false
  `;
  const params = [];
  if (warehouse_id) { params.push(warehouse_id); q += ` AND (sm.warehouse_id=$${params.length} OR sm.warehouse_dest_id=$${params.length})`; }
  q += ` ORDER BY sm.created_at DESC LIMIT 200`;
  try { res.json((await db.query(q, params)).rows); } catch (e) { next(e); }
});

// ─── Product search (for stock page) ─────────────────────────────────────

router.get('/product-search', async (req, res, next) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  try {
    const r = await db.query(
      `SELECT p.*, c.name as category_name, w.name as warehouse_name
       FROM products p
       LEFT JOIN categories c ON c.id=p.category_id
       LEFT JOIN warehouses w ON w.id=p.warehouse_id
       WHERE p.active=true AND (p.name ILIKE $1 OR p.sku ILIKE $1 OR p.barcode ILIKE $1 OR p.brand ILIKE $1 OR p.model ILIKE $1)
       ORDER BY p.name LIMIT 20`,
      [`%${q}%`]
    );
    res.json(r.rows);
  } catch(e) { next(e); }
});

// ─── Product summary (KPIs) ─────────────────────────────────────────────

router.get('/summary/:productId', async (req, res, next) => {
  try {
    const p = await db.query('SELECT * FROM products WHERE id=$1', [req.params.productId]);
    if (!p.rows.length) return res.status(404).json({ error: 'Produto não encontrado' });
    const prod = p.rows[0];
    const physical = parseFloat(prod.stock_quantity) || 0;

    const unitCounts = await db.query(
      `SELECT status, COUNT(*)::int as count FROM product_units WHERE product_id=$1 GROUP BY status`,
      [req.params.productId]
    );
    const units = {};
    for (const r of unitCounts.rows) units[r.status] = r.count;

    const reserved = units.reserved || 0;
    const inService = (units.defective || 0);
    const available = physical - reserved;

    res.json({
      product: prod,
      stock: {
        physical,
        reserved,
        available: Math.max(available, 0),
        in_service: inService,
        units_available: units.available || 0,
        units_sold: units.sold || 0,
        units_reserved: units.reserved || 0,
        units_defective: units.defective || 0,
        units_returned: units.returned || 0,
        units_total: Object.values(units).reduce((s, v) => s + v, 0),
      },
    });
  } catch(e) { next(e); }
});

// ─── Movement detail ─────────────────────────────────────────────────────

router.get('/movement/:id', async (req, res, next) => {
  try {
    const r = await db.query(
      `SELECT sm.*,
              p.name as product_name, p.sku, p.barcode, p.brand, p.model, p.image_base64, p.controls_imei,
              u.name as user_name,
              o.number as order_number, o.status as order_status,
              w.name as warehouse_name,
              wd.name as warehouse_dest_name,
              pu.imei as unit_imei, pu.imei2 as unit_imei2, pu.serial as unit_serial, pu.status as unit_status,
              cl.name as partner_client_name,
              cu.name as cancelled_by_name
       FROM stock_movements sm
       JOIN products p ON p.id=sm.product_id
       LEFT JOIN users u ON u.id=sm.user_id
       LEFT JOIN orders o ON o.id=sm.reference_id AND sm.reference_type='order'
       LEFT JOIN warehouses w ON w.id=sm.warehouse_id
       LEFT JOIN warehouses wd ON wd.id=sm.warehouse_dest_id
       LEFT JOIN product_units pu ON pu.id=sm.unit_id
       LEFT JOIN clients cl ON cl.id=sm.partner_id
       LEFT JOIN users cu ON cu.id=sm.cancelled_by
       WHERE sm.id=$1`,
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Movimentação não encontrada' });
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

// ─── Product movements (kardex) ──────────────────────────────────────────

router.get('/product/:id/movements', async (req, res, next) => {
  const { start_date, end_date, movement_type } = req.query;
  const params = [req.params.id];
  let q = `SELECT sm.*, u.name as user_name, o.number as order_number,
                  w.name as warehouse_name, wd.name as warehouse_dest_name,
                  pu.imei as unit_imei, pu.serial as unit_serial,
                  cl.name as partner_client_name
           FROM stock_movements sm
           LEFT JOIN users u ON u.id=sm.user_id
           LEFT JOIN orders o ON o.id=sm.reference_id AND sm.reference_type='order'
           LEFT JOIN warehouses w ON w.id=sm.warehouse_id
           LEFT JOIN warehouses wd ON wd.id=sm.warehouse_dest_id
           LEFT JOIN product_units pu ON pu.id=sm.unit_id
           LEFT JOIN clients cl ON cl.id=sm.partner_id
           WHERE sm.product_id=$1`;
  if (start_date) { params.push(start_date); q += ` AND sm.created_at >= $${params.length}::date`; }
  if (end_date) { params.push(end_date); q += ` AND sm.created_at < $${params.length}::date + interval '1 day'`; }
  if (movement_type) { params.push(movement_type); q += ` AND sm.movement_type=$${params.length}`; }
  q += ' ORDER BY sm.created_at DESC LIMIT 500';
  try { res.json((await db.query(q, params)).rows); } catch(e) { next(e); }
});

// ─── Unit history (IMEI timeline) ────────────────────────────────────────

router.get('/unit/:unitId/history', async (req, res, next) => {
  try {
    const unit = await db.query(
      `SELECT pu.*, p.name as product_name, p.sku, p.brand, p.model,
              o.number as order_number, o.status as order_status
       FROM product_units pu
       JOIN products p ON p.id=pu.product_id
       LEFT JOIN orders o ON o.id=pu.order_id
       WHERE pu.id=$1`,
      [req.params.unitId]
    );
    if (!unit.rows.length) return res.status(404).json({ error: 'Unidade não encontrada' });

    const movs = await db.query(
      `SELECT sm.*, u.name as user_name, o.number as order_number,
              w.name as warehouse_name
       FROM stock_movements sm
       LEFT JOIN users u ON u.id=sm.user_id
       LEFT JOIN orders o ON o.id=sm.reference_id AND sm.reference_type='order'
       LEFT JOIN warehouses w ON w.id=sm.warehouse_id
       WHERE sm.unit_id=$1 ORDER BY sm.created_at DESC`,
      [req.params.unitId]
    );

    res.json({ unit: unit.rows[0], movements: movs.rows });
  } catch(e) { next(e); }
});

// ─── Create movement ─────────────────────────────────────────────────────

router.post('/', validate(schemas.stockMovement), async (req, res, next) => {
  const { product_id, type, quantity, reason, movement_type, document_type,
          document_number, partner_name, partner_id, warehouse_id, warehouse_dest_id,
          cost_unit, channel, unit_id, notes } = req.validated;

  if (['adjustment_pos','adjustment_neg','inventory'].includes(movement_type) && !reason && !notes) {
    return res.status(400).json({ error: 'Motivo é obrigatório para ajustes e inventário' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const p = await client.query('SELECT * FROM products WHERE id=$1 FOR UPDATE', [product_id]);
    if (!p.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Produto não encontrado' }); }

    const prev = parseFloat(p.rows[0].stock_quantity);
    const qty  = parseFloat(quantity);
    let newQty;

    if (type === 'in') newQty = prev + qty;
    else if (type === 'out') newQty = prev - qty;
    else newQty = qty;

    if (type === 'out' && newQty < 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Estoque insuficiente. Disponível: ${prev} ${p.rows[0].unit}` });
    }

    await client.query('UPDATE products SET stock_quantity=$1,updated_at=NOW() WHERE id=$2', [newQty, product_id]);

    const qtyIn  = type === 'in' ? qty : 0;
    const qtyOut = type === 'out' ? qty : 0;
    const costU  = cost_unit ? parseFloat(cost_unit) : (parseFloat(p.rows[0].cost_price) || 0);
    const prevCost = parseFloat(p.rows[0].cost_price) || 0;
    let costAvg = prevCost;
    if (type === 'in' && newQty > 0) {
      costAvg = ((prev * prevCost) + (qty * costU)) / newQty;
    }
    const valTotal = qty * costU;

    const r = await client.query(
      `INSERT INTO stock_movements
       (product_id, type, quantity, previous_qty, new_qty, reason, user_id,
        movement_type, document_type, document_number, partner_name, partner_id,
        warehouse_id, warehouse_dest_id, qty_in, qty_out, cost_unit, cost_avg_after,
        value_total, channel, unit_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING *`,
      [product_id, type, qty, prev, newQty, reason||null, req.user.id,
       movement_type||null, document_type||null, document_number||null,
       partner_name||null, partner_id||null,
       warehouse_id||null, warehouse_dest_id||null,
       qtyIn, qtyOut, costU, costAvg, valTotal,
       channel||null, unit_id||null, notes||null]
    );

    if (type === 'in' && costAvg !== prevCost) {
      await client.query('UPDATE products SET cost_price=$1 WHERE id=$2', [costAvg, product_id]);
    }

    if (unit_id && movement_type) {
      const unitStatusMap = {
        purchase:'available', sale:'sold', return_client:'available',
        return_supplier:'available', service_in:'defective',
        service_out:'available', service_discard:'available',
        reserve:'reserved', unreserve:'available',
      };
      const newStatus = unitStatusMap[movement_type];
      if (newStatus) {
        await client.query('UPDATE product_units SET status=$1,updated_at=NOW() WHERE id=$2', [newStatus, unit_id]);
      }
    }

    await client.query('COMMIT');
    res.status(201).json(r.rows[0]);
  } catch(e) { await client.query('ROLLBACK'); next(e); }
  finally { client.release(); }
});

// ─── Transfer between warehouses ─────────────────────────────────────────

router.post('/transfer', validate(schemas.stockTransfer), async (req, res, next) => {
  const { product_id, quantity, warehouse_id, warehouse_dest_id, reason, unit_id } = req.validated;

  if (String(warehouse_id) === String(warehouse_dest_id)) {
    return res.status(400).json({ error: 'Depósito de origem e destino devem ser diferentes' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const p = await client.query('SELECT * FROM products WHERE id=$1 FOR UPDATE', [product_id]);
    if (!p.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Produto não encontrado' }); }

    const prev = parseFloat(p.rows[0].stock_quantity);
    const qty  = parseFloat(quantity);

    const outMov = await client.query(
      `INSERT INTO stock_movements
       (product_id, type, quantity, previous_qty, new_qty, reason, user_id,
        movement_type, document_type, warehouse_id, warehouse_dest_id, qty_out, unit_id, notes)
       VALUES ($1,'out',$2,$3,$3,$4,$5,'transfer_out','transfer',$6,$7,$2,$8,$4) RETURNING *`,
      [product_id, qty, prev, reason||'Transferência entre depósitos', req.user.id,
       warehouse_id, warehouse_dest_id, unit_id||null]
    );

    const inMov = await client.query(
      `INSERT INTO stock_movements
       (product_id, type, quantity, previous_qty, new_qty, reason, user_id,
        movement_type, document_type, warehouse_id, warehouse_dest_id, qty_in, unit_id, notes,
        reference_id, reference_type)
       VALUES ($1,'in',$2,$3,$3,$4,$5,'transfer_in','transfer',$6,$7,$2,$8,$4,$9,'transfer') RETURNING *`,
      [product_id, qty, prev, reason||'Transferência entre depósitos', req.user.id,
       warehouse_dest_id, warehouse_id, unit_id||null, outMov.rows[0].id]
    );

    await client.query(
      'UPDATE stock_movements SET reference_id=$1,reference_type=$2 WHERE id=$3',
      [inMov.rows[0].id, 'transfer', outMov.rows[0].id]
    );

    await client.query('COMMIT');
    res.status(201).json({ out: outMov.rows[0], in: inMov.rows[0] });
  } catch(e) { await client.query('ROLLBACK'); next(e); }
  finally { client.release(); }
});

// ─── Inventory count ─────────────────────────────────────────────────────

router.post('/inventory', validate(schemas.stockInventory), async (req, res, next) => {
  const { product_id, counted_qty, reason } = req.validated;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const p = await client.query('SELECT * FROM products WHERE id=$1 FOR UPDATE', [product_id]);
    if (!p.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Produto não encontrado' }); }

    const prev = parseFloat(p.rows[0].stock_quantity);
    const counted = parseFloat(counted_qty);
    const diff = counted - prev;

    if (diff === 0) {
      await client.query('ROLLBACK');
      return res.json({ message: 'Estoque já confere com a contagem', diff: 0 });
    }

    await client.query('UPDATE products SET stock_quantity=$1,updated_at=NOW() WHERE id=$2', [counted, product_id]);

    const type = diff > 0 ? 'in' : 'out';
    const qty = Math.abs(diff);
    const r = await client.query(
      `INSERT INTO stock_movements
       (product_id, type, quantity, previous_qty, new_qty, reason, user_id,
        movement_type, document_type, qty_in, qty_out, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'inventory','adjustment',$8,$9,$6) RETURNING *`,
      [product_id, type, qty, prev, counted, reason, req.user.id,
       diff > 0 ? qty : 0, diff < 0 ? qty : 0]
    );

    await client.query('COMMIT');
    res.status(201).json({ movement: r.rows[0], diff });
  } catch(e) { await client.query('ROLLBACK'); next(e); }
  finally { client.release(); }
});

// ─── Cancel / reverse movement ───────────────────────────────────────────

router.post('/movement/:id/cancel', async (req, res, next) => {
  const { cancel_reason } = req.body;
  if (!cancel_reason || !cancel_reason.trim()) {
    return res.status(400).json({ error: 'Motivo do estorno é obrigatório' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const orig = await client.query('SELECT * FROM stock_movements WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!orig.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Movimentação não encontrada' }); }
    const mov = orig.rows[0];

    if (mov.cancelled) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Movimentação já foi cancelada' });
    }

    await client.query(
      'UPDATE stock_movements SET cancelled=true, cancelled_by=$1, cancelled_at=NOW(), cancel_reason=$2 WHERE id=$3',
      [req.user.id, cancel_reason, mov.id]
    );

    const p = await client.query('SELECT * FROM products WHERE id=$1 FOR UPDATE', [mov.product_id]);
    if (!p.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Produto não encontrado' }); }
    const prev = parseFloat(p.rows[0].stock_quantity);
    const qty  = parseFloat(mov.quantity);
    const reverseType = mov.type === 'in' ? 'out' : 'in';
    const newQty = reverseType === 'in' ? prev + qty : prev - qty;

    await client.query('UPDATE products SET stock_quantity=$1,updated_at=NOW() WHERE id=$2', [newQty, mov.product_id]);

    const r = await client.query(
      `INSERT INTO stock_movements
       (product_id, type, quantity, previous_qty, new_qty, reason, user_id,
        movement_type, document_type, reference_id, reference_type,
        qty_in, qty_out, notes, warehouse_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'adjustment',$9,'cancellation',$10,$11,$12,$13) RETURNING *`,
      [mov.product_id, reverseType, qty, prev, newQty,
       `Estorno: ${cancel_reason}`, req.user.id,
       mov.type === 'in' ? 'adjustment_neg' : 'adjustment_pos',
       mov.id, reverseType === 'in' ? qty : 0, reverseType === 'out' ? qty : 0,
       `Estorno da movimentação #${mov.id}`, mov.warehouse_id]
    );

    if (mov.unit_id) {
      await client.query("UPDATE product_units SET status='available',order_id=NULL,updated_at=NOW() WHERE id=$1", [mov.unit_id]);
    }

    await client.query('COMMIT');
    res.json({ cancelled: mov.id, reversal: r.rows[0] });
  } catch(e) { await client.query('ROLLBACK'); next(e); }
  finally { client.release(); }
});

// ─── Users list (for filter) ─────────────────────────────────────────────

router.get('/users', async (_req, res, next) => {
  try {
    const r = await db.query('SELECT id,name FROM users WHERE active=true ORDER BY name');
    res.json(r.rows);
  } catch(e) { next(e); }
});

module.exports = router;
