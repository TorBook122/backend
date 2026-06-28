import type { Request, Response } from 'express';
import { API_ERROR_CODES, REFRESH_COOKIE_NAME } from '@torbook/shared';
import {
  clearLoginFailures,
  recordLoginFailure,
} from '../middleware/rate-limiter.js';
import {
  loginUser,
  logoutUser,
  refreshSession,
  registerUser,
} from '../services/auth.service.js';
import { AppError } from '../utils/app-error.js';
import { loginSchema, registerSchema } from '../validators/auth.validator.js';

export async function register(req: Request, res: Response) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    const message = parsed.error.errors[0]?.message ?? 'נתונים לא תקינים';
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, message);
  }

  const tokens = await registerUser(parsed.data, res);
  (req as Request & { userId?: string }).userId = tokens.user.id;
  res.status(201).json({ success: true, data: tokens });
}

export async function login(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    const message = parsed.error.errors[0]?.message ?? 'נתונים לא תקינים';
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, message);
  }

  try {
    const tokens = await loginUser(parsed.data, res);
    await clearLoginFailures(req);
    (req as Request & { userId?: string }).userId = tokens.user.id;
    res.json({ success: true, data: tokens });
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 401) {
      await recordLoginFailure(req);
    }
    throw error;
  }
}

export async function refresh(req: Request, res: Response) {
  const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
  if (!refreshToken) {
    throw new AppError(401, API_ERROR_CODES.UNAUTHORIZED, 'לא מחובר');
  }

  const tokens = await refreshSession(refreshToken, res);
  res.json({ success: true, data: tokens });
}

export async function logout(req: Request, res: Response) {
  const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
  await logoutUser(refreshToken, res);
  res.json({ success: true, data: { loggedOut: true } });
}
