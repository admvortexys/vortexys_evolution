'use strict';
const router = require('express').Router();
const db     = require('../database/db');
const auth   = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
router.use(auth);
router.use(requirePermission('products'));

// ── Categorias financeiras ──
// ATENÇÃO: rotas específicas (/financial, /warehouses) DEVEM vir ANTES de /:id
// para o Express não interpretá-las como parâmetros de rota.

router.get('/financial', async (req, res, next) => {
  const { type } = req.query;
  let q = 'SELECT * FROM financial_categories WHERE 1=1';
  const p = [];
  if (type) { p.push(type); q += ` AND type=$${p.length}`; }
  q += ' ORDER BY name';
  try { res.json((await db.query(q, p)).rows); } catch(e) { next(e); }
});

router.post('/financial', async (req, res, next) => {
  const { name, type, color } = req.body;
  try {
    const r = await db.query(
      'INSERT INTO financial_categories (name,type,color) VALUES ($1,$2,$3) RETURNING *',
      [name, type || 'income', color || '#7c3aed']
    );
    res.status(201).json(r.rows[0]);
  } catch(e) { next(e); }
});

router.put('/financial/:id', async (req, res, next) => {
  const { name, color } = req.body;
  try {
    const r = await db.query(
      'UPDATE financial_categories SET name=$1,color=$2 WHERE id=$3 RETURNING *',
      [name, color, req.params.id]
    );
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

router.delete('/financial/:id', async (req, res, next) => {
  try {
    await db.query('DELETE FROM financial_categories WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch(e) {
    if (e.code === '23503') return res.status(400).json({ error: 'Categoria em uso, não pode excluir' });
    next(e);
  }
});

// ── Depósitos ──
router.get('/warehouses', async (req, res, next) => {
  try {
    res.json((await db.query('SELECT * FROM warehouses WHERE active=true ORDER BY name')).rows);
  } catch(e) { next(e); }
});

// ── Categorias de produtos ──
router.get('/', async (req, res, next) => {
  const { type } = req.query;
  let q = 'SELECT * FROM categories WHERE 1=1';
  const p = [];
  if (type) { p.push(type); q += ` AND type=$${p.length}`; }
  q += ' ORDER BY name';
  try { res.json((await db.query(q, p)).rows); } catch(e) { next(e); }
});

router.post('/', async (req, res, next) => {
  const { name, type, color } = req.body;
  try {
    const r = await db.query(
      'INSERT INTO categories (name,type,color) VALUES ($1,$2,$3) RETURNING *',
      [name, type || 'product', color || '#7c3aed']
    );
    res.status(201).json(r.rows[0]);
  } catch(e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  const { name, color } = req.body;
  try {
    const r = await db.query(
      'UPDATE categories SET name=$1,color=$2 WHERE id=$3 RETURNING *',
      [name, color, req.params.id]
    );
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await db.query('DELETE FROM categories WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch(e) {
    if (e.code === '23503') return res.status(400).json({ error: 'Categoria em uso, não pode excluir' });
    next(e);
  }
});

module.exports = router;
