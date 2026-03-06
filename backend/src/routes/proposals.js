'use strict';
const router = require('express').Router();
const db = require('../database/db');
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
router.use(auth);
router.use(requirePermission('crm'));

const VALID_STATUSES = ['draft', 'sent', 'approved', 'rejected'];

async function getNextNumber() {
  const r = await db.query(
    `SELECT number FROM proposals WHERE number ~ '^PROP-[0-9]+$' ORDER BY CAST(SUBSTRING(number FROM 6) AS INTEGER) DESC LIMIT 1`
  );
  const last = r.rows[0]?.number;
  const next = last ? parseInt(last.replace('PROP-', ''), 10) + 1 : 1;
  return `PROP-${String(next).padStart(5, '0')}`;
}

function calcFromItems(items) {
  if (!Array.isArray(items) || !items.length) return { subtotal: 0 };
  let subtotal = 0;
  for (const it of items) {
    const qty = parseFloat(it.quantity) || 0;
    const price = parseFloat(it.unit_price ?? it.price ?? 0);
    const disc = parseFloat(it.discount) || 0;
    subtotal += qty * price - disc;
  }
  return { subtotal };
}

// GET / - List all proposals with optional filters
router.get('/', async (req, res, next) => {
  const { status, lead_id, client_id, search } = req.query;
  let q = `SELECT p.*, l.name as lead_name, c.name as client_name, u.name as user_name
           FROM proposals p
           LEFT JOIN leads l ON l.id=p.lead_id
           LEFT JOIN clients c ON c.id=p.client_id
           LEFT JOIN users u ON u.id=p.user_id
           WHERE 1=1`;
  const params = [];
  if (status) { params.push(status); q += ` AND p.status=$${params.length}`; }
  if (lead_id) { params.push(lead_id); q += ` AND p.lead_id=$${params.length}`; }
  if (client_id) { params.push(client_id); q += ` AND p.client_id=$${params.length}`; }
  if (search) {
    params.push(`%${search}%`);
    q += ` AND (p.title ILIKE $${params.length} OR p.number ILIKE $${params.length})`;
  }
  q += ' ORDER BY p.created_at DESC';
  try {
    res.json((await db.query(q, params)).rows);
  } catch (e) {
    next(e);
  }
});

// GET /next-number - Must be before GET /:id
router.get('/next-number', async (req, res, next) => {
  try {
    const number = await getNextNumber();
    res.json({ number });
  } catch (e) {
    next(e);
  }
});

// GET /:id - Get single proposal with joins
router.get('/:id', async (req, res, next) => {
  try {
    const r = await db.query(
      `SELECT p.*, l.name as lead_name, l.company as lead_company, l.email as lead_email, l.phone as lead_phone,
              c.name as client_name, c.email as client_email, c.phone as client_phone,
              u.name as user_name
       FROM proposals p
       LEFT JOIN leads l ON l.id=p.lead_id
       LEFT JOIN clients c ON c.id=p.client_id
       LEFT JOIN users u ON u.id=p.user_id
       WHERE p.id=$1`,
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    res.json(r.rows[0]);
  } catch (e) {
    next(e);
  }
});

// POST / - Create proposal
router.post('/', async (req, res, next) => {
  const { number, lead_id, client_id, title, items = [], discount = 0, status, version, notes, valid_until } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title é obrigatório' });
  try {
    let num = number;
    if (!num) num = await getNextNumber();
    const { subtotal } = calcFromItems(items);
    const disc = parseFloat(discount) || 0;
    const total = subtotal - disc;
    const r = await db.query(
      `INSERT INTO proposals (number, lead_id, client_id, title, items, subtotal, discount, total, status, version, notes, valid_until, user_id)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [
        num,
        lead_id || null,
        client_id || null,
        title,
        JSON.stringify(items),
        subtotal,
        disc,
        total,
        status || 'draft',
        version || 1,
        notes || null,
        valid_until || null,
        req.user.id
      ]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    next(e);
  }
});

// PUT /:id - Update proposal
router.put('/:id', async (req, res, next) => {
  const { number, lead_id, client_id, title, items, discount, status, version, notes, valid_until } = req.body || {};
  try {
    const existing = await db.query(
      'SELECT subtotal, discount, items FROM proposals WHERE id=$1',
      [req.params.id]
    );
    if (!existing.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    const ex = existing.rows[0];

    const itemsToUse = items !== undefined ? items : (ex.items || []);
    const { subtotal: finalSubtotal } = calcFromItems(itemsToUse);
    const finalDiscount = discount !== undefined ? parseFloat(discount) || 0 : parseFloat(ex.discount) || 0;
    const total = finalSubtotal - finalDiscount;
    const itemsJson = items !== undefined ? JSON.stringify(items) : null;

    const r = await db.query(
      `UPDATE proposals SET
        number=COALESCE($1, number),
        lead_id=COALESCE($2, lead_id),
        client_id=COALESCE($3, client_id),
        title=COALESCE($4, title),
        items=COALESCE($5::jsonb, items),
        subtotal=$6,
        discount=$7,
        total=$8,
        status=COALESCE($9, status),
        version=COALESCE($10, version),
        notes=COALESCE($11, notes),
        valid_until=COALESCE($12, valid_until),
        updated_at=NOW()
       WHERE id=$13 RETURNING *`,
      [
        number,
        lead_id,
        client_id,
        title,
        items !== undefined ? itemsJson : null,
        finalSubtotal,
        finalDiscount,
        total,
        status,
        version,
        notes,
        valid_until,
        req.params.id
      ]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    res.json(r.rows[0]);
  } catch (e) {
    next(e);
  }
});

// PATCH /:id/status - Change status only
router.patch('/:id/status', async (req, res, next) => {
  const { status } = req.body || {};
  if (!status || !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'status inválido. Use: draft, sent, approved, rejected' });
  }
  try {
    const prop = await db.query(
      'SELECT id, lead_id, status FROM proposals WHERE id=$1',
      [req.params.id]
    );
    if (!prop.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    const p = prop.rows[0];

    const r = await db.query(
      'UPDATE proposals SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
      [status, req.params.id]
    );

    if (status === 'approved' && p.lead_id) {
      const pipe = await db.query(
        "SELECT id FROM pipelines WHERE name='Orçamento enviado' LIMIT 1"
      );
      if (pipe.rows.length) {
        await db.query(
          'UPDATE leads SET pipeline_id=$1, updated_at=NOW() WHERE id=$2',
          [pipe.rows[0].id, p.lead_id]
        );
      }
    }

    res.json(r.rows[0]);
  } catch (e) {
    next(e);
  }
});

// DELETE /:id - Delete proposal (only if status is 'draft')
router.delete('/:id', async (req, res, next) => {
  try {
    const check = await db.query('SELECT status FROM proposals WHERE id=$1', [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    if (check.rows[0].status !== 'draft') {
      return res.status(400).json({ error: 'Só é possível excluir propostas em rascunho' });
    }
    await db.query('DELETE FROM proposals WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
