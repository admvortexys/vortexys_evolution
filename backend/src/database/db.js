'use strict';
/**
 * Pool de conexões PostgreSQL.
 * Usado por todas as rotas e services. db.query(sql, params) para consultas.
 * db.tx(fn) para transações: fn recebe o client e deve retornar o resultado.
 */
const { Pool } = require('pg');

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
  ...(process.env.DB_SSL === 'true' && { ssl: { rejectUnauthorized: false } }),
});

pool.on('error', err => console.error('[DB] Erro no pool:', err.message));

// Wrapper para transações (BEGIN/COMMIT/ROLLBACK)
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
