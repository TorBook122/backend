import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { prisma } from '@torbook/db';
import {
  getRefreshTtlSeconds,
  hashPassword,
  signAccessToken,
  signRefreshToken,
  verifyPassword,
  verifyRefreshToken,
} from '@torbook/auth';
import {
  API_ERROR_CODES,
  REFRESH_COOKIE_NAME,
  encryptPii,
  hashPii,
  normalizeEmail,
  normalizePhone,
  type AuthTokens,
  type AuthUser,
} from '@torbook/shared';
import { getRedis } from '../lib/redis.js';
import { AppError } from '../utils/app-error.js';
import type { LoginBody, RegisterBody } from '../validators/auth.validator.js';

function toAuthUser(user: {
  id: string;
  name: string;
  role: string;
  onboardingCompletedAt: Date | null;
}): AuthUser {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    onboardingCompletedAt: user.onboardingCompletedAt?.toISOString() ?? null,
  };
}

function setRefreshCookie(res: Response, token: string, rememberMe: boolean) {
  const maxAge = getRefreshTtlSeconds(rememberMe) * 1000;
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/v1/auth',
    maxAge,
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/v1/auth' });
}

async function storeRefreshToken(userId: string, jti: string, rememberMe: boolean) {
  const ttl = getRefreshTtlSeconds(rememberMe);
  await getRedis().set(`refresh:${jti}`, userId, 'EX', ttl);
}

async function revokeRefreshToken(jti: string) {
  await getRedis().del(`refresh:${jti}`);
}

async function isRefreshTokenValid(jti: string, userId: string): Promise<boolean> {
  const stored = await getRedis().get(`refresh:${jti}`);
  return stored === userId;
}

export async function registerUser(input: RegisterBody, res: Response): Promise<AuthTokens> {
  const phoneHash = hashPii(normalizePhone(input.phone));
  const emailHash = input.email ? hashPii(normalizeEmail(input.email)) : null;

  const existingPhone = await prisma.user.findUnique({ where: { phoneHash } });
  if (existingPhone) {
    throw new AppError(409, API_ERROR_CODES.DUPLICATE_PHONE, 'מספר טלפון כבר רשום. נסה להתחבר.');
  }

  if (emailHash) {
    const existingEmail = await prisma.user.findUnique({ where: { emailHash } });
    if (existingEmail) {
      throw new AppError(409, API_ERROR_CODES.DUPLICATE_EMAIL, 'אימייל כבר רשום. נסה להתחבר.');
    }
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      name: input.name,
      phoneEnc: encryptPii(normalizePhone(input.phone)),
      phoneHash,
      emailEnc: input.email ? encryptPii(normalizeEmail(input.email)) : null,
      emailHash,
      passwordHash,
      role: input.role,
    },
  });

  const accessToken = signAccessToken(
    user.id,
    user.role,
    user.onboardingCompletedAt?.toISOString() ?? null,
  );
  const jti = randomUUID();
  const refreshToken = signRefreshToken(user.id, jti, false);
  await storeRefreshToken(user.id, jti, false);
  setRefreshCookie(res, refreshToken, false);

  return { accessToken, user: toAuthUser(user) };
}

export async function loginUser(
  input: LoginBody,
  res: Response,
): Promise<AuthTokens> {
  const isEmail = input.identifier.includes('@');
  const lookupHash = isEmail
    ? hashPii(normalizeEmail(input.identifier))
    : hashPii(normalizePhone(input.identifier));

  const user = await prisma.user.findFirst({
    where: isEmail ? { emailHash: lookupHash } : { phoneHash: lookupHash },
  });

  if (!user || user.deletedAt) {
    throw new AppError(401, API_ERROR_CODES.INVALID_CREDENTIALS, 'אימייל או סיסמה שגויים');
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    throw new AppError(401, API_ERROR_CODES.INVALID_CREDENTIALS, 'אימייל או סיסמה שגויים');
  }

  const accessToken = signAccessToken(
    user.id,
    user.role,
    user.onboardingCompletedAt?.toISOString() ?? null,
  );
  const jti = randomUUID();
  const refreshToken = signRefreshToken(user.id, jti, input.rememberMe);
  await storeRefreshToken(user.id, jti, input.rememberMe);
  setRefreshCookie(res, refreshToken, input.rememberMe);

  return { accessToken, user: toAuthUser(user) };
}

export async function refreshSession(refreshToken: string, res: Response): Promise<AuthTokens> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError(401, API_ERROR_CODES.UNAUTHORIZED, 'סשן פג תוקף');
  }

  const valid = await isRefreshTokenValid(payload.jti, payload.sub);
  if (!valid) {
    throw new AppError(401, API_ERROR_CODES.UNAUTHORIZED, 'סשן פג תוקף');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.deletedAt) {
    throw new AppError(401, API_ERROR_CODES.UNAUTHORIZED, 'משתמש לא נמצא');
  }

  await revokeRefreshToken(payload.jti);

  const accessToken = signAccessToken(
    user.id,
    user.role,
    user.onboardingCompletedAt?.toISOString() ?? null,
  );
  const jti = randomUUID();
  const newRefreshToken = signRefreshToken(user.id, jti, false);
  await storeRefreshToken(user.id, jti, false);
  setRefreshCookie(res, newRefreshToken, false);

  return { accessToken, user: toAuthUser(user) };
}

export async function logoutUser(refreshToken: string | undefined, res: Response): Promise<void> {
  if (refreshToken) {
    try {
      const payload = verifyRefreshToken(refreshToken);
      await revokeRefreshToken(payload.jti);
    } catch {
      // ignore invalid tokens on logout
    }
  }
  clearRefreshCookie(res);
}

