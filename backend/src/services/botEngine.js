'use strict';
/**
 * Bot Engine — estruturado para IA, desligado por padrão.
 * Para ativar: setar wa_bot_configs.enabled = true e configurar provider/api_key/system_prompt.
 */
const db = require('../database/db');

async function processMessage(conversation, message) {
  // Busca config do bot para o departamento
  const cfg = conversation.department_id
    ? (await db.query('SELECT * FROM wa_bot_configs WHERE department_id=$1', [conversation.department_id])).rows[0]
    : null;

  if (!cfg || !cfg.enabled) return null; // Bot desligado

  // Max turns atingido → encaminha para fila
  if (conversation.bot_turns >= cfg.max_turns) {
    return { action: 'escalate', reason: 'max_turns' };
  }

  // ── Plug IA aqui ────────────────────────────────────────────────────────
  // if (cfg.provider === 'claude') { ... }
  // if (cfg.provider === 'openai') { ... }
  // ────────────────────────────────────────────────────────────────────────

  // Por enquanto retorna fallback e escala
  return { action: 'escalate', reason: 'bot_disabled', fallbackMsg: cfg.fallback_msg };
}

module.exports = { processMessage };
