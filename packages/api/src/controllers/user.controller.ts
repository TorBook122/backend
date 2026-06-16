import type { Request, Response } from 'express';
import { API_ERROR_CODES } from '@torbook/shared';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import * as userService from '../services/user.service.js';
import { AppError } from '../utils/app-error.js';
import { deleteAccountSchema, gdprDeleteSchema } from '../validators/user.validator.js';

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
