-- =============================================
-- VORTEXYS — Migration v11
-- 1. Adiciona username na tabela users para login por usuário
-- 2. Deduplica categorias de produtos e financeiras
-- 3. Adiciona unique constraints para evitar duplicatas futuras
-- 4. Seed de pipelines padrão para CRM (se não existirem)
-- 5. Fix: coluna color em categories (se não existir)
-- =============================================

-- 1. Username para login
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(255);

UPDATE users SET username = LOWER(REPLACE(REPLACE(name, ' ', '.'), '''', ''))
WHERE username IS NULL OR username = '';

ALTER TABLE users ALTER COLUMN username SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Email agora é opcional (nem todo mundo tem email)
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

-- 2. Coluna color em categories (alguns ambientes não têm)
ALTER TABLE categories ADD COLUMN IF NOT EXISTS color VARCHAR(50) DEFAULT '#7c3aed';

-- 3. Deduplicar categorias de produtos
DO $$
DECLARE
  dup RECORD;
  keep_id INTEGER;
BEGIN
  FOR dup IN
    SELECT name, type FROM categories GROUP BY name, type HAVING COUNT(*) > 1
  LOOP
    SELECT MIN(id) INTO keep_id FROM categories WHERE name = dup.name AND type = dup.type;
    UPDATE products SET category_id = keep_id
      WHERE category_id IN (SELECT id FROM categories WHERE name = dup.name AND type = dup.type AND id != keep_id);
    DELETE FROM categories WHERE name = dup.name AND type = dup.type AND id != keep_id;
  END LOOP;
END $$;

-- 4. Deduplicar categorias financeiras
DO $$
DECLARE
  dup RECORD;
  keep_id INTEGER;
BEGIN
  FOR dup IN
    SELECT name, type FROM financial_categories GROUP BY name, type HAVING COUNT(*) > 1
  LOOP
    SELECT MIN(id) INTO keep_id FROM financial_categories WHERE name = dup.name AND type = dup.type;
    UPDATE transactions SET category_id = keep_id
      WHERE category_id IN (SELECT id FROM financial_categories WHERE name = dup.name AND type = dup.type AND id != keep_id);
    DELETE FROM financial_categories WHERE name = dup.name AND type = dup.type AND id != keep_id;
  END LOOP;
END $$;

-- 5. Unique constraints para evitar duplicatas futuras
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_name_type
  ON categories(name, type);

CREATE UNIQUE INDEX IF NOT EXISTS idx_financial_categories_name_type
  ON financial_categories(name, type);

-- 6. Deduplicar pipelines existentes
DO $$
DECLARE
  dup RECORD;
  keep_id INTEGER;
BEGIN
  FOR dup IN
    SELECT name FROM pipelines GROUP BY name HAVING COUNT(*) > 1
  LOOP
    SELECT MIN(id) INTO keep_id FROM pipelines WHERE name = dup.name;
    UPDATE leads SET pipeline_id = keep_id
      WHERE pipeline_id IN (SELECT id FROM pipelines WHERE name = dup.name AND id != keep_id);
    DELETE FROM pipelines WHERE name = dup.name AND id != keep_id;
  END LOOP;
END $$;

-- Garantir que pipelines tenham unique name
CREATE UNIQUE INDEX IF NOT EXISTS idx_pipelines_name ON pipelines(name);

-- 7. Seed de pipelines padrão para CRM
INSERT INTO pipelines (name, color, position) VALUES
  ('Novo Lead', '#6366f1', 0),
  ('Contato Feito', '#8b5cf6', 1),
  ('Proposta Enviada', '#f59e0b', 2),
  ('Negociação', '#f97316', 3),
  ('Ganho', '#10b981', 4),
  ('Perdido', '#ef4444', 5)
ON CONFLICT (name) DO NOTHING;
