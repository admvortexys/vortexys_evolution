-- =============================================
-- VORTEXYS — Migration v5: WhatsApp CRM
-- =============================================

-- Instâncias do Evolution API (uma por número)
CREATE TABLE IF NOT EXISTS wa_instances (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(100) UNIQUE NOT NULL,
  phone        VARCHAR(30),
  status       VARCHAR(30) DEFAULT 'disconnected', -- connected | disconnected | qr_code
  qr_code      TEXT,
  webhook_url  TEXT,
  active       BOOLEAN DEFAULT true,
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW()
);

-- Departamentos de atendimento
CREATE TABLE IF NOT EXISTS wa_departments (
  CONSTRAINT wa_departments_name_key UNIQUE (name),
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  color       VARCHAR(20) DEFAULT '#6366f1',
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- Agentes por departamento
CREATE TABLE IF NOT EXISTS wa_agents (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
  department_id INTEGER REFERENCES wa_departments(id) ON DELETE CASCADE,
  active        BOOLEAN DEFAULT true,
  created_at    TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, department_id)
);

-- Configuração do bot por departamento
CREATE TABLE IF NOT EXISTS wa_bot_configs (
  id              SERIAL PRIMARY KEY,
  department_id   INTEGER REFERENCES wa_departments(id) ON DELETE CASCADE,
  enabled         BOOLEAN DEFAULT false,
  provider        VARCHAR(50) DEFAULT 'claude', -- claude | openai | custom
  api_key         TEXT,
  system_prompt   TEXT,
  max_turns       INTEGER DEFAULT 10,
  fallback_msg    TEXT DEFAULT 'Aguarde, um agente irá atendê-lo em breve.',
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- Conversas (uma por contato por instância)
CREATE TABLE IF NOT EXISTS wa_conversations (
  id              SERIAL PRIMARY KEY,
  instance_id     INTEGER REFERENCES wa_instances(id),
  contact_phone   VARCHAR(30) NOT NULL,
  contact_name    VARCHAR(255),
  contact_avatar  TEXT,
  department_id   INTEGER REFERENCES wa_departments(id),
  assigned_to     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status          VARCHAR(30) DEFAULT 'bot',   -- bot | queue | active | closed
  unread_count    INTEGER DEFAULT 0,
  last_message    TEXT,
  last_message_at TIMESTAMP,
  bot_active      BOOLEAN DEFAULT true,
  bot_turns       INTEGER DEFAULT 0,
  client_id       INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  lead_id         INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  notes           TEXT,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW(),
  UNIQUE(instance_id, contact_phone)
);

-- Mensagens
CREATE TABLE IF NOT EXISTS wa_messages (
  id              SERIAL PRIMARY KEY,
  conversation_id INTEGER REFERENCES wa_conversations(id) ON DELETE CASCADE,
  wa_message_id   VARCHAR(255) UNIQUE,         -- ID do WhatsApp
  direction       VARCHAR(10) NOT NULL,         -- in | out
  type            VARCHAR(30) DEFAULT 'text',   -- text | image | audio | video | document | sticker | location | reaction
  body            TEXT,
  media_url       TEXT,
  media_base64    TEXT,
  media_mimetype  VARCHAR(100),
  media_filename  VARCHAR(255),
  media_duration  INTEGER,                      -- segundos (áudio/vídeo)
  quoted_id       INTEGER REFERENCES wa_messages(id),
  status          VARCHAR(20) DEFAULT 'sent',   -- sent | delivered | read | failed
  sent_by         INTEGER REFERENCES users(id),
  is_bot          BOOLEAN DEFAULT false,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- Atalhos de resposta rápida
CREATE TABLE IF NOT EXISTS wa_quick_replies (
  id            SERIAL PRIMARY KEY,
  shortcut      VARCHAR(50) UNIQUE NOT NULL,   -- ex: /ola /preco /horario
  title         VARCHAR(100) NOT NULL,
  body          TEXT NOT NULL,
  department_id INTEGER REFERENCES wa_departments(id) ON DELETE SET NULL,
  active        BOOLEAN DEFAULT true,
  created_at    TIMESTAMP DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_wa_conversations_status    ON wa_conversations(status);
CREATE INDEX IF NOT EXISTS idx_wa_conversations_dept      ON wa_conversations(department_id);
CREATE INDEX IF NOT EXISTS idx_wa_conversations_assigned  ON wa_conversations(assigned_to);
CREATE INDEX IF NOT EXISTS idx_wa_messages_conversation   ON wa_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_wa_messages_created        ON wa_messages(created_at DESC);

-- Seeds
-- Seeds de departamentos removidos (inserir via interface)

INSERT INTO wa_quick_replies (shortcut, title, body) VALUES
  ('/ola',      'Saudação inicial',     'Olá! Tudo bem? Seja bem-vindo(a)! Como posso ajudar você hoje? 😊'),
  ('/aguarde',  'Pedir para aguardar',  'Só um momento, por favor! Já estou verificando para você. ⏳'),
  ('/horario',  'Horário de atendimento','Nosso horário de atendimento é de segunda a sexta, das 8h às 18h. 🕐'),
  ('/obrigado', 'Agradecimento',        'Muito obrigado pelo contato! Qualquer dúvida, estamos à disposição. 🙏')
ON CONFLICT DO NOTHING;
