'use strict';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('[FATAL] JWT_SECRET ausente ou fraco. Abortando.');
  process.exit(1);
}

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

app.use(helmet());
app.set('trust proxy', 1);

const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';
app.use(cors({ origin: allowedOrigin, credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'] }));

app.use(cookieParser());
app.use(express.json({ limit: '20mb' })); // imagens e midias base64
app.use(rateLimit({ windowMs:60_000, max:300, standardHeaders:true, legacyHeaders:false }));
app.use((req,_,next)=>{ console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`); next(); });

app.use('/api/auth',           require('./routes/auth'));
app.use('/api/users',          require('./routes/users'));
app.use('/api/products',       require('./routes/products'));
app.use('/api/stock',          require('./routes/stock'));
app.use('/api/orders',         require('./routes/orders'));
app.use('/api/order-statuses', require('./routes/orderStatuses'));
app.use('/api/clients',        require('./routes/clients'));
app.use('/api/leads',          require('./routes/leads'));
app.use('/api/pipelines',      require('./routes/pipelines'));
app.use('/api/activities',     require('./routes/activities'));
app.use('/api/transactions',   require('./routes/transactions'));
app.use('/api/categories',     require('./routes/categories'));
app.use('/api/dashboard',      require('./routes/dashboard'));
app.use('/api/sellers',        require('./routes/sellers'));
app.use('/api/whatsapp',       require('./routes/whatsapp'));
app.get('/api/health', (_, res) => res.json({ ok: true }));

app.use(errorHandler);

async function runMigrations() {
  for (const file of ['migrate_v2.sql','migrate_v3.sql','migrate_v4.sql','migrate_v5.sql','migrate_v6.sql','migrate_v7.sql','migrate_v8.sql']) {
    try {
      const sql = fs.readFileSync(path.join(__dirname,'database',file),'utf8');
      await db.query(sql);
      console.log(`Migration ${file} OK`);
    } catch(e) { console.error(`Migration ${file} erro:`, e.message); }
  }
}

async function seedAdmin() {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
  if (ADMIN_PASSWORD.length < 8) { console.error('[FATAL] ADMIN_PASSWORD muito curto.'); process.exit(1); }
  try {
    const exists = await db.query('SELECT id FROM users WHERE email=$1', [ADMIN_EMAIL]);
    if (exists.rows.length) return;
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    await db.query(
      "INSERT INTO users (name,email,password,role,permissions,force_password_change) VALUES ($1,$2,$3,'admin','{\"dashboard\":true,\"products\":true,\"stock\":true,\"orders\":true,\"clients\":true,\"sellers\":true,\"crm\":true,\"financial\":true,\"settings\":true}'::jsonb,true)",
      [ADMIN_NAME||'Administrador', ADMIN_EMAIL, hash]
    );
    console.log('Admin criado:', ADMIN_EMAIL);
  } catch(e) { console.error('Seed error:', e.message); }
}

const PORT = process.env.PORT || 3001;
const server = http.createServer(app);

// Inicia WebSocket
wsServer.init(server);

server.listen(PORT, async () => {
  console.log(`[Vortexys] API + WS porta ${PORT} | CORS: ${allowedOrigin}`);
  setTimeout(async () => { await runMigrations(); await seedAdmin(); }, 3000);
});
