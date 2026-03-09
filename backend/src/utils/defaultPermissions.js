'use strict';

const MODULE_PERMISSION_KEYS = [
  'dashboard',
  'pdv',
  'products',
  'stock',
  'orders',
  'returns',
  'client_credits',
  'clients',
  'suppliers',
  'sellers',
  'crm',
  'calendar',
  'service_orders',
  'financial',
  'cash_flow_projection',
  'whatsapp',
  'settings',
];

const DEFAULT_PERMISSIONS = {
  dashboard: true,
  pdv: true,
  products: true,
  stock: true,
  orders: true,
  returns: true,
  client_credits: true,
  clients: true,
  suppliers: true,
  sellers: true,
  crm: true,
  calendar: true,
  service_orders: true,
  financial: true,
  cash_flow_projection: true,
  whatsapp: true,
  settings: false,
  can_authorize_discount: false,
  discount_limit_pct: 10,
};

module.exports = {
  MODULE_PERMISSION_KEYS,
  DEFAULT_PERMISSIONS,
};