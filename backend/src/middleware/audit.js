'use strict';
const db = require('../database/db');

function resolveIp(req) {
  const forwarded = req?.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req?.ip || req?.socket?.remoteAddress || null;
}

function serializeAuditValue(value) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializeAuditValue);
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value * 10000) / 10000 : null;
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, entry]) => [key, serializeAuditValue(entry)])
        .filter(([, entry]) => entry !== undefined)
    );
  }
  return value;
}

function buildChanges(before = {}, after = {}, fields = []) {
  const changes = {};
  for (const field of fields) {
    const previousValue = serializeAuditValue(before?.[field]);
    const nextValue = serializeAuditValue(after?.[field]);
    if (JSON.stringify(previousValue) !== JSON.stringify(nextValue)) {
      changes[field] = { before: previousValue, after: nextValue };
    }
  }
  return changes;
}

async function writeAudit(req, entry, client = db) {
  if (!entry?.action || !entry?.module) return;

  const actor = entry.user || req?.user || null;
  const rawTargetId = entry.targetId;
  const parsedTargetId = rawTargetId === undefined || rawTargetId === null || rawTargetId === ''
    ? null
    : Number.parseInt(rawTargetId, 10);

  await client.query(
    `INSERT INTO audit_logs
      (user_id, actor_name, actor_role, action, module, target_type, target_id, request_path, method, ip, details, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,NOW())`,
    [
      actor?.id || null,
      actor?.name || null,
      actor?.role || null,
      entry.action,
      entry.module,
      entry.targetType || null,
      Number.isFinite(parsedTargetId) ? parsedTargetId : null,
      req?.originalUrl || req?.path || null,
      req?.method || null,
      resolveIp(req),
      JSON.stringify(serializeAuditValue(entry.details || {})),
    ]
  );
}

async function safeAudit(req, entry, client = db) {
  try {
    await writeAudit(req, entry, client);
  } catch (error) {
    console.warn('Audit warn:', error.message.substring(0, 120));
  }
}

const audit = (action, module, buildDetails) => async (req, res, next) => {
  const original = res.json.bind(res);
  res.json = function auditResponse(body) {
    if (res.statusCode < 400) {
      const details = typeof buildDetails === 'function' ? buildDetails(req, body, res) : (buildDetails || {});
      safeAudit(req, {
        action,
        module,
        targetId: req.params.id || body?.id || null,
        targetType: details?.targetType || null,
        details,
      });
    }
    return original(body);
  };
  next();
};

module.exports = { audit, buildChanges, safeAudit, serializeAuditValue, writeAudit };