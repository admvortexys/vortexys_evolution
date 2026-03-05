'use strict';
const router = require('express').Router();
const db     = require('../database/db');
const auth   = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
router.use(auth);
router.use(requirePermission('crm'));

const VALID_TRIGGERS = ['lead_created','lead_moved','lead_won','lead_lost','activity_overdue'];
const VALID_ACTIONS  = ['move_pipeline','assign_user','create_activity','change_status','notify'];

router.get('/', async (req, res, next) => {
  try {
    const r = await db.query('SELECT * FROM automation_rules ORDER BY created_at DESC');
    res.json(r.rows);
  } catch(e) { next(e); }
});

router.post('/', async (req, res, next) => {
  const { name, trigger, condition, action, config, active } = req.body;
  if (!name || !trigger || !action) return res.status(400).json({ error: 'name, trigger e action são obrigatórios' });
  if (!VALID_TRIGGERS.includes(trigger)) return res.status(400).json({ error: `Trigger inválido. Use: ${VALID_TRIGGERS.join(', ')}` });
  if (!VALID_ACTIONS.includes(action)) return res.status(400).json({ error: `Action inválida. Use: ${VALID_ACTIONS.join(', ')}` });
  try {
    const r = await db.query(
      `INSERT INTO automation_rules (name,"trigger",condition,action,config,active)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, trigger, JSON.stringify(condition||{}), action, JSON.stringify(config||{}), active !== false]
    );
    res.status(201).json(r.rows[0]);
  } catch(e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  const { name, trigger, condition, action, config, active } = req.body;
  try {
    const r = await db.query(
      `UPDATE automation_rules SET name=$1,"trigger"=$2,condition=$3,action=$4,config=$5,active=$6
       WHERE id=$7 RETURNING *`,
      [name, trigger, JSON.stringify(condition||{}), action, JSON.stringify(config||{}), active, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await db.query('DELETE FROM automation_rules WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch(e) { next(e); }
});

router.post('/execute', async (req, res, next) => {
  const { trigger, lead_id } = req.body;
  if (!trigger || !lead_id) return res.status(400).json({ error: 'trigger e lead_id obrigatórios' });
  try {
    const rules = await db.query(
      'SELECT * FROM automation_rules WHERE "trigger"=$1 AND active=true',
      [trigger]
    );
    const results = [];
    for (const rule of rules.rows) {
      const cond = typeof rule.condition === 'string' ? JSON.parse(rule.condition) : rule.condition;
      const conf = typeof rule.config === 'string' ? JSON.parse(rule.config) : rule.config;
      const lead = (await db.query('SELECT * FROM leads WHERE id=$1', [lead_id])).rows[0];
      if (!lead) continue;

      let match = true;
      if (cond.source && cond.source !== lead.source) match = false;
      if (cond.pipeline_id && parseInt(cond.pipeline_id) !== lead.pipeline_id) match = false;
      if (cond.min_value && parseFloat(lead.estimated_value) < parseFloat(cond.min_value)) match = false;
      if (!match) continue;

      if (rule.action === 'move_pipeline' && conf.pipeline_id) {
        await db.query('UPDATE leads SET pipeline_id=$1,updated_at=NOW() WHERE id=$2', [conf.pipeline_id, lead_id]);
        results.push({ rule: rule.name, action: 'move_pipeline', success: true });
      }
      if (rule.action === 'assign_user' && conf.user_id) {
        await db.query('UPDATE leads SET user_id=$1,updated_at=NOW() WHERE id=$2', [conf.user_id, lead_id]);
        results.push({ rule: rule.name, action: 'assign_user', success: true });
      }
      if (rule.action === 'create_activity' && conf.activity_title) {
        const due = new Date(); due.setDate(due.getDate() + (parseInt(conf.due_days) || 1));
        await db.query(
          'INSERT INTO activities (lead_id,type,title,description,due_date,user_id) VALUES ($1,$2,$3,$4,$5,$6)',
          [lead_id, conf.activity_type || 'task', conf.activity_title, conf.activity_description || '', due, lead.user_id]
        );
        results.push({ rule: rule.name, action: 'create_activity', success: true });
      }
      if (rule.action === 'change_status' && conf.status) {
        await db.query('UPDATE leads SET status=$1,updated_at=NOW() WHERE id=$2', [conf.status, lead_id]);
        results.push({ rule: rule.name, action: 'change_status', success: true });
      }
    }
    res.json({ executed: results.length, results });
  } catch(e) { next(e); }
});

module.exports = router;
