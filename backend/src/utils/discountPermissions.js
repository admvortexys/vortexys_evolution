'use strict';
const jwt = require('jsonwebtoken');
const { DEFAULT_PERMISSIONS } = require('./defaultPermissions');
const DEFAULT_DISCOUNT_LIMIT_PCT = DEFAULT_PERMISSIONS.discount_limit_pct;
const MAX_DISCOUNT_LIMIT_PCT = 100;
const LEGACY_PERMISSION_FALLBACKS = {
  pdv: 'orders',
  returns: 'orders',
  client_credits: 'orders',
  suppliers: 'clients',
  calendar: 'crm',
  service_orders: 'crm',
  cash_flow_projection: 'financial',
};
function clampPercent(value, fallback = DEFAULT_DISCOUNT_LIMIT_PCT) {
  const parsed = parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed <= 0) return 0;
  if (parsed >= MAX_DISCOUNT_LIMIT_PCT) return MAX_DISCOUNT_LIMIT_PCT;
  return Math.round(parsed * 100) / 100;
}
function resolveModulePermission(source, key) {
  if (Object.prototype.hasOwnProperty.call(source, key)) return !!source[key];
  const legacyKey = LEGACY_PERMISSION_FALLBACKS[key];
  if (legacyKey && Object.prototype.hasOwnProperty.call(source, legacyKey)) return !!source[legacyKey];
  return !!DEFAULT_PERMISSIONS[key];
}
function normalizePermissions(raw = {}, role = 'user') {
  const source = raw || {};
  const permissions = {};
  Object.keys(DEFAULT_PERMISSIONS).forEach(key => {
    if (key === 'can_authorize_discount' || key === 'discount_limit_pct') return;
    permissions[key] = resolveModulePermission(source, key);
  });
  permissions.discount_limit_pct = role === 'admin'
    ? MAX_DISCOUNT_LIMIT_PCT
    : clampPercent(source.discount_limit_pct);
  permissions.can_authorize_discount = role === 'admin'
    ? true
    : !!source.can_authorize_discount;
  return permissions;
}
function getUserDiscountLimit(user) {
  if (user?.role === 'admin') return MAX_DISCOUNT_LIMIT_PCT;
  return clampPercent(user?.permissions?.discount_limit_pct);
}
function canAuthorizeDiscount(user) {
  return user?.role === 'admin' || !!user?.permissions?.can_authorize_discount;
}
function createDiscountApprovalToken({ approver, cashierUserId, approvedDiscountPct }) {
  return jwt.sign({
    type: 'discount_approval',
    approverUserId: approver.id,
    cashierUserId,
    approvedDiscountPct: clampPercent(approvedDiscountPct, 0),
    maxDiscountPct: getUserDiscountLimit(approver),
  }, process.env.JWT_SECRET, { expiresIn: '10m' });
}
function verifyDiscountApprovalToken(token) {
  const payload = jwt.verify(token, process.env.JWT_SECRET);
  if (payload?.type !== 'discount_approval') {
    throw new Error('INVALID_DISCOUNT_APPROVAL_TOKEN');
  }
  return payload;
}
module.exports = {
  DEFAULT_DISCOUNT_LIMIT_PCT,
  MAX_DISCOUNT_LIMIT_PCT,
  normalizePermissions,
  getUserDiscountLimit,
  canAuthorizeDiscount,
  createDiscountApprovalToken,
  verifyDiscountApprovalToken,
};
