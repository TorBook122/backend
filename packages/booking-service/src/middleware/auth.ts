import type { NextFunction, Request, Response } from 'express';
import { API_ERROR_CODES, UserRole } from '@torbook/shared';
import { AppError } from '../utils/app-error.js';

export type AuthenticatedRequest = Request & {
  userId: string;
  userRole: string;
};

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const expectedSecret = process.env.INTERNAL_SERVICE_SECRET;
  const secret = headerValue(req.headers['x-internal-secret']);

  if (!expectedSecret || secret !== expectedSecret) {
    next(new AppError(401, API_ERROR_CODES.UNAUTHORIZED, 'נדרשת התחברות'));
    return;
  }

  const userId = headerValue(req.headers['x-user-id']);
  const userRole = headerValue(req.headers['x-user-role']);

  if (!userId || !userRole) {
    next(new AppError(401, API_ERROR_CODES.UNAUTHORIZED, 'נדרשת התחברות'));
    return;
  }

  (req as AuthenticatedRequest).userId = userId;
  (req as AuthenticatedRequest).userRole = userRole;
  next();
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const expectedSecret = process.env.INTERNAL_SERVICE_SECRET;
  const secret = headerValue(req.headers['x-internal-secret']);
  const userId = headerValue(req.headers['x-user-id']);
  const userRole = headerValue(req.headers['x-user-role']);

  if (expectedSecret && secret === expectedSecret && userId && userRole) {
    (req as AuthenticatedRequest).userId = userId;
    (req as AuthenticatedRequest).userRole = userRole;
  }

  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const role = (req as AuthenticatedRequest).userRole;
    if (!roles.includes(role as UserRole)) {
      next(new AppError(403, API_ERROR_CODES.FORBIDDEN, 'אין הרשאה לפעולה זו'));
      return;
    }
    next();
  };
}
