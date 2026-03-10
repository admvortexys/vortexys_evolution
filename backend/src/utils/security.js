'use strict';

const crypto = require('crypto');

const ENCRYPTION_SECRET = process.env.DATA_ENCRYPTION_KEY || process.env.JWT_SECRET || '';
const ENCRYPTION_KEY = crypto.createHash('sha256').update(String(ENCRYPTION_SECRET)).digest();

function createOpaqueToken(size = 32) {
  return crypto.randomBytes(size).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function isTokenHash(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

function isEncryptedSecret(value) {
  return typeof value === 'string' && value.startsWith('v1:');
}

function encryptSecret(value) {
  if (value == null) return null;
  const plain = String(value);
  if (!plain) return null;
  if (isEncryptedSecret(plain)) return plain;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptSecret(value) {
  if (value == null) return null;
  if (!isEncryptedSecret(value)) return String(value);

  const [, ivHex, tagHex, encryptedHex] = String(value).split(':');
  if (!ivHex || !tagHex || !encryptedHex) return null;

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    ENCRYPTION_KEY,
    Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

module.exports = {
  createOpaqueToken,
  decryptSecret,
  encryptSecret,
  hashToken,
  isEncryptedSecret,
  isTokenHash,
};
