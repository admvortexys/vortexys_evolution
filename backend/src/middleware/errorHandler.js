'use strict';

const CODES = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE',
  500: 'INTERNAL_ERROR',
};

function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const code = err.code || CODES[status] || 'ERROR';
  const msg = process.env.NODE_ENV === 'production'
    ? (status < 500 ? err.message : 'Erro interno do servidor')
    : err.message;
  console.error(`[ERROR] ${req.method} ${req.path} →`, err.message);
  res.status(status).json({ error: msg, code });
}

module.exports = errorHandler;
