import type { Request, Response } from 'express';
import { API_ERROR_CODES } from '@torbook/shared';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { createSupportRequest } from '../services/support.service.js';
import { AppError } from '../utils/app-error.js';
import { createSupportRequestSchema } from '../validators/support.validator.js';

export async function submit(req: Request, res: Response) {
  const parsed = createSupportRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    const message = parsed.error.errors[0]?.message ?? 'נתונים לא תקינים';
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, message);
  }

  const authReq = req as AuthenticatedRequest;
  const userId = authReq.userId;

  const supportRequest = await createSupportRequest({
    ...parsed.data,
    userId,
  });

  res.status(201).json({ success: true, data: supportRequest });
}
