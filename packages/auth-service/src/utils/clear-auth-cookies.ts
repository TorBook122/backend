import type { Response } from 'express';
import { REFRESH_COOKIE_NAME } from '@torbook/shared';
import { clearAccessCookie } from './access-cookie.js';
import { crossSiteCookieOptions } from './cookie-options.js';

const refreshCookieOptions = {
  ...crossSiteCookieOptions(),
  path: '/api/v1/auth',
};

export function clearAuthCookies(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions);
  clearAccessCookie(res);
}
