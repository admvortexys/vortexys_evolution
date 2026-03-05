'use strict';
const router = require('express').Router();
const db     = require('../database/db');
const auth   = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
router.use(auth);
router.use(requirePermission('crm'));

router.get('/', async (req, res, next) => {
  const { pipeline_id, status, search } = req.query;
  let q = `SELECT l.*,p.name as pipeline_name,p.color as pipeline_color,u.name as user_name
           FROM leads l
           LEFT JOIN pipelines p ON p.id=l.pipeline_id
           LEFT JOIN users u ON u.id=l.user_id
           WHERE 1=1`;
  const params = [];
  if (pipeline_id) { params.push(pipeline_id); q += ` AND l.pipeline_id=$${params.length}`; }
  if (status)      { params.push(status);       q += ` AND l.status=$${params.length}`; }
  if (search)      { params.push(`%${search}%`); q += ` AND (l.name ILIKE $${params.length} OR l.company ILIKE $${params.length})`; }
  q += ' ORDER BY l.created_at DESC';
  try { res.json((await db.query(q, params)).rows); } catch(e) { next(e); }
});

router.get('/kanban', async (req, res, next) => {
  try {
    const pipes = await db.query('SELECT * FROM pipelines ORDER BY position');
    const leads = await db.query(
      `SELECT l.*,u.name as user_name FROM leads l
       LEFT JOIN users u ON u.id=l.user_id
       WHERE l.status='open' ORDER BY l.updated_at DESC`
    );
    res.json(pipes.rows.map(p => ({ ...p, leads: leads.rows.filter(l => l.pipeline_id === p.id) })));
  } catch(e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const l = await db.query(
      `SELECT l.*,p.name as pipeline_name FROM leads l
       LEFT JOIN pipelines p ON p.id=l.pipeline_id WHERE l.id=$1`,
      [req.params.id]
    );
    if (!l.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    const acts = await db.query(
      'SELECT a.*,u.name as user_name FROM activities a LEFT JOIN users u ON u.id=a.user_id WHERE a.lead_id=$1 ORDER BY a.created_at DESC',
      [req.params.id]
    );
    res.json({ ...l.rows[0], activities: acts.rows });
  } catch(e) { next(e); }
});

router.post('/', async (req, res, next) => {
  const { name, company, email, phone, source, pipeline_id, estimated_value, probability, expected_close, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'name é obrigatório' });
  try {
    const r = await db.query(
      `INSERT INTO leads (name,company,email,phone,source,pipeline_id,estimated_value,probability,expected_close,notes,user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [name, company, email, phone, source, pipeline_id, estimated_value || 0, probability || 0, expected_close, notes, req.user.id]
    );
    res.status(201).json(r.rows[0]);
  } catch(e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  const { name, company, email, phone, source, pipeline_id, estimated_value, probability, expected_close, status, lost_reason, notes } = req.body;
  try {
    const r = await db.query(
      `UPDATE leads SET name=$1,company=$2,email=$3,phone=$4,source=$5,pipeline_id=$6,
       estimated_value=$7,probability=$8,expected_close=$9,status=$10,lost_reason=$11,
       notes=$12,updated_at=NOW() WHERE id=$13 RETURNING *`,
      [name, company, email, phone, source, pipeline_id, estimated_value, probability, expected_close, status, lost_reason, notes, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

router.patch('/:id/move', async (req, res, next) => {
  const { pipeline_id } = req.body;
  if (!pipeline_id) return res.status(400).json({ error: 'pipeline_id é obrigatório' });
  try {
    const pipe = await db.query('SELECT id FROM pipelines WHERE id=$1', [pipeline_id]);
    if (!pipe.rows.length) return res.status(400).json({ error: 'Pipeline não encontrado' });
    const r = await db.query(
      'UPDATE leads SET pipeline_id=$1,updated_at=NOW() WHERE id=$2 RETURNING *',
      [pipeline_id, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await db.query('DELETE FROM leads WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch(e) { next(e); }
});

module.exports = router;
