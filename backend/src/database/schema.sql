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

INSERT INTO order_statuses (slug,label,color,stock_action,reserve_days,position,is_system) VALUES
  ('draft',     'Rascunho',   '#6b7280', 'none',    NULL, 0, true),
  ('confirmed', 'Confirmado', '#3b82f6', 'deduct',  NULL, 1, true),
  ('separated', 'Separado',   '#8b5cf6', 'reserve', 7,    2, true),
  ('delivered', 'Entregue',   '#10b981', 'none',    NULL, 3, true),
  ('returned',  'Devolução',  '#f97316', 'return',  NULL, 4, true),
  ('cancelled', 'Cancelado',  '#ef4444', 'return',  NULL, 5, true)
ON CONFLICT (slug) DO NOTHING;

-- Garantir que status de sistema existem e estão corretos (para bancos antigos)
INSERT INTO order_statuses (slug,label,color,stock_action,reserve_days,position,is_system)
VALUES ('returned', 'Devolução', '#f97316', 'return', NULL, 4, true)
ON CONFLICT (slug) DO NOTHING;

UPDATE order_statuses SET stock_action='reserve', reserve_days=COALESCE(reserve_days,7) WHERE slug='separated';

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

-- ─── MÓDULO DE DEVOLUÇÕES ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS returns (
  id                SERIAL PRIMARY KEY,
  number            VARCHAR(50) UNIQUE NOT NULL,
  order_id          INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  order_number      VARCHAR(50),
  client_id         INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  client_name       VARCHAR(255),
  status            VARCHAR(30) DEFAULT 'draft',
  type              VARCHAR(30) DEFAULT 'return_client',
  origin            VARCHAR(30) DEFAULT 'balcao',
  subtotal          NUMERIC(12,2) DEFAULT 0,
  total_refund      NUMERIC(12,2) DEFAULT 0,
  refund_type       VARCHAR(30),
  refund_method     VARCHAR(30),
  credit_id         INTEGER REFERENCES client_credits(id) ON DELETE SET NULL,
  exchange_order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  fiscal_doc_origin VARCHAR(100),
  fiscal_doc_return VARCHAR(100),
  checklist         JSONB DEFAULT '{}',
  attachments       JSONB DEFAULT '[]',
  notes             TEXT,
  created_by        INTEGER REFERENCES users(id),
  approved_by       INTEGER REFERENCES users(id),
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_returns_order ON returns(order_id);
CREATE INDEX IF NOT EXISTS idx_returns_client ON returns(client_id);
CREATE INDEX IF NOT EXISTS idx_returns_status ON returns(status);
CREATE INDEX IF NOT EXISTS idx_returns_number ON returns(number);

CREATE TABLE IF NOT EXISTS return_items (
  id                 SERIAL PRIMARY KEY,
  return_id          INTEGER REFERENCES returns(id) ON DELETE CASCADE,
  order_item_id      INTEGER REFERENCES order_items(id) ON DELETE SET NULL,
  product_id         INTEGER REFERENCES products(id) ON DELETE SET NULL,
  unit_id            INTEGER REFERENCES product_units(id) ON DELETE SET NULL,
  product_name       VARCHAR(255),
  sku                VARCHAR(100),
  imei               VARCHAR(20),
  imei2              VARCHAR(20),
  serial_number      VARCHAR(100),
  quantity_original  NUMERIC(12,2) DEFAULT 0,
  quantity_returned  NUMERIC(12,2) DEFAULT 0,
  unit_price         NUMERIC(12,2) DEFAULT 0,
  discount           NUMERIC(12,2) DEFAULT 0,
  total_refund       NUMERIC(12,2) DEFAULT 0,
  reason             VARCHAR(50) DEFAULT 'other',
  condition          VARCHAR(30) DEFAULT 'open',
  stock_destination  VARCHAR(30) DEFAULT 'available',
  notes              TEXT
);
CREATE INDEX IF NOT EXISTS idx_return_items_return ON return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_return_items_product ON return_items(product_id);
CREATE INDEX IF NOT EXISTS idx_return_items_unit ON return_items(unit_id);

-- ─── FINANCEIRO AVANCADO ─────────────────────────────────────────────────

-- Contas financeiras (caixa, banco, maquininha)
CREATE TABLE IF NOT EXISTS financial_accounts (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  type       VARCHAR(30) DEFAULT 'bank',
  bank_name  VARCHAR(255),
  agency     VARCHAR(30),
  account_number VARCHAR(50),
  initial_balance NUMERIC(12,2) DEFAULT 0,
  active     BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_financial_accounts_name ON financial_accounts(name);
INSERT INTO financial_accounts (name, type, initial_balance) VALUES
  ('Caixa', 'cash', 0),
  ('Banco', 'bank', 0),
  ('Maquininha', 'card_machine', 0),
  ('PIX', 'pix', 0)
ON CONFLICT (name) DO NOTHING;

-- Novas colunas em transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES financial_accounts(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS installment_number INTEGER;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS installment_total INTEGER;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS original_amount NUMERIC(12,2);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS fee_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS interest_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12,2);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS seller_id INTEGER REFERENCES sellers(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS return_id INTEGER REFERENCES returns(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS document_ref VARCHAR(100);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS overdue BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_method ON transactions(payment_method);
CREATE INDEX IF NOT EXISTS idx_transactions_order ON transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_transactions_due ON transactions(due_date);
CREATE INDEX IF NOT EXISTS idx_transactions_paid ON transactions(paid);

-- Sessoes de caixa (abertura/fechamento)
CREATE TABLE IF NOT EXISTS cash_sessions (
  id              SERIAL PRIMARY KEY,
  account_id      INTEGER REFERENCES financial_accounts(id),
  opened_by       INTEGER REFERENCES users(id),
  closed_by       INTEGER REFERENCES users(id),
  opening_balance NUMERIC(12,2) DEFAULT 0,
  closing_balance NUMERIC(12,2),
  cash_in         NUMERIC(12,2) DEFAULT 0,
  cash_out        NUMERIC(12,2) DEFAULT 0,
  difference      NUMERIC(12,2),
  status          VARCHAR(20) DEFAULT 'open',
  notes           TEXT,
  opened_at       TIMESTAMP DEFAULT NOW(),
  closed_at       TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_status ON cash_sessions(status);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_date ON cash_sessions(opened_at);

-- Movimentacoes do caixa (sangria, suprimento, etc)
CREATE TABLE IF NOT EXISTS cash_movements (
  id             SERIAL PRIMARY KEY,
  session_id     INTEGER REFERENCES cash_sessions(id) ON DELETE CASCADE,
  type           VARCHAR(20) NOT NULL,
  amount         NUMERIC(12,2) NOT NULL,
  description    VARCHAR(255),
  transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
  user_id        INTEGER REFERENCES users(id),
  created_at     TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cash_movements_session ON cash_movements(session_id);

-- Atualizar flag overdue para transacoes vencidas
UPDATE transactions SET overdue = true
WHERE paid = false AND due_date < CURRENT_DATE AND overdue IS NOT TRUE;

-- ─── AGENDA AVANCADA ─────────────────────────────────────────────────────

-- Expandir activities para funcionar como agenda ERP
ALTER TABLE activities ADD COLUMN IF NOT EXISTS event_type VARCHAR(30) DEFAULT 'task';
ALTER TABLE activities ADD COLUMN IF NOT EXISTS color VARCHAR(30);
ALTER TABLE activities ADD COLUMN IF NOT EXISTS all_day BOOLEAN DEFAULT false;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS end_date TIMESTAMP;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS seller_id INTEGER REFERENCES sellers(id) ON DELETE SET NULL;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS priority VARCHAR(10) DEFAULT 'normal';
ALTER TABLE activities ADD COLUMN IF NOT EXISTS recurrence VARCHAR(20);
ALTER TABLE activities ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS completed_by INTEGER REFERENCES users(id);

-- WhatsApp agendado vinculado a eventos
ALTER TABLE activities ADD COLUMN IF NOT EXISTS wa_scheduled BOOLEAN DEFAULT false;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS wa_send_at TIMESTAMP;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS wa_phone VARCHAR(30);
ALTER TABLE activities ADD COLUMN IF NOT EXISTS wa_message TEXT;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS wa_template VARCHAR(50);
ALTER TABLE activities ADD COLUMN IF NOT EXISTS wa_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE activities ADD COLUMN IF NOT EXISTS wa_sent_at TIMESTAMP;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS wa_error TEXT;

CREATE INDEX IF NOT EXISTS idx_activities_event_type ON activities(event_type);
CREATE INDEX IF NOT EXISTS idx_activities_order ON activities(order_id);
CREATE INDEX IF NOT EXISTS idx_activities_transaction ON activities(transaction_id);
CREATE INDEX IF NOT EXISTS idx_activities_wa ON activities(wa_scheduled, wa_status) WHERE wa_scheduled=true;

-- ─── ASSISTÊNCIA TÉCNICA (ORDEM DE SERVIÇO) ──────────────────────────────────

-- Cadastro de serviços (troca bateria, tela, diagnóstico, etc)
CREATE TABLE IF NOT EXISTS service_services (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  description   TEXT,
  avg_time_mins  INTEGER DEFAULT 60,
  default_price NUMERIC(12,2) DEFAULT 0,
  checklist     JSONB DEFAULT '[]',
  active        BOOLEAN DEFAULT true,
  created_at    TIMESTAMP DEFAULT NOW()
);

-- Status da OS (pipeline)
CREATE TABLE IF NOT EXISTS service_order_statuses (
  id       SERIAL PRIMARY KEY,
  slug     VARCHAR(50) UNIQUE NOT NULL,
  label    VARCHAR(100) NOT NULL,
  color    VARCHAR(50) DEFAULT '#6366f1',
  position INTEGER DEFAULT 0
);
INSERT INTO service_order_statuses (slug, label, color, position) VALUES
  ('received', 'Recebido', '#6b7280', 1),
  ('analysis', 'Em análise', '#3b82f6', 2),
  ('awaiting_approval', 'Aguardando aprovação', '#f59e0b', 3),
  ('awaiting_part', 'Aguardando peça', '#f97316', 4),
  ('repair', 'Em reparo', '#8b5cf6', 5),
  ('testing', 'Testes', '#06b6d4', 6),
  ('ready', 'Pronto para retirada', '#10b981', 7),
  ('delivered', 'Entregue', '#22c55e', 8),
  ('cancelled', 'Cancelado / Sem reparo', '#ef4444', 9)
ON CONFLICT (slug) DO NOTHING;

-- Ordem de Serviço (cabeçalho)
CREATE TABLE IF NOT EXISTS service_orders (
  id              SERIAL PRIMARY KEY,
  number          VARCHAR(50) UNIQUE NOT NULL,
  client_id       INTEGER REFERENCES clients(id),
  walk_in_name    VARCHAR(255),
  walk_in_phone   VARCHAR(50),
  walk_in_doc     VARCHAR(50),
  technician_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status          VARCHAR(50) DEFAULT 'received',
  priority        VARCHAR(20) DEFAULT 'normal',
  received_at     TIMESTAMP DEFAULT NOW(),
  estimated_at    TIMESTAMP,
  completed_at    TIMESTAMP,
  delivered_at    TIMESTAMP,
  defect_reported TEXT,
  accessories     TEXT,
  device_state    TEXT,
  password_informed BOOLEAN,
  photos          JSONB DEFAULT '[]',
  initial_quote    NUMERIC(12,2),
  warranty_days   INTEGER DEFAULT 90,
  warranty_part_days INTEGER,
  notes           TEXT,
  return_os_id    INTEGER REFERENCES service_orders(id) ON DELETE SET NULL,
  order_id        INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  user_id         INTEGER REFERENCES users(id),
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- Aparelho vinculado à OS
CREATE TABLE IF NOT EXISTS service_order_devices (
  id          SERIAL PRIMARY KEY,
  service_order_id INTEGER REFERENCES service_orders(id) ON DELETE CASCADE,
  brand       VARCHAR(100),
  model       VARCHAR(255),
  color       VARCHAR(50),
  storage     VARCHAR(50),
  imei        VARCHAR(50),
  serial      VARCHAR(100),
  created_at  TIMESTAMP DEFAULT NOW()
);

-- Itens do orçamento (serviço + peça)
CREATE TABLE IF NOT EXISTS service_order_items (
  id              SERIAL PRIMARY KEY,
  service_order_id INTEGER REFERENCES service_orders(id) ON DELETE CASCADE,
  type            VARCHAR(20) NOT NULL,
  service_id      INTEGER REFERENCES service_services(id) ON DELETE SET NULL,
  product_id      INTEGER REFERENCES products(id) ON DELETE SET NULL,
  description     VARCHAR(255),
  quantity        NUMERIC(12,2) DEFAULT 1,
  unit_cost       NUMERIC(12,2) DEFAULT 0,
  unit_price      NUMERIC(12,2) DEFAULT 0,
  discount        NUMERIC(12,2) DEFAULT 0,
  stock_deducted  BOOLEAN DEFAULT false,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- Checklist entrada / pós-reparo
CREATE TABLE IF NOT EXISTS service_order_checklists (
  id              SERIAL PRIMARY KEY,
  service_order_id INTEGER REFERENCES service_orders(id) ON DELETE CASCADE,
  phase           VARCHAR(20) NOT NULL,
  item_key        VARCHAR(50) NOT NULL,
  label           VARCHAR(255),
  value           VARCHAR(50),
  checked_at      TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- Aprovação do orçamento
CREATE TABLE IF NOT EXISTS service_order_approvals (
  id              SERIAL PRIMARY KEY,
  service_order_id INTEGER REFERENCES service_orders(id) ON DELETE CASCADE,
  approved        BOOLEAN NOT NULL,
  approved_at     TIMESTAMP DEFAULT NOW(),
  notes           TEXT,
  attachment      TEXT,
  user_id         INTEGER REFERENCES users(id),
  created_at      TIMESTAMP DEFAULT NOW()
);

-- Log de mudanças (auditoria)
CREATE TABLE IF NOT EXISTS service_order_logs (
  id              SERIAL PRIMARY KEY,
  service_order_id INTEGER REFERENCES service_orders(id) ON DELETE CASCADE,
  action          VARCHAR(50) NOT NULL,
  field           VARCHAR(50),
  old_value       TEXT,
  new_value       TEXT,
  user_id         INTEGER REFERENCES users(id),
  created_at      TIMESTAMP DEFAULT NOW()
);

-- Mensagens WhatsApp por OS
CREATE TABLE IF NOT EXISTS service_order_messages (
  id              SERIAL PRIMARY KEY,
  service_order_id INTEGER REFERENCES service_orders(id) ON DELETE CASCADE,
  template        VARCHAR(50),
  message         TEXT,
  phone           VARCHAR(30),
  status          VARCHAR(20) DEFAULT 'pending',
  sent_at         TIMESTAMP,
  error           TEXT,
  user_id         INTEGER REFERENCES users(id),
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_orders_client ON service_orders(client_id);
CREATE INDEX IF NOT EXISTS idx_service_orders_status ON service_orders(status);
CREATE INDEX IF NOT EXISTS idx_service_orders_technician ON service_orders(technician_id);
CREATE INDEX IF NOT EXISTS idx_service_orders_received ON service_orders(received_at);
CREATE INDEX IF NOT EXISTS idx_service_order_items_os ON service_order_items(service_order_id);
CREATE INDEX IF NOT EXISTS idx_service_order_checklists_os ON service_order_checklists(service_order_id);

-- Seed serviços padrão (apenas se vazio)
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM service_services) = 0 THEN
    INSERT INTO service_services (name, description, avg_time_mins, default_price) VALUES
      ('Diagnóstico', 'Avaliação inicial do aparelho', 30, 0),
      ('Troca de bateria', 'Substituição da bateria', 60, 150),
      ('Troca de tela', 'Substituição da tela', 90, 350),
      ('Troca de conector', 'Substituição do conector de carga', 45, 80),
      ('Desoxidação', 'Limpeza e desoxidação', 120, 120),
      ('Software', 'Formatação / atualização', 60, 80),
      ('Micro-solda', 'Reparo em placa', 120, 150);
  END IF;
END $$;
