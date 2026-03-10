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
  dashboard: false,
  pdv: false,
  products: false,
  stock: false,
  orders: false,
  returns: false,
  client_credits: false,
  clients: false,
  suppliers: false,
  sellers: false,
  crm: false,
  calendar: false,
  service_orders: false,
  financial: false,
  cash_flow_projection: false,
  whatsapp: false,
  settings: false,
  can_authorize_discount: false,
  discount_limit_pct: 0,
};

module.exports = {
  MODULE_PERMISSION_KEYS,
  DEFAULT_PERMISSIONS,
};
