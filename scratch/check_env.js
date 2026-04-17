'use strict';
require('dotenv').config();
const dbInProgress = require('./backend/src/database/db');
async function check() {
  console.log('--- ENV CHECK ---');
  console.log('EVOLUTION_API_URL:', process.env.EVOLUTION_API_URL);
  console.log('EVOLUTION_API_KEY:', process.env.EVOLUTION_API_KEY ? 'FIXADO' : 'MISSING');
  console.log('WA_WEBHOOK_SECRET:', process.env.WA_WEBHOOK_SECRET ? 'FIXADO' : 'MISSING');
  console.log('DB_NAME:', process.env.DB_NAME);
  
  try {
    const r = await dbInProgress.query('SELECT name, status FROM wa_instances');
    console.log('Instances found:', r.rows);
  } catch (e) {
    console.error('DB Error:', e.message);
  }
  process.exit(0);
}
check();
