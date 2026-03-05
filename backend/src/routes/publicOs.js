'use strict';
const router = require('express').Router();
const db = require('../database/db');

const STATUS_LABELS = {
  received: 'Recebido',
  analysis: 'Em análise',
  awaiting_approval: 'Aguardando aprovação',
  awaiting_part: 'Aguardando peça',
  repair: 'Em reparo',
  testing: 'Testes',
  ready: 'Pronto para retirada',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};

/** Portal do cliente: consulta OS por token aleatório (sem autenticação) */
router.get('/os/:token', async (req, res, next) => {
  try {
    const token = String(req.params.token || '').trim().toLowerCase();
    if (!token) return res.status(400).json({ error: 'Link inválido' });
    const r = await db.query(
      `SELECT so.number, so.status, so.received_at, so.estimated_at, so.defect_reported,
              c.name as client_name, sod.brand, sod.model, sod.color as device_color
       FROM service_orders so
       LEFT JOIN clients c ON c.id=so.client_id
       LEFT JOIN service_order_devices sod ON sod.service_order_id=so.id
       WHERE so.portal_token=$1
       LIMIT 1`,
      [token]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'OS não encontrada' });
    const os = r.rows[0];
    res.json({
      number: os.number,
      status: os.status,
      statusLabel: STATUS_LABELS[os.status] || os.status,
      receivedAt: os.received_at,
      estimatedAt: os.estimated_at,
      defectReported: os.defect_reported ? String(os.defect_reported).substring(0, 200) : null,
      clientName: os.client_name,
      device: [os.brand, os.model, os.device_color].filter(Boolean).join(' ') || null,
    });
  } catch (e) { next(e); }
});

module.exports = router;
