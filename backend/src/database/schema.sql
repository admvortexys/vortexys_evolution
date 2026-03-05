-- =============================================
-- VORTEXYS — Schema completo (init + todas migrations)
-- Este arquivo é executado a cada start do servidor.
-- Todos os comandos são idempotentes (IF NOT EXISTS, etc.)
-- =============================================

-- ─── TABELAS BASE ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS settings (
  key   VARCHAR(100) PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  username   VARCHAR(255),
  email      VARCHAR(255) UNIQUE,
  password   VARCHAR(255) NOT NULL,
  role       VARCHAR(50)  DEFAULT 'user',
  active     BOOLEAN      DEFAULT true,
  permissions JSONB DEFAULT '{}'::jsonb,
  force_password_change BOOLEAN DEFAULT false,
  created_at TIMESTAMP    DEFAULT NOW(),
  updated_at TIMESTAMP    DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  type       VARCHAR(50)  DEFAULT 'product',
  color      VARCHAR(50)  DEFAULT '#7c3aed',
  created_at TIMESTAMP    DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS warehouses (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  location   VARCHAR(255),
  active     BOOLEAN   DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id             SERIAL PRIMARY KEY,
  sku            VARCHAR(100) UNIQUE NOT NULL,
  name           VARCHAR(255) NOT NULL,
  description    TEXT,
  category_id    INTEGER REFERENCES categories(id),
  unit           VARCHAR(50)    DEFAULT 'un',
  cost_price     NUMERIC(12,2)  DEFAULT 0,
  sale_price     NUMERIC(12,2)  DEFAULT 0,
  stock_quantity NUMERIC(12,2)  DEFAULT 0,
  min_stock      NUMERIC(12,2)  DEFAULT 0,
  warehouse_id   INTEGER REFERENCES warehouses(id),
  active         BOOLEAN   DEFAULT true,
  barcode        VARCHAR(100),
  image_base64   TEXT,
  created_at     TIMESTAMP DEFAULT NOW(),
  updated_at     TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id             SERIAL PRIMARY KEY,
  product_id     INTEGER REFERENCES products(id),
  type           VARCHAR(20) NOT NULL,
  quantity       NUMERIC(12,2) NOT NULL,
  previous_qty   NUMERIC(12,2),
  new_qty        NUMERIC(12,2),
  reason         VARCHAR(255),
  reference_id   INTEGER,
  reference_type VARCHAR(50),
  user_id        INTEGER REFERENCES users(id),
  created_at     TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clients (
  id         SERIAL PRIMARY KEY,
  type       VARCHAR(20)  DEFAULT 'client',
  name       VARCHAR(255) NOT NULL,
  document   VARCHAR(50),
  email      VARCHAR(255),
  phone      VARCHAR(50),
  address    TEXT,
  city       VARCHAR(100),
  state      VARCHAR(50),
  notes      TEXT,
  active     BOOLEAN   DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sellers (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(255) NOT NULL,
  email        VARCHAR(255),
  phone        VARCHAR(50),
  document     VARCHAR(50),
  commission   NUMERIC(5,2) DEFAULT 5.00,
  goal         NUMERIC(12,2) DEFAULT 0,
  active       BOOLEAN DEFAULT true,
  notes        TEXT,
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id              SERIAL PRIMARY KEY,
  number          VARCHAR(50) UNIQUE NOT NULL,
  client_id       INTEGER REFERENCES clients(id),
  seller_id       INTEGER REFERENCES sellers(id) ON DELETE SET NULL,
  status          VARCHAR(50)   DEFAULT 'draft',
  subtotal        NUMERIC(12,2) DEFAULT 0,
  discount        NUMERIC(12,2) DEFAULT 0,
  total           NUMERIC(12,2) DEFAULT 0,
  notes           TEXT,
  user_id         INTEGER REFERENCES users(id),
  stock_deducted  BOOLEAN DEFAULT false,
  reserved_until  TIMESTAMP,
  cancel_reason   TEXT,
  return_reason   TEXT,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id         SERIAL PRIMARY KEY,
  order_id   INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  quantity   NUMERIC(12,2) NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  discount   NUMERIC(12,2) DEFAULT 0,
  total      NUMERIC(12,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS order_statuses (
  id            SERIAL PRIMARY KEY,
  slug          VARCHAR(50) UNIQUE NOT NULL,
  label         VARCHAR(100) NOT NULL,
  color         VARCHAR(50)  DEFAULT '#6366f1',
  stock_action  VARCHAR(20)  DEFAULT 'none',
  reserve_days  INTEGER,
  position      INTEGER DEFAULT 0,
  is_system     BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS pipelines (
  id       SERIAL PRIMARY KEY,
  name     VARCHAR(255) NOT NULL,
  color    VARCHAR(50) DEFAULT '#7c3aed',
  position INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS leads (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(255) NOT NULL,
  company         VARCHAR(255),
  email           VARCHAR(255),
  phone           VARCHAR(50),
  source          VARCHAR(100),
  pipeline_id     INTEGER REFERENCES pipelines(id),
  estimated_value NUMERIC(12,2) DEFAULT 0,
  probability     INTEGER DEFAULT 0,
  expected_close  DATE,
  lost_reason     TEXT,
  status          VARCHAR(50) DEFAULT 'open',
  user_id         INTEGER REFERENCES users(id),
  notes           TEXT,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activities (
  id          SERIAL PRIMARY KEY,
  lead_id     INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  type        VARCHAR(50) NOT NULL,
  title       VARCHAR(255) NOT NULL,
  description TEXT,
  due_date    TIMESTAMP,
  done        BOOLEAN DEFAULT false,
  user_id     INTEGER REFERENCES users(id),
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proposals (
  id          SERIAL PRIMARY KEY,
  number      VARCHAR(50) UNIQUE NOT NULL,
  lead_id     INTEGER REFERENCES leads(id),
  client_id   INTEGER REFERENCES clients(id),
  title       VARCHAR(255) NOT NULL,
  items       JSONB DEFAULT '[]',
  subtotal    NUMERIC(12,2) DEFAULT 0,
  discount    NUMERIC(12,2) DEFAULT 0,
  total       NUMERIC(12,2) DEFAULT 0,
  status      VARCHAR(30) DEFAULT 'draft',
  version     INTEGER DEFAULT 1,
  notes       TEXT,
  valid_until DATE,
  user_id     INTEGER REFERENCES users(id),
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

-- ─── CRM AVANCADO ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lead_events (
  id          SERIAL PRIMARY KEY,
  lead_id     INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  type        VARCHAR(50) NOT NULL,
  description TEXT,
  metadata    JSONB DEFAULT '{}',
  user_id     INTEGER REFERENCES users(id),
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lead_products (
  id         SERIAL PRIMARY KEY,
  lead_id    INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  quantity   NUMERIC(12,2) DEFAULT 1,
  notes      TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proposals (
  id          SERIAL PRIMARY KEY,
  number      VARCHAR(50) UNIQUE NOT NULL,
  lead_id     INTEGER REFERENCES leads(id),
  client_id   INTEGER REFERENCES clients(id),
  title       VARCHAR(255) NOT NULL,
  items       JSONB DEFAULT '[]',
  subtotal    NUMERIC(12,2) DEFAULT 0,
  discount    NUMERIC(12,2) DEFAULT 0,
  total       NUMERIC(12,2) DEFAULT 0,
  status      VARCHAR(30) DEFAULT 'draft',
  version     INTEGER DEFAULT 1,
  notes       TEXT,
  valid_until DATE,
  user_id     INTEGER REFERENCES users(id),
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS automation_rules (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  "trigger"  VARCHAR(50) NOT NULL,
  condition  JSONB DEFAULT '{}',
  action     VARCHAR(50) NOT NULL,
  config     JSONB DEFAULT '{}',
  active     BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS financial_categories (
  id    SERIAL PRIMARY KEY,
  name  VARCHAR(255) NOT NULL,
  type  VARCHAR(20)  NOT NULL,
  color VARCHAR(50)  DEFAULT '#7c3aed',
  active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS transactions (
  id                   SERIAL PRIMARY KEY,
  type                 VARCHAR(20)   NOT NULL,
  title                VARCHAR(255)  NOT NULL,
  amount               NUMERIC(12,2) NOT NULL,
  due_date             DATE NOT NULL,
  paid_date            DATE,
  paid                 BOOLEAN DEFAULT false,
  category_id          INTEGER REFERENCES financial_categories(id),
  client_id            INTEGER REFERENCES clients(id),
  order_id             INTEGER REFERENCES orders(id),
  notes                TEXT,
  user_id              INTEGER REFERENCES users(id),
  is_recurring         BOOLEAN DEFAULT false,
  recurrence_type      VARCHAR(20),
  recurrence_end       DATE,
  recurrence_parent_id INTEGER REFERENCES transactions(id) ON DELETE CASCADE,
  created_at           TIMESTAMP DEFAULT NOW(),
  updated_at           TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         SERIAL PRIMARY KEY,
  token      UUID NOT NULL UNIQUE,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMP NOT NULL,
  revoked    BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action     VARCHAR(50),
  module     VARCHAR(50),
  target_id  INTEGER,
  ip         VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- ─── WHATSAPP CRM ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wa_instances (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(100) UNIQUE NOT NULL,
  phone        VARCHAR(30),
  status       VARCHAR(30) DEFAULT 'disconnected',
  qr_code      TEXT,
  webhook_url  TEXT,
  active       BOOLEAN DEFAULT true,
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wa_departments (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  color       VARCHAR(20) DEFAULT '#6366f1',
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wa_agents (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
  department_id INTEGER REFERENCES wa_departments(id) ON DELETE CASCADE,
  active        BOOLEAN DEFAULT true,
  created_at    TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, department_id)
);

CREATE TABLE IF NOT EXISTS wa_bot_configs (
  id              SERIAL PRIMARY KEY,
  department_id   INTEGER REFERENCES wa_departments(id) ON DELETE CASCADE,
  enabled         BOOLEAN DEFAULT false,
  provider        VARCHAR(50) DEFAULT 'claude',
  api_key         TEXT,
  system_prompt   TEXT,
  max_turns       INTEGER DEFAULT 10,
  fallback_msg    TEXT DEFAULT 'Aguarde, um agente irá atendê-lo em breve.',
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW(),
  CONSTRAINT wa_bot_configs_department_id_key UNIQUE (department_id)
);

CREATE TABLE IF NOT EXISTS wa_conversations (
  id              SERIAL PRIMARY KEY,
  instance_id     INTEGER REFERENCES wa_instances(id),
  contact_phone   VARCHAR(30) NOT NULL,
  contact_name    VARCHAR(255),
  contact_avatar  TEXT,
  department_id   INTEGER REFERENCES wa_departments(id),
  assigned_to     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status          VARCHAR(30) DEFAULT 'bot',
  unread_count    INTEGER DEFAULT 0,
  last_message    TEXT,
  last_message_at TIMESTAMP,
  bot_active      BOOLEAN DEFAULT true,
  bot_turns       INTEGER DEFAULT 0,
  client_id       INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  lead_id         INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  notes           TEXT,
  wa_phone        VARCHAR(30),
  phone_invalid   BOOLEAN DEFAULT false,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wa_messages (
  id              SERIAL PRIMARY KEY,
  conversation_id INTEGER REFERENCES wa_conversations(id) ON DELETE CASCADE,
  wa_message_id   VARCHAR(255) UNIQUE,
  direction       VARCHAR(10) NOT NULL,
  type            VARCHAR(30) DEFAULT 'text',
  body            TEXT,
  media_url       TEXT,
  media_base64    TEXT,
  media_mimetype  VARCHAR(100),
  media_filename  VARCHAR(255),
  media_duration  INTEGER,
  quoted_id       INTEGER REFERENCES wa_messages(id),
  status          VARCHAR(20) DEFAULT 'sent',
  sent_by         INTEGER REFERENCES users(id),
  is_bot          BOOLEAN DEFAULT false,
  external_id     VARCHAR(128),
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wa_quick_replies (
  id            SERIAL PRIMARY KEY,
  shortcut      VARCHAR(50) UNIQUE NOT NULL,
  title         VARCHAR(100) NOT NULL,
  body          TEXT NOT NULL,
  department_id INTEGER REFERENCES wa_departments(id) ON DELETE SET NULL,
  active        BOOLEAN DEFAULT true,
  created_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wa_tags (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(50) NOT NULL UNIQUE,
  color      VARCHAR(20) DEFAULT '#6366f1',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wa_conversation_tags (
  conversation_id INTEGER REFERENCES wa_conversations(id) ON DELETE CASCADE,
  tag_id          INTEGER REFERENCES wa_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (conversation_id, tag_id)
);

CREATE TABLE IF NOT EXISTS wa_contacts (
  id          SERIAL PRIMARY KEY,
  instance_id INTEGER REFERENCES wa_instances(id) ON DELETE CASCADE,
  phone       VARCHAR(30) NOT NULL,
  name        VARCHAR(255),
  avatar_url  TEXT,
  last_synced_at TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(instance_id, phone)
);

-- ─── INDICES ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_wa_conversations_status ON wa_conversations(status);
CREATE INDEX IF NOT EXISTS idx_wa_conversations_dept ON wa_conversations(department_id);
CREATE INDEX IF NOT EXISTS idx_wa_conversations_assigned ON wa_conversations(assigned_to);
CREATE INDEX IF NOT EXISTS idx_wa_conversations_contact ON wa_conversations(instance_id, contact_phone);
CREATE INDEX IF NOT EXISTS idx_wa_messages_conversation ON wa_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_wa_messages_created ON wa_messages(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_messages_external_id ON wa_messages(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_contacts_phone ON wa_contacts(phone);
CREATE INDEX IF NOT EXISTS idx_wa_contacts_name ON wa_contacts(name);

-- ─── UNIQUE CONSTRAINTS (evitar duplicatas) ─────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_name_type ON categories(name, type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_financial_categories_name_type ON financial_categories(name, type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pipelines_name ON pipelines(name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_warehouses_name ON warehouses(name);

-- ─── COLUNAS ADICIONAIS (IF NOT EXISTS para compatibilidade) ────────────────

ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_base64 TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS color VARCHAR(50) DEFAULT '#7c3aed';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS seller_id INTEGER REFERENCES sellers(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_deducted BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reserved_until TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_reason TEXT;
-- Pedidos avancados
ALTER TABLE orders ADD COLUMN IF NOT EXISTS channel VARCHAR(30) DEFAULT 'balcao';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS operation_type VARCHAR(30) DEFAULT 'order';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS walk_in BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS walk_in_name VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS walk_in_document VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS walk_in_phone VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping NUMERIC(12,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS surcharge NUMERIC(12,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_methods JSONB DEFAULT '[]';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fiscal_type VARCHAR(30);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fiscal_notes TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_type VARCHAR(30);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS credit_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS item_notes TEXT;

-- Creditos de cliente (devolucoes rastreaveis)
CREATE TABLE IF NOT EXISTS client_credits (
  id              SERIAL PRIMARY KEY,
  number          VARCHAR(50) UNIQUE NOT NULL,
  client_id       INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  order_id        INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  type            VARCHAR(30) NOT NULL,
  amount          NUMERIC(12,2) NOT NULL,
  used_amount     NUMERIC(12,2) DEFAULT 0,
  balance         NUMERIC(12,2) NOT NULL,
  status          VARCHAR(20) DEFAULT 'active',
  reason          TEXT NOT NULL,
  order_number    VARCHAR(50),
  order_total     NUMERIC(12,2),
  order_items     JSONB DEFAULT '[]',
  used_on_orders  JSONB DEFAULT '[]',
  created_by      INTEGER REFERENCES users(id),
  created_at      TIMESTAMP DEFAULT NOW(),
  expires_at      TIMESTAMP,
  notes           TEXT
);
CREATE INDEX IF NOT EXISTS idx_client_credits_client ON client_credits(client_id);
CREATE INDEX IF NOT EXISTS idx_client_credits_order ON client_credits(order_id);
CREATE INDEX IF NOT EXISTS idx_client_credits_status ON client_credits(status);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS discount_pct NUMERIC(5,2) DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS recurrence_type VARCHAR(20);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS recurrence_end DATE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS recurrence_parent_id INTEGER REFERENCES transactions(id) ON DELETE CASCADE;
ALTER TABLE financial_categories ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;
ALTER TABLE wa_conversations ADD COLUMN IF NOT EXISTS wa_phone VARCHAR(30);
ALTER TABLE wa_conversations ADD COLUMN IF NOT EXISTS phone_invalid BOOLEAN DEFAULT false;
ALTER TABLE wa_messages ADD COLUMN IF NOT EXISTS external_id VARCHAR(128);
ALTER TABLE wa_contacts ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE wa_contacts ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS document VARCHAR(50);
ALTER TABLE activities ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS birthday DATE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]';

-- ─── PRODUTOS AVANCADOS (loja de celular) ──────────────────────────────────
-- Aba Geral
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand VARCHAR(255);
ALTER TABLE products ADD COLUMN IF NOT EXISTS model VARCHAR(255);
ALTER TABLE products ADD COLUMN IF NOT EXISTS color VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS condition VARCHAR(30) DEFAULT 'new';
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier VARCHAR(255);
ALTER TABLE products ADD COLUMN IF NOT EXISTS gtin VARCHAR(50);
ALTER TABLE products ADD COLUMN IF NOT EXISTS photos JSONB DEFAULT '[]';
ALTER TABLE products ADD COLUMN IF NOT EXISTS variations JSONB DEFAULT '[]';
-- Aba Comercial
ALTER TABLE products ADD COLUMN IF NOT EXISTS promotion_price NUMERIC(12,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS pix_price NUMERIC(12,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS card_price NUMERIC(12,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS commission NUMERIC(5,2) DEFAULT 0;
-- Aba Fiscal
ALTER TABLE products ADD COLUMN IF NOT EXISTS ncm VARCHAR(20);
ALTER TABLE products ADD COLUMN IF NOT EXISTS cest VARCHAR(20);
ALTER TABLE products ADD COLUMN IF NOT EXISTS cst_csosn VARCHAR(10);
ALTER TABLE products ADD COLUMN IF NOT EXISTS cfop VARCHAR(10);
ALTER TABLE products ADD COLUMN IF NOT EXISTS fiscal_origin VARCHAR(5) DEFAULT '0';
ALTER TABLE products ADD COLUMN IF NOT EXISTS nfe_rules JSONB DEFAULT '{}';
-- Aba Estoque
ALTER TABLE products ADD COLUMN IF NOT EXISTS controls_stock BOOLEAN DEFAULT true;
ALTER TABLE products ADD COLUMN IF NOT EXISTS controls_imei BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS controls_serial BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS location VARCHAR(255);
-- Aba Garantia
ALTER TABLE products ADD COLUMN IF NOT EXISTS warranty_manufacturer VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS warranty_store VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS exchange_policy TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS technical_support TEXT;
-- Aba Tecnica
ALTER TABLE products ADD COLUMN IF NOT EXISTS ram VARCHAR(50);
ALTER TABLE products ADD COLUMN IF NOT EXISTS storage VARCHAR(50);
ALTER TABLE products ADD COLUMN IF NOT EXISTS screen VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS battery VARCHAR(50);
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_5g BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS dual_chip BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS esim BOOLEAN DEFAULT false;

-- Tabela de unidades (IMEI/Serial) — opcional por produto
CREATE TABLE IF NOT EXISTS product_units (
  id            SERIAL PRIMARY KEY,
  product_id    INTEGER REFERENCES products(id) ON DELETE CASCADE,
  imei          VARCHAR(20),
  imei2         VARCHAR(20),
  serial        VARCHAR(100),
  status        VARCHAR(30) DEFAULT 'available',
  condition     VARCHAR(30) DEFAULT 'new',
  order_id      INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  supplier      VARCHAR(255),
  purchase_date DATE,
  notes         TEXT,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_units_imei ON product_units(imei) WHERE imei IS NOT NULL AND imei != '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_units_serial ON product_units(serial) WHERE serial IS NOT NULL AND serial != '';
CREATE INDEX IF NOT EXISTS idx_product_units_product ON product_units(product_id);
CREATE INDEX IF NOT EXISTS idx_product_units_status ON product_units(status);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS unit_id INTEGER REFERENCES product_units(id) ON DELETE SET NULL;

-- ─── ESTOQUE AVANCADO ──────────────────────────────────────────────────────
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS movement_type VARCHAR(30);
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS document_type VARCHAR(30);
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS document_number VARCHAR(100);
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS partner_name VARCHAR(255);
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS partner_id INTEGER REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS warehouse_dest_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS qty_in NUMERIC(12,2) DEFAULT 0;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS qty_out NUMERIC(12,2) DEFAULT 0;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS cost_unit NUMERIC(12,2);
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS cost_avg_after NUMERIC(12,2);
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS value_total NUMERIC(12,2);
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS channel VARCHAR(50);
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS unit_id INTEGER REFERENCES product_units(id) ON DELETE SET NULL;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS confirmed BOOLEAN DEFAULT true;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS cancelled BOOLEAN DEFAULT false;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS cancelled_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON stock_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_unit ON stock_movements(unit_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_cancelled ON stock_movements(cancelled);

CREATE INDEX IF NOT EXISTS idx_lead_events_lead ON lead_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_products_lead ON lead_products(lead_id);
CREATE INDEX IF NOT EXISTS idx_activities_due ON activities(due_date) WHERE done=false;
CREATE INDEX IF NOT EXISTS idx_activities_client ON activities(client_id);
CREATE INDEX IF NOT EXISTS idx_leads_client ON leads(client_id);

-- ─── DEDUPLICAR DADOS EXISTENTES ────────────────────────────────────────────

-- Username: popular a partir do nome se vazio
UPDATE users SET username = LOWER(REPLACE(REPLACE(name, ' ', '.'), '''', ''))
WHERE username IS NULL OR username = '';

-- Deduplicar categorias de produtos
DO $$ DECLARE dup RECORD; keep_id INTEGER;
BEGIN FOR dup IN SELECT name, type FROM categories GROUP BY name, type HAVING COUNT(*) > 1 LOOP
  SELECT MIN(id) INTO keep_id FROM categories WHERE name = dup.name AND type = dup.type;
  UPDATE products SET category_id = keep_id WHERE category_id IN (SELECT id FROM categories WHERE name = dup.name AND type = dup.type AND id != keep_id);
  DELETE FROM categories WHERE name = dup.name AND type = dup.type AND id != keep_id;
END LOOP; END $$;

-- Deduplicar categorias financeiras
DO $$ DECLARE dup RECORD; keep_id INTEGER;
BEGIN FOR dup IN SELECT name, type FROM financial_categories GROUP BY name, type HAVING COUNT(*) > 1 LOOP
  SELECT MIN(id) INTO keep_id FROM financial_categories WHERE name = dup.name AND type = dup.type;
  UPDATE transactions SET category_id = keep_id WHERE category_id IN (SELECT id FROM financial_categories WHERE name = dup.name AND type = dup.type AND id != keep_id);
  DELETE FROM financial_categories WHERE name = dup.name AND type = dup.type AND id != keep_id;
END LOOP; END $$;

-- Deduplicar pipelines
DO $$ DECLARE dup RECORD; keep_id INTEGER;
BEGIN FOR dup IN SELECT name FROM pipelines GROUP BY name HAVING COUNT(*) > 1 LOOP
  SELECT MIN(id) INTO keep_id FROM pipelines WHERE name = dup.name;
  UPDATE leads SET pipeline_id = keep_id WHERE pipeline_id IN (SELECT id FROM pipelines WHERE name = dup.name AND id != keep_id);
  DELETE FROM pipelines WHERE name = dup.name AND id != keep_id;
END LOOP; END $$;

-- Deduplicar depositos
DO $$ DECLARE dup RECORD; keep_id INTEGER;
BEGIN FOR dup IN SELECT name FROM warehouses GROUP BY name HAVING COUNT(*) > 1 LOOP
  SELECT MIN(id) INTO keep_id FROM warehouses WHERE name = dup.name;
  UPDATE products SET warehouse_id = keep_id WHERE warehouse_id IN (SELECT id FROM warehouses WHERE name = dup.name AND id != keep_id);
  DELETE FROM warehouses WHERE name = dup.name AND id != keep_id;
END LOOP; END $$;

-- Limpar phones invalidos do WhatsApp
UPDATE wa_conversations SET phone_invalid = true
WHERE contact_phone ~ '@lid' OR contact_phone ~ '[^0-9]' OR LENGTH(contact_phone) > 20;

UPDATE wa_conversations SET contact_phone = REPLACE(contact_phone, '@lid', '')
WHERE contact_phone ~ '@lid';

-- Admin: garantir permissoes completas
UPDATE users SET permissions = '{"dashboard":true,"products":true,"stock":true,"orders":true,"clients":true,"sellers":true,"crm":true,"whatsapp":true,"financial":true,"settings":true}'::jsonb
WHERE role = 'admin';

-- ─── SEEDS (idempotentes) ───────────────────────────────────────────────────

INSERT INTO order_statuses (slug,label,color,stock_action,position,is_system) VALUES
  ('draft',     'Rascunho',   '#6b7280', 'none',   0, true),
  ('confirmed', 'Confirmado', '#3b82f6', 'deduct', 1, true),
  ('separated', 'Separado',   '#8b5cf6', 'none',   2, true),
  ('delivered', 'Entregue',   '#10b981', 'none',   3, true),
  ('returned',  'Devolução',  '#f97316', 'return', 4, true),
  ('cancelled', 'Cancelado',  '#ef4444', 'return', 5, true)
ON CONFLICT (slug) DO NOTHING;

-- Garantir que o status devolução existe (para bancos criados antes dessa versão)
INSERT INTO order_statuses (slug,label,color,stock_action,position,is_system)
VALUES ('returned', 'Devolução', '#f97316', 'return', 4, true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO pipelines (name, color, position) VALUES
  ('Novo Lead',         '#6366f1', 0),
  ('Contato Feito',     '#8b5cf6', 1),
  ('Proposta Enviada',  '#f59e0b', 2),
  ('Negociação',        '#f97316', 3),
  ('Ganho',             '#10b981', 4),
  ('Perdido',           '#ef4444', 5)
ON CONFLICT (name) DO NOTHING;

INSERT INTO warehouses (name, location) VALUES ('Depósito Principal', 'Sede')
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, type) VALUES
  ('Geral','product'), ('Eletrônicos','product'),
  ('Acessórios','product'), ('Serviços','product')
ON CONFLICT (name, type) DO NOTHING;

INSERT INTO financial_categories (name, type, color) VALUES
  ('Vendas','income','#10b981'), ('Serviços','income','#6366f1'),
  ('Outras Receitas','income','#f59e0b'), ('Fornecedores','expense','#ef4444'),
  ('Salários','expense','#f97316'), ('Infraestrutura','expense','#8b5cf6'),
  ('Outras Despesas','expense','#6b7280')
ON CONFLICT (name, type) DO NOTHING;

INSERT INTO wa_tags (name, color) VALUES
  ('Lead', '#10b981'), ('Cliente', '#6366f1'), ('Urgente', '#ef4444'),
  ('Aguardando', '#f59e0b'), ('VIP', '#ec4899')
ON CONFLICT DO NOTHING;

INSERT INTO wa_quick_replies (shortcut, title, body) VALUES
  ('/ola',      'Saudação inicial',      'Olá! Tudo bem? Seja bem-vindo(a)! Como posso ajudar você hoje? 😊'),
  ('/aguarde',  'Pedir para aguardar',   'Só um momento, por favor! Já estou verificando para você. ⏳'),
  ('/horario',  'Horário de atendimento','Nosso horário de atendimento é de segunda a sexta, das 8h às 18h. 🕐'),
  ('/obrigado', 'Agradecimento',         'Muito obrigado pelo contato! Qualquer dúvida, estamos à disposição. 🙏')
ON CONFLICT DO NOTHING;
