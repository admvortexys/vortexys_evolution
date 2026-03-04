const { Pool } = require('pg');
const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 5432,
  database: process.env.DB_NAME     || 'vortexys',
  user:     process.env.DB_USER     || 'vortexys',
  password: process.env.DB_PASSWORD || 'vortexys2026',
});
pool.on('error', err => console.error('DB error:', err));
module.exports = pool;
