'use strict';
/**
 * VORTEXYS - Servidor principal da API
 * Entry point do backend. Inicia Express, registra rotas, executa migracoes
 * e cria o admin inicial. Tambem anexa o WebSocket para mensagens em tempo real.
 */

const { validateEnv } = require('./config/env');
validateEnv();

const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const db = require('./database/db');
const errorHandler = require('./middleware/errorHandler');
const wsServer = require('./services/wsServer');
const { validatePasswordStrength } = require('./utils/passwordPolicy');
const { createOpaqueToken, encryptSecret, hashToken, isEncryptedSecret, isTokenHash } = require('./utils/security');

const app = express();

app.use(helmet());
app.set('trust proxy', 1);

const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';
app.use(cors({
  origin: allowedOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(cookieParser());
app.use(express.json({ limit: '20mb' }));
app.use(rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false }));
app.use((req, _, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.use('/api/public', require('./routes/publicOs'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/products', require('./routes/products'));
app.use('/api/stock', require('./routes/stock'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/order-statuses', require('./routes/orderStatuses'));
app.use('/api/credits', require('./routes/credits'));
app.use('/api/returns', require('./routes/returns'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/leads', require('./routes/leads'));
app.use('/api/pipelines', require('./routes/pipelines'));
app.use('/api/activities', require('./routes/activities'));
app.use('/api/service-orders', require('./routes/serviceOrders'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/sellers', require('./routes/sellers'));
app.use('/api/whatsapp', require('./routes/whatsapp'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/proposals', require('./routes/proposals'));
app.use('/api/automations', require('./routes/automations'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/audit-logs', require('./routes/auditLogs'));

app.get('/api/health', async (_, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ ok: true, db: 'ok' });
  } catch (e) {
    res.status(503).json({ ok: false, db: 'error', message: e.message });
  }
});

app.use(errorHandler);

async function runMigrations() {
  const schemaPath = path.join(__dirname, 'database', 'schema.sql');
  try {
    const sql = fs.readFileSync(schemaPath, 'utf8').replace(/^\uFEFF/, '');
    const statements = [];
    let current = '';
    let dollarTag = null;
    const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const line of sql.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('--') && !dollarTag) continue;
      if (!dollarTag) {
        const match = trimmed.match(/\b(?:DO|AS)\s+(\$[A-Za-z0-9_]*\$)/i);
        if (match) dollarTag = match[1];
      }
      current += line + '\n';
      if (dollarTag) {
        const closingTag = new RegExp(`${escapeRegExp(dollarTag)}(?:\\s+LANGUAGE\\b.*)?\\s*;\\s*$`, 'i');
        if (closingTag.test(trimmed) || (trimmed.includes(dollarTag) && /;\s*$/.test(trimmed))) {
          statements.push(current.trim());
          current = '';
          dollarTag = null;
        }
      } else if (/;\s*$/.test(trimmed) && trimmed !== '') {
        statements.push(current.trim());
        current = '';
      }
    }
    if (current.trim()) statements.push(current.trim());
    for (const stmt of statements) {
      try {
        await db.query(stmt);
      } catch (e) {
        console.warn('Schema stmt warn:', e.message.substring(0, 120));
      }
    }
    console.log(`Schema OK (${statements.length} statements)`);
  } catch (e) {
    console.error('schema.sql erro:', e.message);
  }
}
async function runSecurityMigrations() {
  try {
    const refreshTokens = await db.query('SELECT id, token FROM refresh_tokens WHERE token IS NOT NULL');
    for (const row of refreshTokens.rows) {
      if (!isTokenHash(row.token)) {
        await db.query('UPDATE refresh_tokens SET token=$1 WHERE id=$2', [hashToken(row.token), row.id]);
      }
    }

    const serviceOrderPasswords = await db.query(
      "SELECT id, device_password FROM service_orders WHERE device_password IS NOT NULL AND device_password <> ''"
    );
    for (const row of serviceOrderPasswords.rows) {
      if (!isEncryptedSecret(row.device_password)) {
        await db.query('UPDATE service_orders SET device_password=$1 WHERE id=$2', [encryptSecret(row.device_password), row.id]);
      }
    }

    const shortPortalTokens = await db.query(
      'SELECT id FROM service_orders WHERE portal_token IS NULL OR length(portal_token) < 32'
    );
    for (const row of shortPortalTokens.rows) {
      let nextToken = null;
      for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = createOpaqueToken(24);
        const exists = await db.query('SELECT 1 FROM service_orders WHERE portal_token=$1', [candidate]);
        if (!exists.rows.length) {
          nextToken = candidate;
          break;
        }
      }
      if (nextToken) {
        await db.query('UPDATE service_orders SET portal_token=$1 WHERE id=$2', [nextToken, row.id]);
      }
    }
  } catch (e) {
    console.error('security migration error:', e.message);
  }
}

async function seedAdmin() {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME, ADMIN_USERNAME } = process.env;
  if (!ADMIN_PASSWORD) return;
  const adminPasswordError = validatePasswordStrength(ADMIN_PASSWORD);
  if (adminPasswordError) {
    console.warn(`[seedAdmin] Admin nao criado automaticamente: ${adminPasswordError}.`);
    return;
  }
  const adminUsername = String(ADMIN_USERNAME || ADMIN_NAME || 'admin')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '') || 'admin';
  try {
    const exists = await db.query(
      'SELECT id FROM users WHERE email=$1 OR username=$2',
      [ADMIN_EMAIL || '', adminUsername]
    );
    if (exists.rows.length) return;
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    await db.query(
      "INSERT INTO users (name,username,email,password,role,permissions,force_password_change) VALUES ($1,$2,$3,$4,'admin',$5::jsonb,true)",
      [ADMIN_NAME || 'Administrador', adminUsername, ADMIN_EMAIL || null, hash, JSON.stringify({ dashboard: true, products: true, stock: true, orders: true, clients: true, sellers: true, crm: true, financial: true, settings: true })]
    );
    console.log('Admin criado:', adminUsername);
  } catch (e) {
    console.error('Seed error:', e.message);
  }
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
  } catch (e) {
    console.error('Erro ao fechar pool:', e.message);
  }
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

server.listen(PORT, async () => {
  console.log(`[Vortexys] API + WS porta ${PORT} | CORS: ${allowedOrigin}`);
  setTimeout(async () => {
    await runMigrations();
    await runSecurityMigrations();
    await seedAdmin();
  }, 3000);
});
