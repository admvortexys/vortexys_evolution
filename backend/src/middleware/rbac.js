'use strict';

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role))
    return res.status(403).json({ error: 'Acesso negado: permissão insuficiente' });
  next();
};

const requirePermission = (module, action = 'read') => (req, res, next) => {
  if (req.user?.role === 'admin') return next();
  const perms = req.user?.permissions || {};
  if (!perms[module]) return res.status(403).json({ error: `Sem acesso ao módulo: ${module}` });
  next();
};

module.exports = { requireRole, requirePermission };
