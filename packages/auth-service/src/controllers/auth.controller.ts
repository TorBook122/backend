import type { Request, Response } from 'express';
import { API_ERROR_CODES, REFRESH_COOKIE_NAME } from '@torbook/shared';
import {
  clearLoginFailures,
  recordForgotPasswordRequest,
  recordLoginFailure,
  recordResetPasswordFailure,
} from '../middleware/rate-limiter.js';
import {
  activateEmployee,
  forgotPassword,
  loginUser,
  logoutUser,
  googleAuthUser,
  refreshSession,
  registerUser,
  resetPassword,
  validateEmployeeInvite,
} from '../services/auth.service.js';
import { AppError } from '../utils/app-error.js';
import {
  activateEmployeeSchema,
  forgotPasswordSchema,
  googleAuthSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '../validators/auth.validator.js';

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

export async function google(req: Request, res: Response) {
  const parsed = googleAuthSchema.safeParse(req.body);
  if (!parsed.success) {
    const message = parsed.error.errors[0]?.message ?? 'נתונים לא תקינים';
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, message);
  }

  const tokens = await googleAuthUser(parsed.data, res);
  (req as Request & { userId?: string }).userId = tokens.user.id;
  res.json({ success: true, data: tokens });
}

export async function employeeInvite(req: Request, res: Response) {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const data = await validateEmployeeInvite(token);
  res.json({ success: true, data });
}

export async function activateEmployeeAccount(req: Request, res: Response) {
  const parsed = activateEmployeeSchema.safeParse(req.body);
  if (!parsed.success) {
    const message = parsed.error.errors[0]?.message ?? 'נתונים לא תקינים';
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, message);
  }

  const tokens = await activateEmployee(parsed.data, res);
  (req as Request & { userId?: string }).userId = tokens.user.id;
  res.json({ success: true, data: tokens });
}

export async function forgotPasswordHandler(req: Request, res: Response) {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    const message = parsed.error.errors[0]?.message ?? 'נתונים לא תקינים';
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, message);
  }

  await recordForgotPasswordRequest(req);
  await forgotPassword(parsed.data);
  res.json({ success: true, data: { sent: true } });
}

export async function resetPasswordHandler(req: Request, res: Response) {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    const message = parsed.error.errors[0]?.message ?? 'נתונים לא תקינים';
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, message);
  }

  try {
    await resetPassword(parsed.data);
    res.json({ success: true, data: { reset: true } });
  } catch (error) {
    if (
      error instanceof AppError &&
      error.statusCode === 400 &&
      error.code === API_ERROR_CODES.INVALID_RESET_CODE
    ) {
      await recordResetPasswordFailure(req);
    }
    throw error;
  }
}
