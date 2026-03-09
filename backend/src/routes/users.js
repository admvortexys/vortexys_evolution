'use strict';
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db     = require('../database/db');
const auth   = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { MAX_DISCOUNT_LIMIT_PCT, normalizePermissions } = require('../utils/discountPermissions');
const { MODULE_PERMISSION_KEYS } = require('../utils/defaultPermissions');
router.use(auth);

const ALLOWED_SELF_UPDATE   = ['name', 'email', 'username'];
const ALLOWED_ADMIN_UPDATE  = ['name', 'email', 'username', 'role', 'active', 'permissions'];

function pickFields(obj, fields) {
  return Object.fromEntries(fields.filter(k => k in obj).map(k => [k, obj[k]]));
}

function buildPermissions(input, role) {
  const permissions = normalizePermissions(input || {}, role);
  if (role === 'admin') {
    MODULE_PERMISSION_KEYS.forEach(key => {
      permissions[key] = true;
    });
    permissions.can_authorize_discount = true;
    permissions.discount_limit_pct = MAX_DISCOUNT_LIMIT_PCT;
  }
  return permissions;
}

function serializeUser(row) {
  return {
    ...row,
    permissions: buildPermissions(row.permissions || {}, row.role),
  };
}

router.get('/', requireRole('admin'), async (req, res, next) => {
  try {
    const rows = (await db.query('SELECT id,name,username,email,role,active,permissions,created_at FROM users ORDER BY name')).rows;
    res.json(rows.map(serializeUser));
  } catch (e) { next(e); }
});

router.post('/', requireRole('admin'), async (req, res, next) => {
  const { name, username, email, password, role, permissions } = req.body || {};
  if (!name || !password) return res.status(400).json({ error: 'Nome e senha são obrigatórios' });
  if (password.length < 8) return res.status(400).json({ error: 'Senha mínima de 8 caracteres' });
  const finalUsername = (username || name.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9._-]/g, '')).trim();
  if (!finalUsername) return res.status(400).json({ error: 'Usuário inválido' });
  try {
    const hash  = await bcrypt.hash(password, 12);
    const nextRole = role || 'user';
    const perms = buildPermissions(permissions, nextRole);
    const r = await db.query(
      'INSERT INTO users (name,username,email,password,role,permissions,force_password_change) VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING id,name,username,email,role,permissions,active',
      [name, finalUsername, email ? email.toLowerCase().trim() : null, hash, nextRole, JSON.stringify(perms)]
    );
    res.status(201).json(serializeUser(r.rows[0]));
  } catch (e) {
    if (e.code === '23505') {
      if (e.constraint?.includes('username')) return res.status(400).json({ error: 'Usuário já cadastrado' });
      return res.status(400).json({ error: 'E-mail já cadastrado' });
    }
    next(e);
  }
});

router.put('/me', async (req, res, next) => {
  const fields = pickFields(req.body || {}, ALLOWED_SELF_UPDATE);
  if (!Object.keys(fields).length) return res.status(400).json({ error: 'Nenhum campo válido' });
  try {
    const sets = Object.keys(fields).map((k, i) => `${k}=$${i + 1}`).join(',');
    const vals = [...Object.values(fields), req.user.id];
    const r = await db.query(
      `UPDATE users SET ${sets},updated_at=NOW() WHERE id=$${vals.length} RETURNING id,name,email,role,permissions,active`,
      vals
    );
    res.json(serializeUser(r.rows[0]));
  } catch (e) { next(e); }
});

router.put('/:id', requireRole('admin'), async (req, res, next) => {
  const fields = pickFields(req.body || {}, ALLOWED_ADMIN_UPDATE);
  if (!Object.keys(fields).length) return res.status(400).json({ error: 'Nenhum campo válido' });
  try {
    if (fields.permissions || fields.role) {
      const current = await db.query('SELECT role, permissions FROM users WHERE id=$1', [req.params.id]);
      if (!current.rows.length) return res.status(404).json({ error: 'Não encontrado' });
      const nextRole = fields.role || current.rows[0].role;
      fields.permissions = buildPermissions(fields.permissions || current.rows[0].permissions, nextRole);
    }
    const sets = Object.keys(fields).map((k, i) => `${k}=$${i + 1}`).join(',');
    const vals = [...Object.values(fields), req.params.id];
    const r = await db.query(
      `UPDATE users SET ${sets},updated_at=NOW() WHERE id=$${vals.length} RETURNING id,name,email,role,active,permissions`,
      vals
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    res.json(serializeUser(r.rows[0]));
  } catch (e) { next(e); }
});

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  if (parseInt(req.params.id, 10) === req.user.id) {
    return res.status(400).json({ error: 'Não é possível desativar sua própria conta' });
  }
  try {
    await db.query('UPDATE users SET active=false WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.post('/:id/reset-password', requireRole('admin'), async (req, res, next) => {
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Senha mínima de 8 caracteres' });
  }
  try {
    const hash = await bcrypt.hash(newPassword, 12);
    const r = await db.query(
      'UPDATE users SET password=$1, force_password_change=true, updated_at=NOW() WHERE id=$2 RETURNING id,name,email',
      [hash, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json({ success: true, user: serializeUser(r.rows[0]) });
  } catch (e) { next(e); }
});

module.exports = router;