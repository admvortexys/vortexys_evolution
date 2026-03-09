'use strict';
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db     = require('../database/db');
const auth   = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { MAX_DISCOUNT_LIMIT_PCT, normalizePermissions } = require('../utils/discountPermissions');
router.use(auth);

const ALLOWED_SELF_UPDATE   = ['name', 'email', 'username'];
const ALLOWED_ADMIN_UPDATE  = ['name', 'email', 'username', 'role', 'active', 'permissions'];
const MODULE_PERMISSION_KEYS = ['dashboard', 'products', 'stock', 'orders', 'clients', 'sellers', 'crm', 'whatsapp', 'financial', 'settings'];
const DEFAULT_PERMISSIONS   = {
  dashboard: true,
  products: true,
  stock: true,
  orders: true,
  clients: true,
  sellers: true,
  crm: true,
  whatsapp: true,
  financial: true,
  settings: false,
  can_authorize_discount: false,
  discount_limit_pct: 10,
};

function pickFields(obj, fields) {
  return Object.fromEntries(fields.filter(k => k in obj).map(k => [k, obj[k]]));
}

function buildPermissions(input, role) {
  const permissions = normalizePermissions({ ...DEFAULT_PERMISSIONS, ...(input || {}) }, role);
  if (role === 'admin') {
    MODULE_PERMISSION_KEYS.forEach(key => {
      permissions[key] = true;
    });
    permissions.can_authorize_discount = true;
    permissions.discount_limit_pct = MAX_DISCOUNT_LIMIT_PCT;
  }
  return permissions;
}

router.get('/', requireRole('admin'), async (req, res, next) => {
  try {
    res.json((await db.query('SELECT id,name,username,email,role,active,permissions,created_at FROM users ORDER BY name')).rows);
  } catch(e) { next(e); }
});

router.post('/', requireRole('admin'), async (req, res, next) => {
  const { name, username, email, password, role, permissions } = req.body || {};
  if (!name || !password) return res.status(400).json({ error: 'name e password sao obrigatorios' });
  if (password.length < 8) return res.status(400).json({ error: 'Senha minima de 8 caracteres' });
  const finalUsername = (username || name.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9._-]/g, '')).trim();
  if (!finalUsername) return res.status(400).json({ error: 'Username invalido' });
  try {
    const hash  = await bcrypt.hash(password, 12);
    const nextRole = role || 'user';
    const perms = buildPermissions(permissions, nextRole);
    const r = await db.query(
      'INSERT INTO users (name,username,email,password,role,permissions,force_password_change) VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING id,name,username,email,role,permissions,active',
      [name, finalUsername, email ? email.toLowerCase().trim() : null, hash, nextRole, JSON.stringify(perms)]
    );
    res.status(201).json(r.rows[0]);
  } catch(e) {
    if (e.code === '23505') {
      if (e.constraint?.includes('username')) return res.status(400).json({ error: 'Username ja cadastrado' });
      return res.status(400).json({ error: 'Email ja cadastrado' });
    }
    next(e);
  }
});

// Atualizacao propria: apenas campos seguros
router.put('/me', async (req, res, next) => {
  const fields = pickFields(req.body || {}, ALLOWED_SELF_UPDATE);
  if (!Object.keys(fields).length) return res.status(400).json({ error: 'Nenhum campo valido' });
  try {
    const sets = Object.keys(fields).map((k, i) => `${k}=$${i + 1}`).join(',');
    const vals = [...Object.values(fields), req.user.id];
    const r = await db.query(
      `UPDATE users SET ${sets},updated_at=NOW() WHERE id=$${vals.length} RETURNING id,name,email,role,permissions,active`,
      vals
    );
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

// Atualizacao admin: pode alterar tudo
router.put('/:id', requireRole('admin'), async (req, res, next) => {
  const fields = pickFields(req.body || {}, ALLOWED_ADMIN_UPDATE);
  if (!Object.keys(fields).length) return res.status(400).json({ error: 'Nenhum campo valido' });
  try {
    if (fields.permissions || fields.role) {
      const current = await db.query('SELECT role, permissions FROM users WHERE id=$1', [req.params.id]);
      if (!current.rows.length) return res.status(404).json({ error: 'Nao encontrado' });
      const nextRole = fields.role || current.rows[0].role;
      fields.permissions = buildPermissions(fields.permissions || current.rows[0].permissions, nextRole);
    }
    const sets = Object.keys(fields).map((k, i) => `${k}=$${i + 1}`).join(',');
    const vals = [...Object.values(fields), req.params.id];
    const r = await db.query(
      `UPDATE users SET ${sets},updated_at=NOW() WHERE id=$${vals.length} RETURNING id,name,email,role,active,permissions`,
      vals
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Nao encontrado' });
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Nao e possivel desativar sua propria conta' });
  try {
    await db.query('UPDATE users SET active=false WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch(e) { next(e); }
});

// Admin reseta senha de um usuario
router.post('/:id/reset-password', requireRole('admin'), async (req, res, next) => {
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 8)
    return res.status(400).json({ error: 'Senha minima de 8 caracteres' });
  try {
    const hash = await bcrypt.hash(newPassword, 12);
    const r = await db.query(
      'UPDATE users SET password=$1, force_password_change=true, updated_at=NOW() WHERE id=$2 RETURNING id,name,email',
      [hash, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Usuario nao encontrado' });
    res.json({ success: true, user: r.rows[0] });
  } catch(e) { next(e); }
});

module.exports = router;
