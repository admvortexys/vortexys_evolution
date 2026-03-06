'use strict';
/**
 * Configurações: tema white-label (nome, cores, logo).
 * GET /theme — público, retorna tema atual (DB ou env).
 * PUT /theme — protegido, salva na tabela settings.
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

// Público — tema para login e app
router.get('/theme', async (req, res, next) => {
  try {
    const theme = await getThemeFromDb();
    res.json(theme);
  } catch (e) { next(e); }
});

// Protegido — salvar tema (admin/settings)
router.put('/theme', auth, requirePermission('settings'), async (req, res, next) => {
  const { company_name, primary_color, secondary_color, logo_url } = req.body || {};
  const updates = {};
  if (company_name != null && typeof company_name === 'string') updates.company_name = company_name.trim();
  if (primary_color != null && typeof primary_color === 'string') updates.primary_color = primary_color.trim();
  if (secondary_color != null && typeof secondary_color === 'string') updates.secondary_color = secondary_color.trim();
  if (logo_url != null) updates.logo_url = typeof logo_url === 'string' ? logo_url.trim() : '';

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Nenhum campo válido para atualizar' });
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
