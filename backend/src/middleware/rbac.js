'use strict';
/**
 * Controle de acesso por role e permissões.
 * requireRole('admin') exige role específica.
 * requirePermission('orders') exige a permissão do módulo.
 * requireAnyPermission(['orders', 'pdv']) aceita qualquer uma das permissões.
 */

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) {
    return res.status(403).json({ error: 'Acesso negado: permissão insuficiente', code: 'FORBIDDEN' });
  }
  next();
};

function hasPermission(req, module, action = 'read') {
  if (req.user?.role === 'admin') return true;
  const perms = req.user?.permissions || {};
  if (!perms[module]) return false;
  if (action === 'write' && perms[module] !== 'write' && perms[module] !== true) return false;
  return true;
}

const requirePermission = (module, action = 'read') => (req, res, next) => {
  if (!hasPermission(req, module, action)) {
    return res.status(403).json({ error: `Sem acesso ao módulo: ${module}`, code: 'FORBIDDEN' });
  }
  next();
};

const requireAnyPermission = (modules, action = 'read') => {
  const list = Array.isArray(modules) ? modules : [modules];
  return (req, res, next) => {
    if (list.some(module => hasPermission(req, module, action))) return next();
    return res.status(403).json({
      error: `Sem acesso aos módulos: ${list.join(', ')}`,
      code: 'FORBIDDEN',
    });
  };
};

module.exports = { hasPermission, requireRole, requirePermission, requireAnyPermission };