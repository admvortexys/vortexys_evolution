-- =============================================
-- VORTEXYS — Migration v4
-- =============================================

-- Coluna imagem em produto
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_base64 TEXT;

-- Forçar troca de senha no 1º login
ALTER TABLE users ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN DEFAULT false;

-- Refresh tokens (rotativo)
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         SERIAL PRIMARY KEY,
  token      UUID NOT NULL UNIQUE,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMP NOT NULL,
  revoked    BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_logs (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action     VARCHAR(50),
  module     VARCHAR(50),
  target_id  INTEGER,
  ip         VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Status customizáveis de pedido
CREATE TABLE IF NOT EXISTS order_statuses (
  id            SERIAL PRIMARY KEY,
  slug          VARCHAR(50) UNIQUE NOT NULL,
  label         VARCHAR(100) NOT NULL,
  color         VARCHAR(50)  DEFAULT '#6366f1',
  stock_action  VARCHAR(20)  DEFAULT 'none',  -- none | reserve | deduct | return
  reserve_days  INTEGER,                       -- dias de reserva (para stock_action=reserve)
  position      INTEGER DEFAULT 0,
  is_system     BOOLEAN DEFAULT false          -- status de sistema (não pode ser excluído)
);

-- Seed status padrão de sistema
INSERT INTO order_statuses (slug,label,color,stock_action,position,is_system) VALUES
  ('draft',     'Rascunho',   '#6b7280', 'none',   0, true),
  ('confirmed', 'Confirmado', '#3b82f6', 'deduct', 1, true),
  ('separated', 'Separado',   '#8b5cf6', 'none',   2, true),
  ('delivered', 'Entregue',   '#10b981', 'none',   3, true),
  ('cancelled', 'Cancelado',  '#ef4444', 'return', 4, true)
ON CONFLICT (slug) DO NOTHING;

-- Coluna de controle de baixa de estoque no pedido
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_deducted BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reserved_until TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_reason TEXT;

-- Transações recorrentes
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_recurring        BOOLEAN DEFAULT false;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS recurrence_type     VARCHAR(20); -- monthly | weekly | yearly
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS recurrence_end      DATE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS recurrence_parent_id INTEGER REFERENCES transactions(id) ON DELETE CASCADE;

-- Permissions como JSONB (se ainda não existe)
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::jsonb;
