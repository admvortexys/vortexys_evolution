'use strict';

const jwt = require('jsonwebtoken');

const DEFAULT_DISCOUNT_LIMIT_PCT = 10;
const MAX_DISCOUNT_LIMIT_PCT = 100;

function clampPercent(value, fallback = DEFAULT_DISCOUNT_LIMIT_PCT) {
  const parsed = parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed <= 0) return 0;
  if (parsed >= MAX_DISCOUNT_LIMIT_PCT) return MAX_DISCOUNT_LIMIT_PCT;
  return Math.round(parsed * 100) / 100;
}

function normalizePermissions(raw = {}, role = 'user') {
  const permissions = { ...(raw || {}) };
  permissions.discount_limit_pct = role === 'admin'
    ? MAX_DISCOUNT_LIMIT_PCT
    : clampPercent(permissions.discount_limit_pct);
  permissions.can_authorize_discount = role === 'admin'
    ? true
    : !!permissions.can_authorize_discount;
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
