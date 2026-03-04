-- =============================================
-- VORTEXYS — Migration v8
-- 1. Remove departamentos duplicados (manter apenas o de menor id por nome)
-- 2. Remove o UNIQUE constraint por name (permitir nomes iguais com cores diferentes no futuro)
--    e substitui por unique em lowercase no app layer
-- 3. Remove o UNIQUE constraint (instance_id, contact_phone) de wa_conversations
--    para permitir múltiplas conversas por contato (recompras, novas interações)
-- =============================================

-- 1. Remover departamentos duplicados (manter o de menor id por nome case-insensitive)
DELETE FROM wa_departments
WHERE id NOT IN (
  SELECT MIN(id) FROM wa_departments
  GROUP BY LOWER(name)
);

-- 2. Dropar o UNIQUE constraint por name (controle passa para o app layer)
ALTER TABLE wa_departments DROP CONSTRAINT IF EXISTS wa_departments_name_key;

-- 3. Remover UNIQUE constraint (instance_id, contact_phone) de wa_conversations
--    para permitir múltiplas conversas por contato
ALTER TABLE wa_conversations DROP CONSTRAINT IF EXISTS wa_conversations_instance_id_contact_phone_key;

-- Adicionar índice normal (não unique) para buscas por contato
CREATE INDEX IF NOT EXISTS idx_wa_conversations_contact
  ON wa_conversations(instance_id, contact_phone);

-- 4. Tabela de contatos da agenda do WhatsApp (importados via sync)
CREATE TABLE IF NOT EXISTS wa_contacts (
  id          SERIAL PRIMARY KEY,
  instance_id INTEGER REFERENCES wa_instances(id) ON DELETE CASCADE,
  phone       VARCHAR(30) NOT NULL,
  name        VARCHAR(255),
  avatar_url  TEXT,
  updated_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(instance_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_wa_contacts_phone ON wa_contacts(phone);
CREATE INDEX IF NOT EXISTS idx_wa_contacts_name  ON wa_contacts(name);
