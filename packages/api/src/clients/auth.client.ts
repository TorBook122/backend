import {
  REFRESH_TOKEN_REMEMBER_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from '@torbook/shared';
import { internalPost } from './internal-http.js';

export type AccessTokenPayload = {
  sub: string;
  role: string;
  onboardingCompletedAt: string | null;
  type?: 'access';
};

function getBaseUrl(): string {
  const url = process.env.AUTH_SERVICE_URL?.trim();
  if (!url) {
    throw new Error('AUTH_SERVICE_URL is required');
  }
  return url;
}

export async function signAccessToken(
  sub: string,
  role: string,
  onboardingCompletedAt: string | null = null,
): Promise<string> {
  const data = await internalPost<{ accessToken: string }>(getBaseUrl(), '/tokens/access', {
    sub,
    role,
    onboardingCompletedAt,
  });
  return data.accessToken;
}

export async function issueRefreshToken(sub: string, rememberMe = false): Promise<string> {
  const data = await internalPost<{ refreshToken: string }>(getBaseUrl(), '/tokens/refresh', {
    sub,
    rememberMe,
  });
  return data.refreshToken;
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  return internalPost<AccessTokenPayload>(getBaseUrl(), '/tokens/access/verify', { token });
}

export async function verifyRefreshToken(
  token: string,
): Promise<AccessTokenPayload & { jti: string; valid: boolean }> {
  return internalPost(getBaseUrl(), '/tokens/refresh/verify', { token });
}

export async function revokeRefreshToken(input: { jti?: string; token?: string }): Promise<void> {
  await internalPost(getBaseUrl(), '/tokens/refresh/revoke', input);
}

export async function hashPassword(password: string): Promise<string> {
  const data = await internalPost<{ hash: string }>(getBaseUrl(), '/password/hash', { password });
  return data.hash;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const data = await internalPost<{ valid: boolean }>(getBaseUrl(), '/password/verify', { password, hash });
  return data.valid;
}

export function getRefreshTtlSeconds(rememberMe = false): number {
  return rememberMe ? REFRESH_TOKEN_REMEMBER_TTL_SECONDS : REFRESH_TOKEN_TTL_SECONDS;
}

export const authClient = {
  signAccessToken,
  issueRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  revokeRefreshToken,
  hashPassword,
  verifyPassword,
  getRefreshTtlSeconds,
};
