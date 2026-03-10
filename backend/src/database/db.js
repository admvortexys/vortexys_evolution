'use strict';
/**
 * Pool de conexÃµes PostgreSQL.
 * Usado por todas as rotas e services. db.query(sql, params) para consultas.
 * db.tx(fn) para transaÃ§Ãµes: fn recebe o client e deve retornar o resultado.
 */
const { Pool, types } = require('pg');

// Mantem TIMESTAMP sem timezone como string local para evitar que o JSON
// converta valores de datetime-local para UTC e desloque o horario na UI.
types.setTypeParser(1114, (value) => {
  if (value == null) return value;
  return String(value).replace(' ', 'T');
});

const pool = new Pool({
  host:                    process.env.DB_HOST || 'localhost',
  port:                    process.env.DB_PORT || 5432,
  database:                process.env.DB_NAME || 'vortexys',
  user:                    process.env.DB_USER || 'vortexys',
  password:                process.env.DB_PASSWORD,
  max:                     20,
  idleTimeoutMillis:       30000,
  connectionTimeoutMillis: 5000,
  application_name:        'vortexys',
  statement_timeout:       30000,
  ...(process.env.DB_SSL === 'true' && { ssl: { rejectUnauthorized: process.env.NODE_ENV === 'production' } }),
});

pool.on('error', err => console.error('[DB] Erro no pool:', err.message));

// Wrapper para transaÃ§Ãµes (BEGIN/COMMIT/ROLLBACK)
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = pool;
module.exports.tx = tx;

