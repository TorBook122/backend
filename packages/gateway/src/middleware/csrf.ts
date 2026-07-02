import { randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { API_ERROR_CODES, CSRF_COOKIE_NAME } from '@torbook/shared';
import { getRedis } from '../lib/redis.js';
import { AppError } from '../utils/app-error.js';
import { crossSiteCookieOptions } from '../utils/cookie-options.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_REDIS_PREFIX = 'csrf:';
const CSRF_TTL_SECONDS = 60 * 60;

export async function issueCsrfToken(_req: Request, res: Response) {
  const token = randomBytes(32).toString('hex');
  await getRedis().set(`${CSRF_REDIS_PREFIX}${token}`, '1', 'EX', CSRF_TTL_SECONDS);
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    ...crossSiteCookieOptions(),
    path: '/',
  });
  res.json({ success: true, data: { csrfToken: token } });
}

export async function validateCsrf(req: Request, _res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME] as string | undefined;
  const headerToken = req.headers['x-csrf-token'] as string | undefined;

  if (!headerToken) {
    next(new AppError(403, API_ERROR_CODES.INVALID_CSRF, 'אסימון CSRF לא תקין'));
    return;
  }

  if (cookieToken && cookieToken === headerToken) {
    next();
    return;
  }

  const known = await getRedis().exists(`${CSRF_REDIS_PREFIX}${headerToken}`);
  if (known) {
    next();
    return;
  }

  next(new AppError(403, API_ERROR_CODES.INVALID_CSRF, 'אסימון CSRF לא תקין'));
}
