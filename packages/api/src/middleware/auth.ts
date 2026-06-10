import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '@torbook/auth';
import { API_ERROR_CODES, UserRole } from '@torbook/shared';
import { AppError } from '../utils/app-error.js';

export type AuthenticatedRequest = Request & {
  userId: string;
  userRole: string;
};

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(new AppError(401, API_ERROR_CODES.UNAUTHORIZED, 'נדרשת התחברות'));
    return;
  }

  try {
    const token = header.slice(7);
    const payload = verifyAccessToken(token);
    (req as AuthenticatedRequest).userId = payload.sub;
    (req as AuthenticatedRequest).userRole = payload.role;
    next();
  } catch {
    next(new AppError(401, API_ERROR_CODES.UNAUTHORIZED, 'סשן פג תוקף'));
  }
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
