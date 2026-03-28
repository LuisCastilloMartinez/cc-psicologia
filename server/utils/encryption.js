/* ╔══════════════════════════════════════════════════════╗
   ║  encryption.js — AES-256-GCM para datos sensibles   ║
   ║  Cumple: LFPDPPP, NOM-024, ISO 27001/27799          ║
   ╚══════════════════════════════════════════════════════╝ */

'use strict';

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;        // 128 bits
const TAG_LENGTH = 16;       // 128 bits
const KEY_LENGTH = 32;       // 256 bits
const SALT_LENGTH = 32;
const PBKDF2_ITERATIONS = 100000;

/**
 * Derive a 256-bit key from a passphrase using PBKDF2
 */
function deriveKey(passphrase, salt) {
  return crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha512');
}

/**
 * Encrypt plaintext using AES-256-GCM
 * Returns: base64 string containing salt + iv + tag + ciphertext
 */
function encrypt(plaintext, masterKey) {
  if (!plaintext || !masterKey) return null;

  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveKey(masterKey, salt);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Format: salt(32) + iv(16) + tag(16) + ciphertext
  const result = Buffer.concat([salt, iv, tag, encrypted]);
  return result.toString('base64');
}

/**
 * Decrypt AES-256-GCM ciphertext
 * Returns: plaintext string
 */
function decrypt(encryptedBase64, masterKey) {
  if (!encryptedBase64 || !masterKey) return null;

  try {
    const data = Buffer.from(encryptedBase64, 'base64');

    const salt = data.subarray(0, SALT_LENGTH);
    const iv = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = data.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const ciphertext = data.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

    const key = deriveKey(masterKey, salt);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch (err) {
    console.error('Decryption failed:', err.message);
    return null;
  }
}

/**
 * Hash a value for non-reversible storage (e.g., for search indexes)
 */
function hashValue(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

/**
 * Generate a secure random key for .env
 */
function generateEncryptionKey() {
  return crypto.randomBytes(KEY_LENGTH).toString('hex');
}

module.exports = { encrypt, decrypt, hashValue, generateEncryptionKey };
