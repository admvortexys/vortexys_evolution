const { Pool } = require('pg');

if (!process.env.DB_PASSWORD) {
  console.error('[DB] FATAL: DB_PASSWORD não definida. Configure o arquivo .env antes de iniciar.');
  process.exit(1);
}

const pool = new Pool({
  host:                    process.env.DB_HOST || 'localhost',
  port:                    process.env.DB_PORT || 5432,
  database:                process.env.DB_NAME || 'vortexys',
  user:                    process.env.DB_USER || 'vortexys',
  password:                process.env.DB_PASSWORD,
  max:                     20,
  idleTimeoutMillis:       30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', err => console.error('[DB] Erro inesperado no pool:', err));
module.exports = pool;
