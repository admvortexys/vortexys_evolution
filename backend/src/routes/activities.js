'use strict';
const router = require('express').Router();
const db     = require('../database/db');
const auth   = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
router.use(auth);
router.use(requirePermission('crm'));

router.get('/', async (req, res, next) => {
  const { lead_id, client_id, done, user_id } = req.query;
  let q = `SELECT a.*,u.name as user_name,l.name as lead_name,c.name as client_name
           FROM activities a
           LEFT JOIN users u ON u.id=a.user_id
           LEFT JOIN leads l ON l.id=a.lead_id
           LEFT JOIN clients c ON c.id=a.client_id
           WHERE 1=1`;
  const p = [];
  if (lead_id)        { p.push(lead_id);       q += ` AND a.lead_id=$${p.length}`; }
  if (client_id)      { p.push(client_id);     q += ` AND a.client_id=$${p.length}`; }
  if (user_id)        { p.push(user_id);       q += ` AND a.user_id=$${p.length}`; }
  if (done !== undefined) { p.push(done === 'true'); q += ` AND a.done=$${p.length}`; }
  q += ' ORDER BY a.due_date ASC NULLS LAST, a.created_at DESC';
  try { res.json((await db.query(q, p)).rows); } catch(e) { next(e); }
});

router.get('/pending', async (req, res, next) => {
  try {
    const r = await db.query(
      `SELECT a.*,l.name as lead_name,c.name as client_name
       FROM activities a
       LEFT JOIN leads l ON l.id=a.lead_id
       LEFT JOIN clients c ON c.id=a.client_id
       WHERE a.done=false AND a.user_id=$1 AND (a.due_date IS NULL OR a.due_date <= NOW() + interval '1 day')
       ORDER BY a.due_date ASC NULLS LAST LIMIT 20`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch(e) { next(e); }
});

router.get('/pending-count', async (req, res, next) => {
  try {
    const r = await db.query(
      `SELECT COUNT(*)::int as count FROM activities
       WHERE done=false AND user_id=$1 AND due_date <= NOW()`,
      [req.user.id]
    );
    res.json({ count: r.rows[0].count });
  } catch(e) { next(e); }
});

router.get('/calendar', async (req, res, next) => {
  const { month, year } = req.query;
  const m = parseInt(month) || new Date().getMonth() + 1;
  const y = parseInt(year) || new Date().getFullYear();
  try {
    const r = await db.query(
      `SELECT a.*,l.name as lead_name,c.name as client_name,u.name as user_name
       FROM activities a
       LEFT JOIN leads l ON l.id=a.lead_id
       LEFT JOIN clients c ON c.id=a.client_id
       LEFT JOIN users u ON u.id=a.user_id
       WHERE a.due_date IS NOT NULL
         AND EXTRACT(YEAR FROM a.due_date)=$1
         AND EXTRACT(MONTH FROM a.due_date)=$2
       ORDER BY a.due_date ASC`,
      [y, m]
    );
    res.json(r.rows);
  } catch(e) { next(e); }
});

router.post('/', async (req, res, next) => {
  const { lead_id, client_id, type, title, description, due_date } = req.body;
  if (!type || !title) return res.status(400).json({ error: 'type e title são obrigatórios' });
  if (!lead_id && !client_id) return res.status(400).json({ error: 'lead_id ou client_id é obrigatório' });
  try {
    const r = await db.query(
      'INSERT INTO activities (lead_id,client_id,type,title,description,due_date,user_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [lead_id || null, client_id || null, type, title, description, due_date, req.user.id]
    );
    if (lead_id) {
      await db.query('INSERT INTO lead_events (lead_id,type,description,user_id) VALUES ($1,$2,$3,$4)',
        [lead_id, 'activity', `Atividade: ${title}`, req.user.id]);
    }
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
