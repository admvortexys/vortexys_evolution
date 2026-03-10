'use strict';
/**
 * Configuracoes: tema white-label (nome, cores, logo).
 * GET /theme - publico, retorna tema atual (DB ou env).
 * PUT /theme - protegido, salva na tabela settings.
 */
const router = require('express').Router();
const db = require('../database/db');
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

const THEME_KEYS = ['company_name', 'primary_color', 'secondary_color', 'logo_url'];
const DEFAULTS = {
  company_name: process.env.VITE_COMPANY_NAME || 'Vortexys',
  primary_color: process.env.VITE_PRIMARY_COLOR || '#a855f7',
  secondary_color: process.env.VITE_SECONDARY_COLOR || '#f97316',
  logo_url: process.env.VITE_LOGO_URL || '',
};

function normalizeColor(value, label) {
  const trimmed = String(value || '').trim();
  if (!trimmed) throw new Error(`${label} invalida`);
  const normalized = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (!/^#[0-9a-fA-F]{6}$/.test(normalized)) throw new Error(`${label} invalida`);
  return normalized.toLowerCase();
}

function normalizeLogoUrl(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('invalid protocol');
    return parsed.toString();
  } catch {
    throw new Error('Logo URL invalida');
  }
}

async function getThemeFromDb() {
  const r = await db.query(
    "SELECT key, value FROM settings WHERE key = ANY($1)",
    [THEME_KEYS]
  );
  const map = Object.fromEntries((r.rows || []).map(x => [x.key, x.value]));
  return {
    company_name: map.company_name ?? DEFAULTS.company_name,
    primary_color: map.primary_color ?? DEFAULTS.primary_color,
    secondary_color: map.secondary_color ?? DEFAULTS.secondary_color,
    logo_url: map.logo_url ?? DEFAULTS.logo_url,
  };
}

router.get('/theme', async (req, res, next) => {
  try {
    const theme = await getThemeFromDb();
    res.json(theme);
  } catch (e) { next(e); }
});

router.put('/theme', auth, requirePermission('settings'), async (req, res, next) => {
  const { company_name, primary_color, secondary_color, logo_url } = req.body || {};
  const updates = {};

  try {
    if (company_name != null) {
      if (typeof company_name !== 'string') throw new Error('Nome da empresa invalido');
      const trimmed = company_name.trim();
      if (!trimmed || trimmed.length > 120) throw new Error('Nome da empresa invalido');
      updates.company_name = trimmed;
    }
    if (primary_color != null) updates.primary_color = normalizeColor(primary_color, 'Cor primaria');
    if (secondary_color != null) updates.secondary_color = normalizeColor(secondary_color, 'Cor secundaria');
    if (logo_url != null) updates.logo_url = normalizeLogoUrl(logo_url);
  } catch (e) {
    return res.status(400).json({ error: e.message || 'Dados invalidos' });
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Nenhum campo valido para atualizar' });
  }

  try {
    for (const [key, value] of Object.entries(updates)) {
      await db.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = $2`,
        [key, value]
      );
    }
    const theme = await getThemeFromDb();
    res.json(theme);
  } catch (e) { next(e); }
});

module.exports = router;
