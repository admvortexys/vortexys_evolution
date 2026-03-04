-- =============================================
-- VORTEXYS — Migration v3
-- Módulo de Vendedores
-- =============================================

-- Tabela de vendedores
CREATE TABLE IF NOT EXISTS sellers (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(255) NOT NULL,
  email        VARCHAR(255),
  phone        VARCHAR(50),
  document     VARCHAR(50),
  commission   NUMERIC(5,2) DEFAULT 5.00,  -- % de comissão padrão
  goal         NUMERIC(12,2) DEFAULT 0,     -- meta mensal
  active       BOOLEAN DEFAULT true,
  notes        TEXT,
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW()
);

-- FK: pedido pode ter um vendedor
ALTER TABLE orders ADD COLUMN IF NOT EXISTS seller_id INTEGER REFERENCES sellers(id) ON DELETE SET NULL;

-- Permissão do módulo sellers para admins
UPDATE users
SET permissions = permissions || '{"sellers": true}'::jsonb
WHERE role = 'admin';

-- Seed de exemplo
-- Seeds de vendedores removidos
