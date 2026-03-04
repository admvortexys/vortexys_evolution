-- =============================================
-- VORTEXYS — Migration v2
-- Adicionar campos novos sem quebrar schema existente
-- =============================================

-- Permissões por módulo na tabela users
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{
  "dashboard": true,
  "products": true,
  "stock": true,
  "orders": true,
  "clients": true,
  "crm": true,
  "financial": true,
  "settings": false
}'::jsonb;

-- Código de barras nos produtos
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);

-- Motivo de cancelamento/devolução nos pedidos
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_reason TEXT;

-- Cor nas categorias de produtos
ALTER TABLE categories ADD COLUMN IF NOT EXISTS color VARCHAR(20) DEFAULT '#7c3aed';

-- CRUD completo nas categorias financeiras
-- (tabela já existe, só garantir que tem color)
ALTER TABLE financial_categories ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;

-- Atualizar admin existente com permissões completas
UPDATE users SET permissions = '{"dashboard":true,"products":true,"stock":true,"orders":true,"clients":true,"sellers":true,"crm":true,"financial":true,"settings":true}'::jsonb WHERE role = 'admin';
