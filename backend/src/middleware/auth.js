'use strict';
/**
 * Middleware de autenticação JWT.
 * Lê token de Authorization: Bearer ou cookie access_token.
 * Preenche req.user com dados do usuário. Retorna 401 se inválido.
 */
const jwt = require('jsonwebtoken');
const db  = require('../database/db');
const { normalizePermissions } = require('../utils/discountPermissions');

module.exports = async (req, res, next) => {
  let token = null;
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    token = auth.split(' ')[1];
  } else if (req.cookies?.access_token) {
    token = req.cookies.access_token;
  }
  if (!token)
    return res.status(401).json({ error: 'Token não fornecido', code: 'NO_TOKEN' });
  try {
    const { userId } = jwt.verify(token, process.env.JWT_SECRET);
    const r = await db.query(
      'SELECT id,name,email,role,active,permissions,force_password_change FROM users WHERE id=$1 AND active=true',
      [userId]
    );
    if (!r.rows.length) return res.status(401).json({ error: 'Usuário inativo ou não encontrado', code: 'USER_INACTIVE' });
    const user = r.rows[0];
    req.user = {
      ...user,
      permissions: normalizePermissions(user.permissions || {}, user.role),
    };
    next();
  } catch (e) {
    if (e.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expirado', expired: true, code: 'TOKEN_EXPIRED' });
    res.status(401).json({ error: 'Token inválido', code: 'TOKEN_INVALID' });
  }
};