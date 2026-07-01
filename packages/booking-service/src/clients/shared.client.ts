import { internalPost } from '@torbook/shared/server/http-client';

function getBaseUrl(): string {
  const url = process.env.SHARED_SERVICE_URL?.trim();
  if (!url) {
    throw new Error('SHARED_SERVICE_URL is required');
  }
  return url;
}

export async function encryptPii(plaintext: string): Promise<string> {
  const data = await internalPost<{ ciphertext: string }>(getBaseUrl(), '/crypto/encrypt', { plaintext });
  return data.ciphertext;
}

export async function decryptPii(ciphertext: string): Promise<string> {
  const data = await internalPost<{ plaintext: string }>(getBaseUrl(), '/crypto/decrypt', { ciphertext });
  return data.plaintext;
}

export async function hashPii(value: string): Promise<string> {
  const data = await internalPost<{ hash: string }>(getBaseUrl(), '/crypto/hash', { value });
  return data.hash;
}

export async function normalizePhone(phone: string): Promise<string> {
  const data = await internalPost<{ normalized: string }>(getBaseUrl(), '/normalize/phone', { phone });
  return data.normalized;
}

export async function normalizeEmail(email: string): Promise<string> {
  const data = await internalPost<{ normalized: string }>(getBaseUrl(), '/normalize/email', { email });
  return data.normalized;
}

export const sharedClient = {
  encryptPii,
  decryptPii,
  hashPii,
  normalizePhone,
  normalizeEmail,
};
