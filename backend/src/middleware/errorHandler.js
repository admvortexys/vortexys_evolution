function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  // Nunca retornar stack trace em produção
  const msg = process.env.NODE_ENV === 'production'
    ? (status < 500 ? err.message : 'Erro interno do servidor')
    : err.message;
  console.error(`[ERROR] ${req.method} ${req.path} →`, err.message);
  res.status(status).json({ error: msg });
}

module.exports = errorHandler;
