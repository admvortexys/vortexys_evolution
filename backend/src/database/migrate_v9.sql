-- =============================================
-- VORTEXYS — Migration v9
-- 1. Adiciona external_id em wa_messages para evitar duplicatas ao importar histórico
-- 2. Adiciona avatar_url e pushed_at em wa_contacts
-- =============================================

-- 1. Coluna external_id para deduplicar mensagens importadas do WhatsApp
ALTER TABLE wa_messages ADD COLUMN IF NOT EXISTS external_id VARCHAR(128);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_messages_external_id
  ON wa_messages(external_id) WHERE external_id IS NOT NULL;

-- 2. Colunas extras em wa_contacts (avatar_url já existe, mas garantimos)
ALTER TABLE wa_contacts ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE wa_contacts ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP;
