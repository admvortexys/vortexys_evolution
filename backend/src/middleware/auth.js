'use strict';
const jwt = require('jsonwebtoken');
const db  = require('../database/db');

module.exports = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer '))
    return res.status(401).json({ error: 'Token não fornecido' });
  try {
    const { userId } = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
    const r = await db.query('SELECT * FROM users WHERE id=$1 AND active=true', [userId]);
    if (!r.rows.length) return res.status(401).json({ error: 'Usuário inativo ou não encontrado' });
    req.user = r.rows[0];
    next();
  } catch (e) {
    if (e.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expirado', expired: true });
    res.status(401).json({ error: 'Token inválido' });
  }
};
