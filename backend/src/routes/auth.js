'use strict';
/**
 * Autenticacao: login, logout, refresh token, troca de senha.
 * Login aceita email OU username. Sessao usa cookies HttpOnly.
 * Refresh usa cookie HttpOnly (vrx_refresh) para renovar access token.
 */
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db = require('../database/db');
const auth = require('../middleware/auth');
const { validatePasswordStrength } = require('../utils/passwordPolicy');
const { createOpaqueToken, hashToken } = require('../utils/security');
const {
  canAuthorizeDiscount,
  createDiscountApprovalToken,
  getUserDiscountLimit,
  normalizePermissions,
} = require('../utils/discountPermissions');

const ACCESS_COOKIE = 'access_token';
const REFRESH_COOKIE = 'vrx_refresh';
const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
});

function useSecureCookies() {
  if (process.env.COOKIE_SECURE === 'true') return true;
  if (process.env.COOKIE_SECURE === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

function authCookieOptions(maxAge) {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: useSecureCookies(),
    path: '/',
    maxAge,
  };
}

function signAccess(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '15m',
  });
}

async function signRefresh(userId) {
  const token = createOpaqueToken(32);
  const exp = new Date(Date.now() + REFRESH_TOKEN_MAX_AGE_MS);
  await db.query(
    'INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES ($1,$2,$3)',
    [hashToken(token), userId, exp]
  );
  return token;
}

function safeUser(u) {
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    email: u.email,
    role: u.role,
    permissions: normalizePermissions(u.permissions || {}, u.role),
    force_password_change: u.force_password_change || false,
  };
}

function setAuthCookies(res, userId, refreshToken) {
  res.cookie(ACCESS_COOKIE, signAccess(userId), authCookieOptions(ACCESS_TOKEN_MAX_AGE_MS));
  if (refreshToken) {
    res.cookie(REFRESH_COOKIE, refreshToken, authCookieOptions(REFRESH_TOKEN_MAX_AGE_MS));
  }
}

function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE, authCookieOptions(ACCESS_TOKEN_MAX_AGE_MS));
  res.clearCookie(REFRESH_COOKIE, authCookieOptions(REFRESH_TOKEN_MAX_AGE_MS));
}

async function findRefreshToken(rawToken) {
  const candidates = [String(rawToken || ''), hashToken(rawToken)].filter(Boolean);
  const r = await db.query(
    'SELECT * FROM refresh_tokens WHERE token = ANY($1::text[]) AND expires_at > NOW() AND revoked=false ORDER BY id DESC LIMIT 1',
    [candidates]
  );
  return r.rows[0] || null;
}

router.post('/login', loginLimiter, async (req, res, next) => {
  const { email, login, password } = req.body || {};
  const identifier = (login || email || '').toLowerCase().trim();
  if (!identifier || !password) {
    return res.status(400).json({ error: 'Usuario e senha sao obrigatorios' });
  }
  try {
    const r = await db.query(
      'SELECT * FROM users WHERE (LOWER(email)=$1 OR LOWER(username)=$1) AND active=true',
      [identifier]
    );
    if (!r.rows.length) return res.status(401).json({ error: 'Credenciais invalidas' });
    const user = r.rows[0];
    if (!(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Credenciais invalidas' });
    }
    const refreshToken = await signRefresh(user.id);
    setAuthCookies(res, user.id, refreshToken);
    res.json({ user: safeUser(user) });
  } catch (e) { next(e); }
});

router.post('/refresh', async (req, res, next) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) return res.status(401).json({ error: 'Refresh token ausente' });
  try {
    const rt = await findRefreshToken(token);
    if (!rt) return res.status(401).json({ error: 'Refresh token invalido ou expirado' });

    await db.query(
      'UPDATE refresh_tokens SET revoked=true WHERE token = ANY($1::text[])',
      [[String(token), hashToken(token)]]
    );

    const user = await db.query('SELECT * FROM users WHERE id=$1 AND active=true', [rt.user_id]);
    if (!user.rows.length) return res.status(401).json({ error: 'Usuario inativo' });

    const newRefresh = await signRefresh(rt.user_id);
    setAuthCookies(res, rt.user_id, newRefresh);
    res.json({ user: safeUser(user.rows[0]) });
  } catch (e) { next(e); }
});

router.post('/logout', async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) {
    try {
      await db.query(
        'UPDATE refresh_tokens SET revoked=true WHERE token = ANY($1::text[])',
        [[String(token), hashToken(token)]]
      );
    } catch (e) {
      // ignore revocation errors on logout
    }
  }
  clearAuthCookies(res);
  res.json({ success: true });
});

router.get('/me', auth, (req, res) => res.json(safeUser(req.user)));

router.post('/change-password', auth, async (req, res, next) => {
  const { current, newPassword } = req.body || {};
  if (!current) {
    return res.status(400).json({ error: 'Senha atual e obrigatoria' });
  }
  const passwordError = validatePasswordStrength(newPassword);
  if (passwordError) {
    return res.status(400).json({ error: passwordError });
  }
  try {
    const r = await db.query('SELECT * FROM users WHERE id=$1 AND active=true', [req.user.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Usuario nao encontrado' });
    const user = r.rows[0];
    if (!(await bcrypt.compare(current, user.password))) {
      return res.status(400).json({ error: 'Senha atual incorreta' });
    }
    if (await bcrypt.compare(newPassword, user.password)) {
      return res.status(400).json({ error: 'A nova senha deve ser diferente da atual' });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await db.tx(async (client) => {
      await client.query(
        'UPDATE users SET password=$1,force_password_change=false,updated_at=NOW() WHERE id=$2',
        [hash, req.user.id]
      );
      await client.query('UPDATE refresh_tokens SET revoked=true WHERE user_id=$1', [req.user.id]);
    });

    const refreshToken = await signRefresh(req.user.id);
    setAuthCookies(res, req.user.id, refreshToken);
    res.json({
      success: true,
      user: safeUser({ ...user, force_password_change: false }),
    });
  } catch (e) { next(e); }
});

router.post('/discount-approval', auth, async (req, res, next) => {
  const { login, email, password, discountPct } = req.body || {};
  const identifier = String(login || email || '').toLowerCase().trim();
  const requestedPct = parseFloat(discountPct);
  if (!identifier || !password) {
    return res.status(400).json({ error: 'Login e senha sao obrigatorios para autorizar o desconto' });
  }
  if (!Number.isFinite(requestedPct) || requestedPct <= 0) {
    return res.status(400).json({ error: 'Percentual de desconto invalido' });
  }
  try {
    const r = await db.query(
      'SELECT * FROM users WHERE (LOWER(email)=$1 OR LOWER(username)=$1) AND active=true',
      [identifier]
    );
    if (!r.rows.length) return res.status(401).json({ error: 'Credenciais invalidas' });
    const approver = r.rows[0];
    if (!(await bcrypt.compare(password, approver.password))) {
      return res.status(401).json({ error: 'Credenciais invalidas' });
    }
    const normalizedApprover = {
      ...approver,
      permissions: normalizePermissions(approver.permissions || {}, approver.role),
    };
    if (!canAuthorizeDiscount(normalizedApprover)) {
      return res.status(403).json({ error: 'Este login nao pode autorizar descontos' });
    }
    const maxDiscountPct = getUserDiscountLimit(normalizedApprover);
    if (requestedPct > maxDiscountPct + 0.0001) {
      return res.status(403).json({ error: `Este login so autoriza ate ${maxDiscountPct}% de desconto` });
    }
    const token = createDiscountApprovalToken({
      approver: normalizedApprover,
      cashierUserId: req.user.id,
      approvedDiscountPct: requestedPct,
    });
    res.json({
      token,
      approver: { id: approver.id, name: approver.name, username: approver.username },
      maxDiscountPct,
      approvedDiscountPct: Math.round(requestedPct * 100) / 100,
    });
  } catch (e) { next(e); }
});

module.exports = router;

