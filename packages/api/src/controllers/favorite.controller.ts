import type { Request, Response } from 'express';
import { API_ERROR_CODES } from '@torbook/shared';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { dbClient } from '../clients/db.client.js';
import {
  addFavorite,
  isFavorite,
  listFavorites,
  registerFcmToken,
  removeFavorite,
  removeFcmToken,
} from '../services/favorite.service.js';
import { AppError } from '../utils/app-error.js';
import { param } from '../utils/param.js';
import { fcmTokenSchema } from '../validators/user.validator.js';

function getUserId(req: Request): string {
  return (req as AuthenticatedRequest).userId;
}

export async function list(req: Request, res: Response) {
  const favorites = await listFavorites(getUserId(req));
  res.json({ success: true, data: favorites });
}

export async function add(req: Request, res: Response) {
  const { businessId } = req.body as { businessId?: string };
  if (!businessId) {
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, 'businessId נדרש');
  }
  const favorite = await addFavorite(getUserId(req), businessId);
  res.status(201).json({ success: true, data: favorite });
}

export async function remove(req: Request, res: Response) {
  await removeFavorite(getUserId(req), param(req.params.businessId));
  res.json({ success: true, data: { removed: true } });
}

export async function check(req: Request, res: Response) {
  const slug = param(req.params.slug);
  let business;
  try {
    business = await dbClient.businesses.findBySlug(slug);
  } catch {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'עסק לא נמצא');
  }
  const favorited = await isFavorite(getUserId(req), business.id);
  res.json({ success: true, data: { favorited } });
}

export async function saveFcmToken(req: Request, res: Response) {
  const parsed = fcmTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, 'טוקן לא תקין');
  }
  await registerFcmToken(getUserId(req), parsed.data.token);
  res.json({ success: true, data: { registered: true } });
}

export async function deleteFcmToken(req: Request, res: Response) {
  const parsed = fcmTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, 'טוקן לא תקין');
  }
  await removeFcmToken(getUserId(req), parsed.data.token);
  res.json({ success: true, data: { removed: true } });
}
