/**
 * Devoluções: criar devolução vinculada a pedido, processar, creditar cliente.
 * Exige permissão orders+stock+financial (write).
 */
const { Router } = require('express');
const db = require('../database/db');
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

const router = Router();
router.use(auth);
router.use(requirePermission('orders', 'write'));
router.use(requirePermission('stock', 'write'));
router.use(requirePermission('financial', 'write'));

const RETURN_TYPES = { return_client:'Devolução cliente', exchange:'Troca', warranty:'Garantia', supplier_return:'Devolução fornecedor' };
const REASONS = { defect:'Defeito', regret:'Arrependimento', exchange:'Troca', warranty:'Garantia', wrong_product:'Produto errado', other:'Outro' };
const CONDITIONS = { new:'Novo/lacrado', open:'Aberto', damaged:'Avariado', defective:'Defeituoso' };
const DESTINATIONS = { available:'Estoque disponível', quarantine:'Quarentena', service:'Assistência/OS', scrap:'Sucata/descarte', supplier_return:'Devolução fornecedor' };
const STATUSES = ['draft','analyzing','approved','processed','finished','cancelled'];

router.get('/meta', (_req, res) => {
  res.json({ types: RETURN_TYPES, reasons: REASONS, conditions: CONDITIONS, destinations: DESTINATIONS, statuses: STATUSES });
});

// ─── Find order to return ──────────────────────────────────────────────────
router.get('/find-order', async (req, res, next) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json([]);
  try {
    const rows = await db.query(
      `SELECT o.*, c.name as client_name, c.phone as client_phone, c.document as client_document,
              os.label as status_label, os.color as status_color
       FROM orders o
       LEFT JOIN clients c ON c.id = o.client_id
       LEFT JOIN order_statuses os ON os.slug = o.status
       WHERE o.status IN ('confirmed','separated','processing','shipped','delivered','returned')
         AND (o.number ILIKE $1 OR c.document ILIKE $1 OR c.phone ILIKE $1 OR c.name ILIKE $1
              OR o.walk_in_name ILIKE $1 OR o.walk_in_document ILIKE $1
              OR EXISTS (SELECT 1 FROM order_items oi JOIN product_units pu ON pu.id=oi.unit_id WHERE oi.order_id=o.id AND (pu.imei ILIKE $1 OR pu.imei2 ILIKE $1 OR pu.serial ILIKE $1)))
       ORDER BY o.created_at DESC LIMIT 10`,
      [`%${q}%`]
    );
    res.json(rows.rows);
  } catch(e) { next(e); }
});

router.get('/order-items/:orderId', async (req, res, next) => {
  try {
    const items = await db.query(
      `SELECT oi.*, p.name as product_name, p.sku, p.brand, p.model, p.controls_imei,
              pu.imei, pu.imei2, pu.serial as unit_serial, pu.status as unit_status
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       LEFT JOIN product_units pu ON pu.id = oi.unit_id
       WHERE oi.order_id = $1
       ORDER BY oi.id`, [req.params.orderId]
    );
    const alreadyReturned = await db.query(
      `SELECT ri.order_item_id, SUM(ri.quantity_returned) as qty_returned
       FROM return_items ri JOIN returns r ON r.id = ri.return_id
       WHERE r.order_id = $1 AND r.status NOT IN ('cancelled')
       GROUP BY ri.order_item_id`, [req.params.orderId]
    );
    const returnedMap = {};
    for (const r of alreadyReturned.rows) returnedMap[r.order_item_id] = parseFloat(r.qty_returned);

    const result = items.rows.map(it => ({
      ...it,
      already_returned: returnedMap[it.id] || 0,
      returnable_qty: parseFloat(it.quantity) - (returnedMap[it.id] || 0),
    }));
    res.json(result);
  } catch(e) { next(e); }
});

// ─── List returns ──────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  const { status, type, search, start_date, end_date } = req.query;
  const where = []; const params = []; let idx = 0;
  if (status) { where.push(`r.status=$${++idx}`); params.push(status); }
  if (type) { where.push(`r.type=$${++idx}`); params.push(type); }
  if (start_date) { where.push(`r.created_at >= $${++idx}`); params.push(start_date); }
  if (end_date) { where.push(`r.created_at <= ($${++idx}::date + interval '1 day')`); params.push(end_date); }
  if (search) {
    where.push(`(r.number ILIKE $${++idx} OR r.order_number ILIKE $${idx} OR r.client_name ILIKE $${idx} OR r.notes ILIKE $${idx})`);
    params.push(`%${search}%`);
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  try {
    const rows = await db.query(
      `SELECT r.*, u.name as created_by_name, ua.name as approved_by_name
       FROM returns r
       LEFT JOIN users u ON u.id = r.created_by
       LEFT JOIN users ua ON ua.id = r.approved_by
       ${w} ORDER BY r.created_at DESC LIMIT 500`, params
    );
    res.json(rows.rows);
  } catch(e) { next(e); }
});

// ─── Get return detail ─────────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const r = await db.query(
      `SELECT r.*, u.name as created_by_name, ua.name as approved_by_name,
              c.phone as client_phone, c.document as client_document, c.email as client_email
       FROM returns r
       LEFT JOIN users u ON u.id = r.created_by
       LEFT JOIN users ua ON ua.id = r.approved_by
       LEFT JOIN clients c ON c.id = r.client_id
       WHERE r.id=$1`, [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Devolução não encontrada' });
    const items = await db.query(
      `SELECT ri.*, p.brand, p.model, p.controls_imei
       FROM return_items ri
       LEFT JOIN products p ON p.id = ri.product_id
       WHERE ri.return_id=$1 ORDER BY ri.id`, [req.params.id]
    );
    let credit = null;
    if (r.rows[0].credit_id) {
      const cr = await db.query('SELECT * FROM client_credits WHERE id=$1', [r.rows[0].credit_id]);
      if (cr.rows.length) credit = cr.rows[0];
    }
    res.json({ ...r.rows[0], items: items.rows, credit });
  } catch(e) { next(e); }
});

// ─── Create return (draft) ─────────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  const { order_id, type, origin, items, checklist, refund_type, refund_method, notes } = req.body || {};
  if (!order_id) return res.status(400).json({ error: 'Pedido é obrigatório' });
  if (!items || !items.length) return res.status(400).json({ error: 'Selecione pelo menos um item' });

  const conn = await db.connect();
  try {
    await conn.query('BEGIN');
    const order = await conn.query('SELECT * FROM orders WHERE id=$1', [order_id]);
    if (!order.rows.length) return res.status(404).json({ error: 'Pedido não encontrado' });
    const ord = order.rows[0];

    if (!['confirmed','separated','delivered'].includes(ord.status)) {
      return res.status(400).json({ error: 'Só é possível devolver pedidos confirmados, separados ou entregues' });
    }

    const clientRow = ord.client_id ? await conn.query('SELECT name FROM clients WHERE id=$1', [ord.client_id]) : null;
    const clientName = clientRow?.rows?.[0]?.name || ord.walk_in_name || 'Consumidor final';

    await conn.query('LOCK TABLE returns IN SHARE ROW EXCLUSIVE MODE');
    const cnt = await conn.query('SELECT COUNT(*) FROM returns');
    const num = `DEV-${String(parseInt(cnt.rows[0].count) + 1).padStart(5, '0')}`;

    let totalRefund = 0;
    for (const it of items) {
      if (!it.product_id) return res.status(400).json({ error: 'Item sem produto' });
      if (!it.quantity_returned || parseFloat(it.quantity_returned) <= 0) return res.status(400).json({ error: 'Quantidade inválida' });

      const oiRow = await conn.query('SELECT * FROM order_items WHERE id=$1 AND order_id=$2', [it.order_item_id, order_id]);
      if (!oiRow.rows.length) return res.status(400).json({ error: `Item ${it.order_item_id} não pertence ao pedido` });
      const oi = oiRow.rows[0];

      const alreadyRet = await conn.query(
        `SELECT COALESCE(SUM(ri.quantity_returned),0) as qty FROM return_items ri
         JOIN returns r ON r.id=ri.return_id WHERE ri.order_item_id=$1 AND r.status NOT IN ('cancelled')`,
        [it.order_item_id]
      );
      const maxQty = parseFloat(oi.quantity) - parseFloat(alreadyRet.rows[0].qty);
      if (parseFloat(it.quantity_returned) > maxQty + 0.01) {
        return res.status(400).json({ error: `Quantidade máxima para devolver deste item: ${maxQty}` });
      }

      if (it.unit_id) {
        const unitCheck = await conn.query('SELECT * FROM product_units WHERE id=$1', [it.unit_id]);
        if (!unitCheck.rows.length) return res.status(400).json({ error: 'Unidade IMEI não encontrada' });
        const existingReturn = await conn.query(
          `SELECT ri.id FROM return_items ri JOIN returns r ON r.id=ri.return_id WHERE ri.unit_id=$1 AND r.status NOT IN ('cancelled')`,
          [it.unit_id]
        );
        if (existingReturn.rows.length) return res.status(400).json({ error: `IMEI/Serial já devolvido anteriormente` });
      }

      totalRefund += parseFloat(it.total_refund) || ((parseFloat(it.quantity_returned) * parseFloat(oi.unit_price)) - (parseFloat(oi.discount) || 0));
    }

    const ret = await conn.query(
      `INSERT INTO returns (number,order_id,order_number,client_id,client_name,status,type,origin,
       subtotal,total_refund,refund_type,refund_method,checklist,notes,created_by)
       VALUES ($1,$2,$3,$4,$5,'draft',$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14) RETURNING *`,
      [num, order_id, ord.number, ord.client_id, clientName, type||'return_client', origin||'balcao',
       totalRefund, totalRefund, refund_type||null, refund_method||null,
       JSON.stringify(checklist||{}), notes||null, req.user.id]
    );

    for (const it of items) {
      const oiRow = await conn.query('SELECT * FROM order_items WHERE id=$1', [it.order_item_id]);
      const oi = oiRow.rows[0];
      const pRow = await conn.query('SELECT name,sku FROM products WHERE id=$1', [it.product_id]);
      const p = pRow.rows[0] || {};
      let imei = null, imei2 = null, serialNum = null;
      if (it.unit_id) {
        const uRow = await conn.query('SELECT imei,imei2,serial FROM product_units WHERE id=$1', [it.unit_id]);
        if (uRow.rows.length) { imei = uRow.rows[0].imei; imei2 = uRow.rows[0].imei2; serialNum = uRow.rows[0].serial; }
      }
      const itemRefund = parseFloat(it.total_refund) || ((parseFloat(it.quantity_returned) * parseFloat(oi.unit_price)) - (parseFloat(oi.discount) || 0));
      await conn.query(
        `INSERT INTO return_items (return_id,order_item_id,product_id,unit_id,product_name,sku,imei,imei2,serial_number,
         quantity_original,quantity_returned,unit_price,discount,total_refund,reason,condition,stock_destination,notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [ret.rows[0].id, it.order_item_id, it.product_id, it.unit_id||null, p.name, p.sku,
         imei, imei2, serialNum,
         oi.quantity, it.quantity_returned, oi.unit_price, oi.discount||0, itemRefund,
         it.reason||'other', it.condition||'open', it.stock_destination||'available', it.notes||null]
      );
    }

    await conn.query('COMMIT');
    res.status(201).json(ret.rows[0]);
  } catch(e) { await conn.query('ROLLBACK'); next(e); }
  finally { conn.release(); }
});

// ─── Change return status ──────────────────────────────────────────────────
router.patch('/:id/status', async (req, res, next) => {
  const { status, notes } = req.body || {};
  if (!status || !STATUSES.includes(status)) return res.status(400).json({ error: 'Status inválido' });

  const conn = await db.connect();
  try {
    await conn.query('BEGIN');
    const cur = await conn.query('SELECT * FROM returns WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Devolução não encontrada' });
    const ret = cur.rows[0];

    const TRANSITIONS = {
      draft: ['analyzing','cancelled'],
      analyzing: ['approved','cancelled'],
      approved: ['processed','cancelled'],
      processed: ['finished'],
      finished: [],
      cancelled: [],
    };
    if (!TRANSITIONS[ret.status]?.includes(status)) {
      return res.status(400).json({ error: `Não é possível ir de "${ret.status}" para "${status}"` });
    }

    const items = await conn.query('SELECT * FROM return_items WHERE return_id=$1', [req.params.id]);

    if (status === 'processed') {
      const order = await conn.query('SELECT * FROM orders WHERE id=$1', [ret.order_id]);
      const ord = order.rows[0];

      for (const it of items.rows) {
        const qty = parseFloat(it.quantity_returned);
        const dest = it.stock_destination;

        if (dest === 'available') {
          const p = await conn.query('SELECT stock_quantity FROM products WHERE id=$1', [it.product_id]);
          if (p.rows.length) {
            const prev = parseFloat(p.rows[0].stock_quantity);
            const newQty = prev + qty;
            await conn.query('UPDATE products SET stock_quantity=$1,updated_at=NOW() WHERE id=$2', [newQty, it.product_id]);
            await conn.query(
              `INSERT INTO stock_movements (product_id,type,quantity,previous_qty,new_qty,reason,reference_id,reference_type,user_id,movement_type,document_type,document_number,qty_in)
               VALUES ($1,'in',$2,$3,$4,$5,$6,'return',$7,'return_client','return',$8,$2)`,
              [it.product_id, qty, prev, newQty, `Devolução ${ret.number} — estoque disponível`, req.params.id, req.user.id, ret.number]
            );
          }
          if (it.unit_id) await conn.query("UPDATE product_units SET status='available',order_id=NULL,updated_at=NOW() WHERE id=$1", [it.unit_id]);
        } else if (dest === 'quarantine') {
          const p = await conn.query('SELECT stock_quantity FROM products WHERE id=$1', [it.product_id]);
          if (p.rows.length) {
            const prev = parseFloat(p.rows[0].stock_quantity);
            await conn.query(
              `INSERT INTO stock_movements (product_id,type,quantity,previous_qty,new_qty,reason,reference_id,reference_type,user_id,movement_type,document_type,document_number,qty_in,notes)
               VALUES ($1,'in',$2,$3,$3,$4,$5,'return',$6,'return_client','return',$7,$2,'Quarentena')`,
              [it.product_id, qty, prev, `Devolução ${ret.number} — quarentena`, req.params.id, req.user.id, ret.number]
            );
          }
          if (it.unit_id) await conn.query("UPDATE product_units SET status='quarantine',order_id=NULL,updated_at=NOW() WHERE id=$1", [it.unit_id]);
        } else if (dest === 'service') {
          const p = await conn.query('SELECT stock_quantity FROM products WHERE id=$1', [it.product_id]);
          if (p.rows.length) {
            const prev = parseFloat(p.rows[0].stock_quantity);
            await conn.query(
              `INSERT INTO stock_movements (product_id,type,quantity,previous_qty,new_qty,reason,reference_id,reference_type,user_id,movement_type,document_type,document_number,qty_in,notes)
               VALUES ($1,'in',$2,$3,$3,$4,$5,'return',$6,'return_client','return',$7,$2,'Assistência técnica')`,
              [it.product_id, qty, prev, `Devolução ${ret.number} — assistência`, req.params.id, req.user.id, ret.number]
            );
          }
          if (it.unit_id) await conn.query("UPDATE product_units SET status='in_service',order_id=NULL,updated_at=NOW() WHERE id=$1", [it.unit_id]);
        } else if (dest === 'scrap') {
          const p = await conn.query('SELECT stock_quantity FROM products WHERE id=$1', [it.product_id]);
          if (p.rows.length) {
            const prev = parseFloat(p.rows[0].stock_quantity);
            await conn.query(
              `INSERT INTO stock_movements (product_id,type,quantity,previous_qty,new_qty,reason,reference_id,reference_type,user_id,movement_type,document_type,document_number,notes)
               VALUES ($1,'out',$2,$3,$3,$4,$5,'return',$6,'adjustment','return',$7,'Sucata/descarte')`,
              [it.product_id, qty, prev, `Devolução ${ret.number} — sucata`, req.params.id, req.user.id, ret.number]
            );
          }
          if (it.unit_id) await conn.query("UPDATE product_units SET status='scrapped',order_id=NULL,updated_at=NOW() WHERE id=$1", [it.unit_id]);
        } else if (dest === 'supplier_return') {
          const p = await conn.query('SELECT stock_quantity FROM products WHERE id=$1', [it.product_id]);
          if (p.rows.length) {
            const prev = parseFloat(p.rows[0].stock_quantity);
            await conn.query(
              `INSERT INTO stock_movements (product_id,type,quantity,previous_qty,new_qty,reason,reference_id,reference_type,user_id,movement_type,document_type,document_number,qty_out,notes)
               VALUES ($1,'out',$2,$3,$3,$4,$5,'return',$6,'return_supplier','return',$7,$2,'Devolução ao fornecedor')`,
              [it.product_id, qty, prev, `Devolução ${ret.number} — fornecedor`, req.params.id, req.user.id, ret.number]
            );
          }
          if (it.unit_id) await conn.query("UPDATE product_units SET status='supplier_return',order_id=NULL,updated_at=NOW() WHERE id=$1", [it.unit_id]);
        }
      }

      // Financial settlement
      if (ret.refund_type === 'credit' && ret.client_id) {
        const creditCnt = await conn.query('SELECT COUNT(*) FROM client_credits');
        const creditNum = `CRED-${String(parseInt(creditCnt.rows[0].count) + 1).padStart(5, '0')}`;
        const itemsJson = items.rows.map(it => ({
          product_id: it.product_id, product_name: it.product_name, sku: it.sku,
          quantity: it.quantity_returned, unit_price: it.unit_price, total: it.total_refund,
        }));
        const cr = await conn.query(
          `INSERT INTO client_credits (number,client_id,order_id,type,amount,balance,reason,order_number,order_total,order_items,created_by)
           VALUES ($1,$2,$3,'store_credit',$4,$4,$5,$6,$7,$8::jsonb,$9) RETURNING *`,
          [creditNum, ret.client_id, ret.order_id, ret.total_refund,
           `Devolução ${ret.number}`, ret.order_number, ret.total_refund, JSON.stringify(itemsJson), req.user.id]
        );
        await conn.query('UPDATE returns SET credit_id=$1 WHERE id=$2', [cr.rows[0].id, req.params.id]);

      } else if (ret.refund_type === 'refund') {
        const creditCnt = await conn.query('SELECT COUNT(*) FROM client_credits');
        const creditNum = `EST-${String(parseInt(creditCnt.rows[0].count) + 1).padStart(5, '0')}`;
        const itemsJson = items.rows.map(it => ({
          product_id: it.product_id, product_name: it.product_name, sku: it.sku,
          quantity: it.quantity_returned, unit_price: it.unit_price, total: it.total_refund,
        }));
        await conn.query(
          `INSERT INTO client_credits (number,client_id,order_id,type,amount,used_amount,balance,status,reason,order_number,order_total,order_items,created_by)
           VALUES ($1,$2,$3,'refund',$4,$4,0,'settled',$5,$6,$7,$8::jsonb,$9)`,
          [creditNum, ret.client_id, ret.order_id, ret.total_refund,
           `Estorno ${ret.number}`, ret.order_number, ret.total_refund, JSON.stringify(itemsJson), req.user.id]
        );
        if (ret.client_id) {
          await conn.query(
            `INSERT INTO transactions (type,title,amount,due_date,paid,paid_date,client_id,order_id,notes,user_id)
             VALUES ('expense',$1,$2,CURRENT_DATE,true,CURRENT_DATE,$3,$4,$5,$6)`,
            [`Estorno devolução ${ret.number}`, ret.total_refund, ret.client_id, ret.order_id,
             `Devolução ${ret.number} — ${ret.refund_method || 'estorno'}`, req.user.id]
          );
        }
      }
    }

    const updates = ['status=$1','updated_at=NOW()'];
    const params = [status];
    let pidx = 1;
    if (status === 'approved') { updates.push(`approved_by=$${++pidx}`); params.push(req.user.id); }
    if (notes) { updates.push(`notes=COALESCE(notes,'')||E'\\n'||$${++pidx}`); params.push(notes); }
    params.push(req.params.id);
    const r = await conn.query(`UPDATE returns SET ${updates.join(',')} WHERE id=$${pidx+1} RETURNING *`, params);

    await conn.query('COMMIT');
    res.json(r.rows[0]);
  } catch(e) { await conn.query('ROLLBACK'); next(e); }
  finally { conn.release(); }
});

// ─── Delete draft ──────────────────────────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    const r = await db.query("DELETE FROM returns WHERE id=$1 AND status='draft' RETURNING id", [req.params.id]);
    if (!r.rows.length) return res.status(400).json({ error: 'Só é possível excluir devoluções em rascunho' });
    res.json({ success: true });
  } catch(e) { next(e); }
});

module.exports = router;
