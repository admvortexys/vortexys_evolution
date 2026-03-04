'use strict';
const router = require('express').Router();
const db     = require('../database/db');
const auth   = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
router.use(auth);
router.use(requirePermission('crm'));

router.get('/', async (req, res, next) => {
  try { res.json((await db.query('SELECT * FROM pipelines ORDER BY position')).rows); }
  catch(e) { next(e); }
});

router.post('/', async (req, res, next) => {
  const { name, color, position } = req.body;
  if (!name) return res.status(400).json({ error: 'name é obrigatório' });
  try {
    const r = await db.query(
      'INSERT INTO pipelines (name,color,position) VALUES ($1,$2,$3) RETURNING *',
      [name, color || '#7c3aed', position || 0]
    );
    res.status(201).json(r.rows[0]);
  } catch(e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  const { name, color, position } = req.body;
  try {
    const r = await db.query(
      'UPDATE pipelines SET name=$1,color=$2,position=$3 WHERE id=$4 RETURNING *',
      [name, color, position, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await db.query('DELETE FROM pipelines WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch(e) { next(e); }
});

module.exports = router;
