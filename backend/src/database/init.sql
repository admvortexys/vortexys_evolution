-- =============================================
-- VORTEXYS — Schema (single-tenant per VM)
-- =============================================

CREATE TABLE IF NOT EXISTS settings (
  key   VARCHAR(100) PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  email      VARCHAR(255) UNIQUE NOT NULL,
  password   VARCHAR(255) NOT NULL,
  role       VARCHAR(50)  DEFAULT 'user',
  active     BOOLEAN      DEFAULT true,
  created_at TIMESTAMP    DEFAULT NOW(),
  updated_at TIMESTAMP    DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  type       VARCHAR(50)  DEFAULT 'product',
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

CREATE TABLE IF NOT EXISTS orders (
  id         SERIAL PRIMARY KEY,
  number     VARCHAR(50) UNIQUE NOT NULL,
  client_id  INTEGER REFERENCES clients(id),
  status     VARCHAR(50)   DEFAULT 'draft',
  subtotal   NUMERIC(12,2) DEFAULT 0,
  discount   NUMERIC(12,2) DEFAULT 0,
  total      NUMERIC(12,2) DEFAULT 0,
  notes      TEXT,
  user_id    INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
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

CREATE TABLE IF NOT EXISTS pipelines (
  id       SERIAL PRIMARY KEY,
  name     VARCHAR(255) NOT NULL,
  color    VARCHAR(50) DEFAULT '#7c3aed',
  position INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS leads (
  id             SERIAL PRIMARY KEY,
  name           VARCHAR(255) NOT NULL,
  company        VARCHAR(255),
  email          VARCHAR(255),
  phone          VARCHAR(50),
  source         VARCHAR(100),
  pipeline_id    INTEGER REFERENCES pipelines(id),
  estimated_value NUMERIC(12,2) DEFAULT 0,
  probability    INTEGER DEFAULT 0,
  expected_close DATE,
  lost_reason    TEXT,
  status         VARCHAR(50) DEFAULT 'open',
  user_id        INTEGER REFERENCES users(id),
  notes          TEXT,
  created_at     TIMESTAMP DEFAULT NOW(),
  updated_at     TIMESTAMP DEFAULT NOW()
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

CREATE TABLE IF NOT EXISTS financial_categories (
  id    SERIAL PRIMARY KEY,
  name  VARCHAR(255) NOT NULL,
  type  VARCHAR(20)  NOT NULL,
  color VARCHAR(50)  DEFAULT '#7c3aed'
);

CREATE TABLE IF NOT EXISTS transactions (
  id          SERIAL PRIMARY KEY,
  type        VARCHAR(20)   NOT NULL,
  title       VARCHAR(255)  NOT NULL,
  amount      NUMERIC(12,2) NOT NULL,
  due_date    DATE NOT NULL,
  paid_date   DATE,
  paid        BOOLEAN DEFAULT false,
  category_id INTEGER REFERENCES financial_categories(id),
  client_id   INTEGER REFERENCES clients(id),
  order_id    INTEGER REFERENCES orders(id),
  notes       TEXT,
  user_id     INTEGER REFERENCES users(id),
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- SEED
-- =============================================
INSERT INTO categories (name,type) VALUES
  ('Geral','product'),('Eletrônicos','product'),
  ('Acessórios','product'),('Serviços','product')
ON CONFLICT DO NOTHING;

INSERT INTO warehouses (name,location) VALUES ('Depósito Principal','Sede')
ON CONFLICT DO NOTHING;

-- Seeds de pipelines removidos

INSERT INTO financial_categories (name,type,color) VALUES
  ('Vendas','income','#10b981'),('Serviços','income','#6366f1'),
  ('Outras Receitas','income','#f59e0b'),('Fornecedores','expense','#ef4444'),
  ('Salários','expense','#f97316'),('Infraestrutura','expense','#8b5cf6'),
  ('Outras Despesas','expense','#6b7280')
ON CONFLICT DO NOTHING;
