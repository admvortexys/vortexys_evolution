-- =============================================
-- VORTEXYS — Migration v10
-- Corrige números de telefone com formato @lid do WhatsApp
-- Números como "255705508540447@lid" ou "255705508540447" (muito longos/não numéricos)
-- são IDs internos do WhatsApp e não podem ser usados para enviar mensagens.
-- Esta migration marca essas conversas para que o agente saiba que o número é inválido.
-- =============================================

-- 1. Adiciona coluna phone_invalid nas conversas com número problemático
ALTER TABLE wa_conversations ADD COLUMN IF NOT EXISTS phone_invalid BOOLEAN DEFAULT false;

-- 2. Marca conversas cujo contact_phone contém @lid ou não é numérico puro
UPDATE wa_conversations
SET phone_invalid = true
WHERE contact_phone ~ '@lid'
   OR contact_phone ~ '[^0-9]'
   OR LENGTH(contact_phone) > 20;

-- 3. Remove @lid do phone se tiver (limpeza parcial)
UPDATE wa_conversations
SET contact_phone = REPLACE(contact_phone, '@lid', '')
WHERE contact_phone ~ '@lid';

-- 4. Limpa wa_contacts com phones inválidos (IDs internos do Evolution)
DELETE FROM wa_contacts
WHERE phone !~ '^[0-9]+$'
   OR LENGTH(phone) > 20
   OR LENGTH(phone) < 5;
