import { randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { API_ERROR_CODES, CSRF_COOKIE_NAME } from '@torbook/shared';
import { AppError } from '../utils/app-error.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function issueCsrfToken(_req: Request, res: Response) {
  const token = randomBytes(32).toString('hex');
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
  res.json({ success: true, data: { csrfToken: token } });
}

export function validateCsrf(req: Request, _res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME] as string | undefined;
  const headerToken = req.headers['x-csrf-token'] as string | undefined;

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    next(new AppError(403, API_ERROR_CODES.INVALID_CSRF, 'אסימון CSRF לא תקין'));
    return;
  }

  next();
}
