import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const hex = process.env.AES_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('AES_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

function getHashSecret(): string {
  // Prefer a dedicated secret so PII lookup hashes can be rotated independently of the
  // JWT signing key. Falls back to JWT_ACCESS_SECRET only for backward compatibility with
  // hashes already stored in the database — never to a hardcoded/public default, since that
  // would make emailHash/phoneHash brute-forceable by anyone who reads this source file.
  const secret = process.env.PII_HASH_SECRET ?? process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error('PII_HASH_SECRET (or JWT_ACCESS_SECRET) is required to hash PII lookup values');
  }
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('PII_HASH_SECRET (or JWT_ACCESS_SECRET) must be at least 32 bytes');
  }
  return secret;
}

export function encryptPii(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decryptPii(ciphertext: string): string {
  const key = getEncryptionKey();
  const data = Buffer.from(ciphertext, 'base64');
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function tryDecryptPii(ciphertext: string | null | undefined): string | null {
  if (!ciphertext) return null;
  try {
    const data = Buffer.from(ciphertext, 'base64');
    if (data.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) return null;
    return decryptPii(ciphertext);
  } catch {
    return null;
  }
}

export function hashPii(value: string): string {
  return createHmac('sha256', getHashSecret()).update(value.trim().toLowerCase()).digest('hex');
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
