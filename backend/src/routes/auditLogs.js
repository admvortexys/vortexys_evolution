'use strict';
const router = require('express').Router();
const db = require('../database/db');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

router.use(auth);
router.use(requireRole('admin'));

router.get('/', async (req, res, next) => {
  const {
    module,
    action,
    user_id,
    target_type,
    target_id,
    search,
    start_date,
    end_date,
    limit,
    offset,
  } = req.query || {};

  const params = [];
  let query = `
    SELECT al.*,
           COALESCE(al.actor_name, u.name) AS actor_name_display,
           COALESCE(al.actor_role, u.role) AS actor_role_display
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
     WHERE 1=1`;

  if (module) {
    params.push(module);
    query += ` AND al.module = $${params.length}`;
  }
  if (action) {
    params.push(action);
    query += ` AND al.action = $${params.length}`;
  }
  if (user_id) {
    params.push(user_id);
    query += ` AND al.user_id = $${params.length}`;
  }
  if (target_type) {
    params.push(target_type);
    query += ` AND al.target_type = $${params.length}`;
  }
  if (target_id) {
    params.push(target_id);
    query += ` AND al.target_id = $${params.length}`;
  }
  if (start_date) {
    params.push(start_date);
    query += ` AND al.created_at >= $${params.length}::timestamp`;
  }
  if (end_date) {
    params.push(end_date);
    query += ` AND al.created_at < ($${params.length}::date + INTERVAL '1 day')`;
  }
  if (search) {
    params.push(`%${search}%`);
    query += ` AND (
      COALESCE(al.actor_name, u.name, '') ILIKE $${params.length}
      OR COALESCE(al.module, '') ILIKE $${params.length}
      OR COALESCE(al.action, '') ILIKE $${params.length}
      OR COALESCE(al.target_type, '') ILIKE $${params.length}
      OR COALESCE(al.details::text, '') ILIKE $${params.length}
    )`;
  }

  const safeLimit = Math.max(1, Math.min(parseInt(limit, 10) || 100, 500));
  const safeOffset = Math.max(0, parseInt(offset, 10) || 0);
  params.push(safeLimit);
  params.push(safeOffset);
  query += ` ORDER BY al.created_at DESC, al.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

  try {
    const rows = (await db.query(query, params)).rows;
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

module.exports = router;