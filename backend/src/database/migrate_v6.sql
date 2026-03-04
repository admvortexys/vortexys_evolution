-- =============================================
-- Fix duplicatas sellers
-- =============================================
DELETE FROM sellers a USING sellers b
WHERE a.id > b.id AND a.email = b.email;

ALTER TABLE sellers DROP CONSTRAINT IF EXISTS sellers_email_key;
ALTER TABLE sellers ADD CONSTRAINT sellers_email_key UNIQUE (email);

-- =============================================
-- Fix duplicatas pipelines  
-- =============================================
DELETE FROM pipelines a USING pipelines b
WHERE a.id > b.id AND a.name = b.name;

ALTER TABLE pipelines DROP CONSTRAINT IF EXISTS pipelines_name_key;
ALTER TABLE pipelines ADD CONSTRAINT pipelines_name_key UNIQUE (name);

-- =============================================
-- Tags para conversas WhatsApp
-- =============================================
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

-- Seeds de tags
INSERT INTO wa_tags (name, color) VALUES
  ('Lead', '#10b981'),
  ('Cliente', '#6366f1'),
  ('Urgente', '#ef4444'),
  ('Aguardando', '#f59e0b'),
  ('VIP', '#ec4899')
ON CONFLICT DO NOTHING;

-- Coluna source na conversa (whatsapp | fromMe)
ALTER TABLE wa_conversations ADD COLUMN IF NOT EXISTS wa_phone VARCHAR(30);
