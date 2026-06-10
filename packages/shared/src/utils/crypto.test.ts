import { beforeEach, describe, expect, it } from 'vitest';
import {
  decryptPii,
  encryptPii,
  hashPii,
  normalizeEmail,
  normalizePhone,
} from './crypto.js';

beforeEach(() => {
  process.env.AES_ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-xx';
});

describe('crypto', () => {
  it('encrypts and decrypts PII', () => {
    const plaintext = 'michal@example.com';
    const encrypted = encryptPii(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(decryptPii(encrypted)).toBe(plaintext);
  });

  it('produces stable hashes for normalized values', () => {
    expect(hashPii(normalizeEmail('  Michal@Example.COM '))).toBe(
      hashPii(normalizeEmail('michal@example.com')),
    );
    expect(hashPii(normalizePhone('052-123-4567'))).toBe(hashPii(normalizePhone('0521234567')));
  });
});
