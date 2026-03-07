'use strict';
/**
 * VORTEXYS — Servidor principal da API
 * Entry point do backend. Inicia Express, registra rotas, executa migrações
 * e cria o admin inicial. Também anexa o WebSocket para mensagens em tempo real.
 */

const { validateEnv } = require('./config/env');
validateEnv(); // Falha logo cedo se variáveis obrigatórias faltando

const http         = require('http');
const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit    = require('express-rate-limit');
const bcrypt       = require('bcryptjs');
const fs           = require('fs');
const path         = require('path');
const db           = require('./database/db');
const errorHandler = require('./middleware/errorHandler');
const wsServer     = require('./services/wsServer');

const app = express();

// Segurança e CORS
app.use(helmet());
app.set('trust proxy', 1);

const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';
app.use(cors({ origin: allowedOrigin, credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'] }));

app.use(cookieParser());
app.use(express.json({ limit: '20mb' })); // Para upload de imagens em base64
app.use(rateLimit({ windowMs:60_000, max:300, standardHeaders:true, legacyHeaders:false }));
app.use((req,_,next)=>{ console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`); next(); });

// Rotas — ordem: públicas primeiro, depois autenticadas
app.use('/api/public',         require('./routes/publicOs'));
app.use('/api/auth',           require('./routes/auth'));
app.use('/api/users',          require('./routes/users'));
app.use('/api/products',       require('./routes/products'));
app.use('/api/stock',          require('./routes/stock'));
app.use('/api/orders',         require('./routes/orders'));
app.use('/api/order-statuses', require('./routes/orderStatuses'));
app.use('/api/credits',        require('./routes/credits'));
app.use('/api/returns',        require('./routes/returns'));
app.use('/api/clients',        require('./routes/clients'));
app.use('/api/leads',          require('./routes/leads'));
app.use('/api/pipelines',      require('./routes/pipelines'));
app.use('/api/activities',     require('./routes/activities'));
app.use('/api/service-orders', require('./routes/serviceOrders'));
app.use('/api/transactions',   require('./routes/transactions'));
app.use('/api/categories',     require('./routes/categories'));
app.use('/api/dashboard',      require('./routes/dashboard'));
app.use('/api/sellers',        require('./routes/sellers'));
app.use('/api/whatsapp',       require('./routes/whatsapp'));
app.use('/api/reports',        require('./routes/reports'));
app.use('/api/proposals',      require('./routes/proposals'));
app.use('/api/automations',    require('./routes/automations'));
app.use('/api/settings',      require('./routes/settings'));

// Health check (usado por load balancers / Docker)
app.get('/api/health', async (_, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ ok: true, db: 'ok' });
  } catch (e) {
    res.status(503).json({ ok: false, db: 'error', message: e.message });
  }
});

app.use(errorHandler);

// Lê schema.sql e executa cada statement (IF NOT EXISTS mantém idempotência)
async function runMigrations() {
  const schemaPath = path.join(__dirname, 'database', 'schema.sql');
  try {
    const sql = fs.readFileSync(schemaPath, 'utf8');
    const statements = [];
    let current = '';
    let inDollarBlock = false;
    for (const line of sql.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('--') && !inDollarBlock) continue;
      if (!inDollarBlock && /\bDO\s+\$\$/.test(trimmed)) inDollarBlock = true;
      current += line + '\n';
      if (inDollarBlock) {
        if (/\$\$\s*;\s*$/.test(trimmed)) {
          statements.push(current.trim());
          current = '';
          inDollarBlock = false;
        }
      } else if (/;\s*$/.test(trimmed) && trimmed !== '') {
        statements.push(current.trim());
        current = '';
      }
    }
    if (current.trim()) statements.push(current.trim());
    for (const stmt of statements) {
      try { await db.query(stmt); }
      catch (e) { console.warn('Schema stmt warn:', e.message.substring(0, 120)); }
    }
    console.log(`Schema OK (${statements.length} statements)`);
  } catch (e) { console.error('schema.sql erro:', e.message); }
}

// Cria admin no primeiro boot se não existir (credenciais do .env)
async function seedAdmin() {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME, ADMIN_USERNAME } = process.env;
  if (!ADMIN_PASSWORD) return;
  if (ADMIN_PASSWORD.length < 8) { console.error('[FATAL] ADMIN_PASSWORD muito curto.'); process.exit(1); }
  const adminUsername = String(ADMIN_USERNAME || ADMIN_NAME || 'admin')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    || 'admin';
  try {
    const exists = await db.query(
      'SELECT id FROM users WHERE email=$1 OR username=$2',
      [ADMIN_EMAIL || '', adminUsername]
    );
    if (exists.rows.length) return;
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    await db.query(
      "INSERT INTO users (name,username,email,password,role,permissions,force_password_change) VALUES ($1,$2,$3,$4,'admin','{\"dashboard\":true,\"products\":true,\"stock\":true,\"orders\":true,\"clients\":true,\"sellers\":true,\"crm\":true,\"financial\":true,\"settings\":true}'::jsonb,true)",
      [ADMIN_NAME||'Administrador', adminUsername, ADMIN_EMAIL || null, hash]
    );
    console.log('Admin criado:', adminUsername);
  } catch(e) { console.error('Seed error:', e.message); }
}

const PORT = process.env.PORT || 3001;
const server = http.createServer(app);

wsServer.init(server);

let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[${signal}] Encerrando gracefully...`);
  server.close(() => {
    console.log('HTTP server fechado');
  });
  wsServer.close?.();
  try {
    await db.end();
    console.log('Pool PostgreSQL fechado');
  } catch (e) { console.error('Erro ao fechar pool:', e.message); }
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

server.listen(PORT, async () => {
  console.log(`[Vortexys] API + WS porta ${PORT} | CORS: ${allowedOrigin}`);
  setTimeout(async () => { await runMigrations(); await seedAdmin(); }, 3000);
});
