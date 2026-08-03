import type { Response } from 'express';
import { ACCESS_COOKIE_NAME, ACCESS_TOKEN_TTL_SECONDS } from '@torbook/shared';
import { signAccessToken } from '../lib/auth/jwt.js';
import { crossSiteCookieOptions } from './cookie-options.js';

const accessCookieOptions = {
  ...crossSiteCookieOptions(),
  path: '/',
};

type AccessTokenUser = {
  id: string;
  role: string;
  onboardingCompletedAt: Date | null;
  phoneHash: string | null;
};

export function setAccessCookie(res: Response, user: AccessTokenUser): void {
  const token = signAccessToken(
    user.id,
    user.role,
    user.onboardingCompletedAt?.toISOString() ?? null,
    !!user.phoneHash,
  );
  res.cookie(ACCESS_COOKIE_NAME, token, {
    httpOnly: true,
    maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000,
    ...accessCookieOptions,
  });
}

export function clearAccessCookie(res: Response): void {
  res.clearCookie(ACCESS_COOKIE_NAME, accessCookieOptions);
}
