'use strict';
/**
 * ValidaÃ§Ã£o das variÃ¡veis de ambiente.
 * Usa Zod para garantir que JWT_SECRET, DB_PASSWORD etc. existem antes do servidor subir.
 * process.exit(1) se algo estiver invÃ¡lido.
 */
const { z } = require('zod');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  ACCESS_TOKEN_EXPIRES_IN: z.string().optional(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter pelo menos 32 caracteres'),
  DATA_ENCRYPTION_KEY: z.string().min(32).optional(),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_NAME: z.string().default('vortexys'),
  DB_USER: z.string().default('vortexys'),
  DB_PASSWORD: z.string().min(1, 'DB_PASSWORD Ã© obrigatÃ³rio'),
  DB_SSL: z.enum(['true', 'false']).optional().transform(v => v === 'true'),
  ALLOWED_ORIGIN: z.string().optional(),
  APP_URL: z.string().optional(), // URL do frontend/portal (para links {link} em mensagens WA)
  EVOLUTION_API_URL: z.string().url().optional(),
  EVOLUTION_API_KEY: z.string().optional(),
  WA_WEBHOOK_SECRET: z.string().optional(),
});

function validateEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const msg = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
    console.error('[FATAL] VariÃ¡veis de ambiente invÃ¡lidas:', msg);
    process.exit(1);
  }
  return result.data;
}

module.exports = { validateEnv };


