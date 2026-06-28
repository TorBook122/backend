import jwt from 'jsonwebtoken';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_REMEMBER_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from '@torbook/shared';

export type AccessTokenPayload = {
  sub: string;
  role: string;
  onboardingCompletedAt: string | null;
  type: 'access';
};

export type RefreshTokenPayload = {
  sub: string;
  type: 'refresh';
  jti: string;
};

function getAccessSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error('JWT_ACCESS_SECRET is required');
  return secret;
}

function getRefreshSecret(): string {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) throw new Error('JWT_REFRESH_SECRET is required');
  return secret;
}

export function signAccessToken(
  userId: string,
  role: string,
  onboardingCompletedAt: string | null = null,
): string {
  const payload: AccessTokenPayload = {
    sub: userId,
    role,
    onboardingCompletedAt,
    type: 'access',
  };
  return jwt.sign(payload, getAccessSecret(), { expiresIn: ACCESS_TOKEN_TTL_SECONDS });
}

export function signRefreshToken(userId: string, jti: string, rememberMe = false): string {
  const payload: RefreshTokenPayload = { sub: userId, type: 'refresh', jti };
  const expiresIn = rememberMe ? REFRESH_TOKEN_REMEMBER_TTL_SECONDS : REFRESH_TOKEN_TTL_SECONDS;
  return jwt.sign(payload, getRefreshSecret(), { expiresIn });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, getAccessSecret()) as AccessTokenPayload;
  if (payload.type !== 'access') throw new Error('Invalid token type');
  return payload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const payload = jwt.verify(token, getRefreshSecret()) as RefreshTokenPayload;
  if (payload.type !== 'refresh') throw new Error('Invalid token type');
  return payload;
}

export function getRefreshTtlSeconds(rememberMe = false): number {
  return rememberMe ? REFRESH_TOKEN_REMEMBER_TTL_SECONDS : REFRESH_TOKEN_TTL_SECONDS;
}
