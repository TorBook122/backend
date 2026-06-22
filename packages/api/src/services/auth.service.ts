import type { Response } from 'express';
import {
  API_ERROR_CODES,
  REFRESH_COOKIE_NAME,
  type AuthTokens,
  type AuthUser,
} from '@torbook/shared';
import { authClient } from '../clients/auth.client.js';
import { dbClient } from '../clients/db.client.js';
import { sharedClient } from '../clients/shared.client.js';
import { AppError } from '../utils/app-error.js';
import { crossSiteCookieOptions } from '../utils/cookie-options.js';
import type { LoginBody, RegisterBody } from '../validators/auth.validator.js';

function toAuthUser(user: {
  id: string;
  name: string;
  role: string;
  onboardingCompletedAt: Date | string | null;
}): AuthUser {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    onboardingCompletedAt: user.onboardingCompletedAt
      ? new Date(user.onboardingCompletedAt).toISOString()
      : null,
  };
}

const refreshCookieOptions = {
  ...crossSiteCookieOptions(),
  path: '/api/v1/auth',
};

function setRefreshCookie(res: Response, token: string, rememberMe: boolean) {
  const maxAge = authClient.getRefreshTtlSeconds(rememberMe) * 1000;
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    ...refreshCookieOptions,
    maxAge,
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions);
}

export async function registerUser(input: RegisterBody, res: Response): Promise<AuthTokens> {
  const phoneHash = await sharedClient.hashPii(await sharedClient.normalizePhone(input.phone));
  const emailHash = input.email
    ? await sharedClient.hashPii(await sharedClient.normalizeEmail(input.email))
    : null;

  const existingPhone = await dbClient.users.findByPhoneHash(phoneHash);
  if (existingPhone) {
    throw new AppError(409, API_ERROR_CODES.DUPLICATE_PHONE, 'מספר טלפון כבר רשום. נסה להתחבר.');
  }

  if (emailHash) {
    const existingEmail = await dbClient.users.findByEmailHash(emailHash);
    if (existingEmail) {
      throw new AppError(409, API_ERROR_CODES.DUPLICATE_EMAIL, 'אימייל כבר רשום. נסה להתחבר.');
    }
  }

  const passwordHash = await authClient.hashPassword(input.password);
  const normalizedPhone = await sharedClient.normalizePhone(input.phone);
  const normalizedEmail = input.email ? await sharedClient.normalizeEmail(input.email) : null;

  const user = await dbClient.users.create({
    name: input.name,
    phoneEnc: await sharedClient.encryptPii(normalizedPhone),
    phoneHash,
    emailEnc: normalizedEmail ? await sharedClient.encryptPii(normalizedEmail) : null,
    emailHash,
    passwordHash,
    role: input.role,
  });

  const accessToken = await authClient.signAccessToken(
    user.id,
    user.role,
    user.onboardingCompletedAt ? new Date(user.onboardingCompletedAt).toISOString() : null,
  );
  const refreshToken = await authClient.issueRefreshToken(user.id, false);
  setRefreshCookie(res, refreshToken, false);

  return { accessToken, user: toAuthUser(user) };
}

export async function loginUser(
  input: LoginBody,
  res: Response,
): Promise<AuthTokens> {
  const isEmail = input.identifier.includes('@');
  const lookupHash = isEmail
    ? await sharedClient.hashPii(await sharedClient.normalizeEmail(input.identifier))
    : await sharedClient.hashPii(await sharedClient.normalizePhone(input.identifier));

  const user = await dbClient.users.lookup(isEmail, lookupHash);

  if (!user || user.deletedAt) {
    throw new AppError(401, API_ERROR_CODES.INVALID_CREDENTIALS, 'אימייל או סיסמה שגויים');
  }

  const valid = await authClient.verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    throw new AppError(401, API_ERROR_CODES.INVALID_CREDENTIALS, 'אימייל או סיסמה שגויים');
  }

  const accessToken = await authClient.signAccessToken(
    user.id,
    user.role,
    user.onboardingCompletedAt ? new Date(user.onboardingCompletedAt).toISOString() : null,
  );
  const refreshToken = await authClient.issueRefreshToken(user.id, input.rememberMe);
  setRefreshCookie(res, refreshToken, input.rememberMe);

  return { accessToken, user: toAuthUser(user) };
}

export async function refreshSession(refreshToken: string, res: Response): Promise<AuthTokens> {
  let payload;
  try {
    payload = await authClient.verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError(401, API_ERROR_CODES.UNAUTHORIZED, 'סשן פג תוקף');
  }

  if (!payload.valid) {
    throw new AppError(401, API_ERROR_CODES.UNAUTHORIZED, 'סשן פג תוקף');
  }

  const user = await dbClient.users.findById(payload.sub);
  if (!user || user.deletedAt) {
    throw new AppError(401, API_ERROR_CODES.UNAUTHORIZED, 'משתמש לא נמצא');
  }

  await authClient.revokeRefreshToken({ jti: payload.jti });

  const accessToken = await authClient.signAccessToken(
    user.id,
    user.role,
    user.onboardingCompletedAt ? new Date(user.onboardingCompletedAt).toISOString() : null,
  );
  const newRefreshToken = await authClient.issueRefreshToken(user.id, false);
  setRefreshCookie(res, newRefreshToken, false);

  return { accessToken, user: toAuthUser(user) };
}

export async function logoutUser(refreshToken: string | undefined, res: Response): Promise<void> {
  if (refreshToken) {
    await authClient.revokeRefreshToken({ token: refreshToken });
  }
  clearRefreshCookie(res);
}
