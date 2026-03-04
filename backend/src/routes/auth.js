'use strict';
const router    = require('express').Router();
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const db        = require('../database/db');
const auth      = require('../middleware/auth');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
});

function signAccess(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  });
}
async function signRefresh(userId) {
  const token = uuidv4();
  const exp   = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.query(
    'INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES ($1,$2,$3)',
    [token, userId, exp]
  );
  return token;
}
function safeUser(u) {
  return { id:u.id, name:u.name, email:u.email, role:u.role,
           permissions:u.permissions||{}, force_password_change:u.force_password_change||false };
}

router.post('/login', loginLimiter, async (req, res, next) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email e senha são obrigatórios' });
  try {
    const r = await db.query('SELECT * FROM users WHERE email=$1 AND active=true', [email.toLowerCase().trim()]);
    if (!r.rows.length) return res.status(401).json({ error: 'Credenciais inválidas' });
    const user = r.rows[0];
    if (!(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ error: 'Credenciais inválidas' });
    const accessToken  = signAccess(user.id);
    const refreshToken = await signRefresh(user.id);
    res.cookie('vrx_refresh', refreshToken, {
      httpOnly: true, sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ token: accessToken, user: safeUser(user) });
  } catch(e) { next(e); }
});

router.post('/refresh', async (req, res, next) => {
  const token = req.cookies?.vrx_refresh;
  if (!token) return res.status(401).json({ error: 'Refresh token ausente' });
  try {
    const r = await db.query(
      'SELECT * FROM refresh_tokens WHERE token=$1 AND expires_at > NOW() AND revoked=false',
      [token]
    );
    if (!r.rows.length) return res.status(401).json({ error: 'Refresh token inválido ou expirado' });
    const rt = r.rows[0];
    // rotação: revoga o atual, emite novo
    await db.query('UPDATE refresh_tokens SET revoked=true WHERE token=$1', [token]);
    const user = await db.query('SELECT * FROM users WHERE id=$1 AND active=true', [rt.user_id]);
    if (!user.rows.length) return res.status(401).json({ error: 'Usuário inativo' });
    const newAccess  = signAccess(rt.user_id);
    const newRefresh = await signRefresh(rt.user_id);
    res.cookie('vrx_refresh', newRefresh, {
      httpOnly: true, sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ token: newAccess, user: safeUser(user.rows[0]) });
  } catch(e) { next(e); }
});

router.post('/logout', async (req, res, next) => {
  const token = req.cookies?.vrx_refresh;
  if (token) {
    try { await db.query('UPDATE refresh_tokens SET revoked=true WHERE token=$1', [token]); }
    catch(e) { /* ignore */ }
  }
  res.clearCookie('vrx_refresh');
  res.json({ success: true });
});

router.get('/me', auth, (req, res) => res.json(safeUser(req.user)));

router.post('/change-password', auth, async (req, res, next) => {
  const { current, newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 8)
    return res.status(400).json({ error: 'Nova senha deve ter no mínimo 8 caracteres' });
  try {
    if (!(await bcrypt.compare(current, req.user.password)))
      return res.status(400).json({ error: 'Senha atual incorreta' });
    const hash = await bcrypt.hash(newPassword, 12);
    await db.query('UPDATE users SET password=$1,force_password_change=false,updated_at=NOW() WHERE id=$2', [hash, req.user.id]);
    res.json({ success: true });
  } catch(e) { next(e); }
});

module.exports = router;
