import type { Request, Response } from 'express';
import { API_ERROR_CODES } from '@torbook/shared';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  addLike,
  createComment,
  deleteComment,
  getEngagement,
  getRankings,
  listComments,
  removeLike,
  updateComment,
} from '../services/engagement.service.js';
import { AppError } from '../utils/app-error.js';
import { param } from '../utils/param.js';
import { createCommentSchema, updateCommentSchema } from '../validators/engagement.validator.js';

function getOptionalUserId(req: Request): string | undefined {
  return (req as Partial<AuthenticatedRequest>).userId;
}

function getUserId(req: Request): string {
  const userId = getOptionalUserId(req);
  if (!userId) {
    throw new AppError(401, API_ERROR_CODES.UNAUTHORIZED, 'נדרשת התחברות');
  }
  return userId;
}

export async function rankings(_req: Request, res: Response) {
  const data = await getRankings();
  res.json({ success: true, data });
}

export async function engagement(req: Request, res: Response) {
  const data = await getEngagement(param(req.params.slug), getOptionalUserId(req));
  res.json({ success: true, data });
}

export async function like(req: Request, res: Response) {
  const data = await addLike(param(req.params.slug), getUserId(req));
  res.status(201).json({ success: true, data });
}

export async function unlike(req: Request, res: Response) {
  const data = await removeLike(param(req.params.slug), getUserId(req));
  res.json({ success: true, data });
}

export async function comments(req: Request, res: Response) {
  const data = await listComments(param(req.params.slug), getOptionalUserId(req));
  res.json({ success: true, data });
}

export async function createCommentHandler(req: Request, res: Response) {
  const parsed = createCommentSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, parsed.error.errors[0]?.message ?? 'נתונים לא תקינים');
  }

  const data = await createComment(
    param(req.params.slug),
    getUserId(req),
    parsed.data.appointmentId,
    parsed.data.text,
  );
  res.status(201).json({ success: true, data });
}

export async function updateCommentHandler(req: Request, res: Response) {
  const parsed = updateCommentSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, parsed.error.errors[0]?.message ?? 'נתונים לא תקינים');
  }

  const data = await updateComment(
    param(req.params.slug),
    getUserId(req),
    param(req.params.commentId),
    parsed.data.text,
  );
  res.json({ success: true, data });
}

export async function removeComment(req: Request, res: Response) {
  await deleteComment(param(req.params.slug), getUserId(req), param(req.params.commentId));
  res.json({ success: true, data: { deleted: true } });
}
