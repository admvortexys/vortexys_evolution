'use strict';
const router = require('express').Router();
const db = require('../database/db');
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(auth);
router.use(requirePermission('products'));

// Rotas especificas precisam vir antes de /:id.

router.get('/financial', async (req, res, next) => {
  const { type } = req.query;
  let q = 'SELECT DISTINCT ON (name, type) * FROM financial_categories WHERE 1=1';
  const p = [];
  if (type) {
    p.push(type);
    q += ` AND type=$${p.length}`;
  }
  q += ' ORDER BY name, type, id';
  try {
    res.json((await db.query(q, p)).rows);
  } catch (e) {
    next(e);
  }
});

router.post('/financial', async (req, res, next) => {
  const { name, type, color } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
  try {
    const existing = await db.query(
      'SELECT * FROM financial_categories WHERE LOWER(name)=LOWER($1) AND type=$2',
      [name.trim(), type || 'income']
    );
    if (existing.rows.length) return res.status(400).json({ error: 'Categoria já existe' });
    const r = await db.query(
      'INSERT INTO financial_categories (name,type,color) VALUES ($1,$2,$3) RETURNING *',
      [name.trim(), type || 'income', color || '#7c3aed']
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    next(e);
  }
});

router.put('/financial/:id', async (req, res, next) => {
  const { name, color } = req.body;
  try {
    const r = await db.query(
      'UPDATE financial_categories SET name=$1,color=$2 WHERE id=$3 RETURNING *',
      [name, color, req.params.id]
    );
    res.json(r.rows[0]);
  } catch (e) {
    next(e);
  }
});

router.delete('/financial/:id', async (req, res, next) => {
  try {
    await db.query('DELETE FROM financial_categories WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    if (e.code === '23503') return res.status(400).json({ error: 'Categoria em uso, não pode excluir' });
    next(e);
  }
});

router.get('/warehouses', async (req, res, next) => {
  try {
    res.json((await db.query('SELECT DISTINCT ON (name) * FROM warehouses WHERE active=true ORDER BY name, id')).rows);
  } catch (e) {
    next(e);
  }
});

router.post('/warehouses', async (req, res, next) => {
  const { name, location } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
  try {
    const exists = await db.query('SELECT id FROM warehouses WHERE LOWER(name)=LOWER($1)', [name.trim()]);
    if (exists.rows.length) return res.status(400).json({ error: 'Já existe um depósito com este nome' });
    const r = await db.query(
      'INSERT INTO warehouses (name, location) VALUES ($1, $2) RETURNING *',
      [name.trim(), location || null]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Depósito com esse nome já existe' });
    next(e);
  }
});

router.put('/warehouses/:id', async (req, res, next) => {
  const { name, location } = req.body;
  try {
    const r = await db.query(
      'UPDATE warehouses SET name=$1, location=$2 WHERE id=$3 RETURNING *',
      [name, location || null, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Depósito não encontrado' });
    res.json(r.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Depósito com esse nome já existe' });
    next(e);
  }
});

router.delete('/warehouses/:id', async (req, res, next) => {
  try {
    await db.query('UPDATE warehouses SET active=false WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

router.get('/', async (req, res, next) => {
  const { type } = req.query;
  let q = 'SELECT DISTINCT ON (name, type) * FROM categories WHERE 1=1';
  const p = [];
  if (type) {
    p.push(type);
    q += ` AND type=$${p.length}`;
  }
  q += ' ORDER BY name, type, id';
  try {
    res.json((await db.query(q, p)).rows);
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  const { name, type, color } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
  try {
    const existing = await db.query(
      'SELECT * FROM categories WHERE LOWER(name)=LOWER($1) AND type=$2',
      [name.trim(), type || 'product']
    );
    if (existing.rows.length) return res.status(400).json({ error: 'Categoria já existe' });
    const r = await db.query(
      'INSERT INTO categories (name,type,color) VALUES ($1,$2,$3) RETURNING *',
      [name.trim(), type || 'product', color || '#7c3aed']
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    next(e);
  }
});

router.put('/:id', async (req, res, next) => {
  const { name, color } = req.body;
  try {
    const r = await db.query(
      'UPDATE categories SET name=$1,color=$2 WHERE id=$3 RETURNING *',
      [name, color, req.params.id]
    );
    res.json(r.rows[0]);
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await db.query('DELETE FROM categories WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    if (e.code === '23503') return res.status(400).json({ error: 'Categoria em uso, não pode excluir' });
    next(e);
  }
});

module.exports = router;