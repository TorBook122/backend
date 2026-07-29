import type { Request, Response } from 'express';
import { API_ERROR_CODES } from '@torbook/shared';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import * as userService from '../services/user.service.js';
import { AppError } from '../utils/app-error.js';
import { deleteAccountSchema, gdprDeleteSchema, completePhoneSchema, updateProfileSchema, requestPasswordChangeSchema, confirmPasswordChangeSchema } from '../validators/user.validator.js';
import { recordForgotPasswordRequest, recordResetPasswordFailure } from '../middleware/rate-limiter.js';

export async function getMe(req: Request, res: Response) {
  const { userId } = req as AuthenticatedRequest;
  const profile = await userService.getProfile(userId);
  res.json({ success: true, data: profile });
}

export async function deleteAccount(req: Request, res: Response) {
  const { userId } = req as AuthenticatedRequest;
  const parsed = deleteAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    const message = parsed.error.errors[0]?.message ?? 'נתונים לא תקינים';
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, message);
  }

  const result = await userService.deleteAccount(userId, parsed.data.password);
  res.json({ success: true, data: result });
}

export async function gdprDelete(req: Request, res: Response) {
  const { userId } = req as AuthenticatedRequest;
  const parsed = gdprDeleteSchema.safeParse(req.body);
  if (!parsed.success) {
    const message = parsed.error.errors[0]?.message ?? 'נתונים לא תקינים';
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, message);
  }

  const result = await userService.gdprDelete(userId, parsed.data.password);
  res.json({ success: true, data: result });
}

export async function completePhone(req: Request, res: Response) {
  const { userId } = req as AuthenticatedRequest;
  const parsed = completePhoneSchema.safeParse(req.body);
  if (!parsed.success) {
    const message = parsed.error.errors[0]?.message ?? 'נתונים לא תקינים';
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, message);
  }

  const result = await userService.completePhone(userId, parsed.data.phone);
  res.json({ success: true, data: result });
}

export async function updateProfile(req: Request, res: Response) {
  const { userId } = req as AuthenticatedRequest;
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    const message = parsed.error.errors[0]?.message ?? 'נתונים לא תקינים';
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, message);
  }

  const result = await userService.updateProfile(userId, parsed.data);
  res.json({ success: true, data: result });
}

export async function requestPasswordChange(req: Request, res: Response) {
  const { userId } = req as AuthenticatedRequest;
  const parsed = requestPasswordChangeSchema.safeParse(req.body);
  if (!parsed.success) {
    const message = parsed.error.errors[0]?.message ?? 'נתונים לא תקינים';
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, message);
  }

  await recordForgotPasswordRequest(req);
  const result = await userService.requestPasswordChange(userId, parsed.data);
  res.json({ success: true, data: result });
}

export async function confirmPasswordChange(req: Request, res: Response) {
  const { userId } = req as AuthenticatedRequest;
  const parsed = confirmPasswordChangeSchema.safeParse(req.body);
  if (!parsed.success) {
    const message = parsed.error.errors[0]?.message ?? 'נתונים לא תקינים';
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, message);
  }

  try {
    const result = await userService.confirmPasswordChange(userId, parsed.data);
    res.json({ success: true, data: result });
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
