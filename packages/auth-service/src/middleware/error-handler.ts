import type { NextFunction, Request, Response } from 'express';
import { API_ERROR_CODES } from '@torbook/shared';
import { AppError } from '../utils/app-error.js';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({
    success: false,
    error: {
      code: API_ERROR_CODES.INTERNAL_ERROR,
      message: 'שגיאה פנימית בשרת',
    },
  });
}
