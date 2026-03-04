'use strict';
const router = require('express').Router();
const db     = require('../database/db');
const auth   = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
router.use(auth);
router.use(requirePermission('crm'));

router.get('/', async (req, res, next) => {
  const { lead_id, done } = req.query;
  let q = `SELECT a.*,u.name as user_name FROM activities a
           LEFT JOIN users u ON u.id=a.user_id WHERE 1=1`;
  const p = [];
  if (lead_id)        { p.push(lead_id);       q += ` AND a.lead_id=$${p.length}`; }
  if (done !== undefined) { p.push(done === 'true'); q += ` AND a.done=$${p.length}`; }
  q += ' ORDER BY a.created_at DESC';
  try { res.json((await db.query(q, p)).rows); } catch(e) { next(e); }
});

router.post('/', async (req, res, next) => {
  const { lead_id, type, title, description, due_date } = req.body;
  if (!lead_id || !type || !title) return res.status(400).json({ error: 'lead_id, type e title são obrigatórios' });
  try {
    const r = await db.query(
      'INSERT INTO activities (lead_id,type,title,description,due_date,user_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [lead_id, type, title, description, due_date, req.user.id]
    );
    res.status(201).json(r.rows[0]);
  } catch(e) { next(e); }
});

router.patch('/:id/done', async (req, res, next) => {
  try {
    const r = await db.query('UPDATE activities SET done=true WHERE id=$1 RETURNING *', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await db.query('DELETE FROM activities WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch(e) { next(e); }
});

module.exports = router;
