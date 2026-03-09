'use strict';

const db = require('../database/db');

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizePhone(phone) {
  const digits = onlyDigits(phone);
  if (!digits) return '';
  return digits.length > 11 ? digits.slice(-11) : digits;
}

async function findClientByDocument(document, excludeId = null) {
  const normalized = onlyDigits(document);
  if (!normalized) return null;

  const params = [normalized];
  let query = `
    SELECT *, 'document' AS match_field
      FROM clients
     WHERE active=true
       AND regexp_replace(COALESCE(document,''), '[^0-9]', '', 'g') = $1
  `;

  if (excludeId != null) {
    params.push(excludeId);
    query += ` AND id <> $${params.length}`;
  }

  query += ' ORDER BY id LIMIT 1';
  const result = await db.query(query, params);
  return result.rows[0] || null;
}

async function findClientByPhone(phone, excludeId = null) {
  const normalized = normalizePhone(phone);
  if (!normalized || normalized.length < 8) return null;

  const params = [`%${normalized}`];
  let query = `
    SELECT *, 'phone' AS match_field
      FROM clients
     WHERE active=true
       AND regexp_replace(COALESCE(phone,''), '[^0-9]', '', 'g') LIKE $1
  `;

  if (excludeId != null) {
    params.push(excludeId);
    query += ` AND id <> $${params.length}`;
  }

  query += ' ORDER BY id LIMIT 1';
  const result = await db.query(query, params);
  return result.rows[0] || null;
}

async function findDuplicateClient({ document, phone, excludeId = null }) {
  const byDocument = await findClientByDocument(document, excludeId);
  if (byDocument) return byDocument;
  return findClientByPhone(phone, excludeId);
}

async function ensureClientTypeForSales(client) {
  if (!client) return null;
  if (client.type !== 'supplier') return client;

  const result = await db.query(
    "UPDATE clients SET type='both', updated_at=NOW() WHERE id=$1 RETURNING *",
    [client.id]
  );

  return result.rows[0] || { ...client, type: 'both' };
}

function duplicateClientError(client) {
  const label = client?.match_field === 'document' ? 'CPF/CNPJ' : 'telefone';
  const name = client?.name || 'cliente existente';
  return `J\u00e1 existe um cadastro com este ${label}: ${name}.`;
}

module.exports = {
  findDuplicateClient,
  ensureClientTypeForSales,
  duplicateClientError,
};