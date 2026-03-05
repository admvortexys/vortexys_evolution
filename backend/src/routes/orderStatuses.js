'use strict';
const router = require('express').Router();
const db     = require('../database/db');
const auth   = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
router.use(auth);

router.get('/', async (req, res, next) => {
  try {
    res.json((await db.query('SELECT * FROM order_statuses ORDER BY position ASC, id ASC')).rows);
  } catch(e) { next(e); }
});

function slugify(text) {
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    .slice(0, 50);
}

router.post('/', requireRole('admin'), async (req, res, next) => {
  const { label, color, stock_action, reserve_days, position } = req.body || {};
  if (!label) return res.status(400).json({ error: 'Nome do status é obrigatório' });
  if (stock_action && !['none','reserve','deduct','return','cancel'].includes(stock_action))
    return res.status(400).json({ error: 'stock_action inválido' });
  try {
    let slug = slugify(label);
    const existing = await db.query('SELECT id FROM order_statuses WHERE slug=$1', [slug]);
    if (existing.rows.length) slug = `${slug}_${Date.now()}`;
    const r = await db.query(
      'INSERT INTO order_statuses (slug,label,color,stock_action,reserve_days,position) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [slug, label, color||'#6366f1', stock_action||'none', reserve_days||null, position||0]
    );
    res.status(201).json(r.rows[0]);
  } catch(e) { next(e); }
});

router.put('/:id', requireRole('admin'), async (req, res, next) => {
  const { label, color, stock_action, reserve_days, position } = req.body || {};
  try {
    const r = await db.query(
      'UPDATE order_statuses SET label=$1,color=$2,stock_action=$3,reserve_days=$4,position=$5 WHERE id=$6 AND is_system=false RETURNING *',
      [label, color||'#6366f1', stock_action||'none', reserve_days||null, position||0, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Status não encontrado ou é status de sistema' });
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const r = await db.query('DELETE FROM order_statuses WHERE id=$1 AND is_system=false RETURNING id', [req.params.id]);
    if (!r.rows.length) return res.status(400).json({ error: 'Status não encontrado ou é status de sistema' });
    res.json({ success: true });
  } catch(e) { next(e); }
});

module.exports = router;
