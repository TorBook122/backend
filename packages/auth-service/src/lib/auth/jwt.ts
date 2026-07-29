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
  hasPhone: boolean;
  type: 'access';
};

export type RefreshTokenPayload = {
  sub: string;
  type: 'refresh';
  jti: string;
};

const MIN_SECRET_BYTES = 32;
const JWT_ALGORITHM = 'HS256' as const;

function assertStrongSecret(secret: string, name: string): void {
  if (Buffer.byteLength(secret, 'utf8') < MIN_SECRET_BYTES) {
    throw new Error(`${name} must be at least ${MIN_SECRET_BYTES} bytes (e.g. \`openssl rand -hex 32\`)`);
  }
}

function getAccessSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error('JWT_ACCESS_SECRET is required');
  assertStrongSecret(secret, 'JWT_ACCESS_SECRET');
  return secret;
}

function getRefreshSecret(): string {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) throw new Error('JWT_REFRESH_SECRET is required');
  assertStrongSecret(secret, 'JWT_REFRESH_SECRET');
  return secret;
}

export function signAccessToken(
  userId: string,
  role: string,
  onboardingCompletedAt: string | null = null,
  hasPhone = true,
): string {
  const payload: AccessTokenPayload = {
    sub: userId,
    role,
    onboardingCompletedAt,
    hasPhone,
    type: 'access',
  };
  return jwt.sign(payload, getAccessSecret(), {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    algorithm: JWT_ALGORITHM,
  });
}

export function signRefreshToken(userId: string, jti: string, rememberMe = false): string {
  const payload: RefreshTokenPayload = { sub: userId, type: 'refresh', jti };
  const expiresIn = rememberMe ? REFRESH_TOKEN_REMEMBER_TTL_SECONDS : REFRESH_TOKEN_TTL_SECONDS;
  return jwt.sign(payload, getRefreshSecret(), { expiresIn, algorithm: JWT_ALGORITHM });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  // Explicitly pin the algorithm so a token signed (or forged) with `alg: none` or an
  // unexpected algorithm is always rejected, regardless of library defaults.
  const payload = jwt.verify(token, getAccessSecret(), { algorithms: [JWT_ALGORITHM] }) as AccessTokenPayload;
  if (payload.type !== 'access') throw new Error('Invalid token type');
  return payload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const payload = jwt.verify(token, getRefreshSecret(), { algorithms: [JWT_ALGORITHM] }) as RefreshTokenPayload;
  if (payload.type !== 'refresh') throw new Error('Invalid token type');
  return payload;
}

export function getRefreshTtlSeconds(rememberMe = false): number {
  return rememberMe ? REFRESH_TOKEN_REMEMBER_TTL_SECONDS : REFRESH_TOKEN_TTL_SECONDS;
}
