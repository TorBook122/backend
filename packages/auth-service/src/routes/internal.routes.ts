import { Router } from 'express';
import { API_ERROR_CODES } from '@torbook/shared';
import { verifyAccessToken } from '../lib/auth/jwt.js';
import { listAdminUsers } from '../services/admin.service.js';
import { AppError } from '../utils/app-error.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

function requireInternalSecret(req: import('express').Request) {
  const secret = req.headers['x-internal-secret'];
  const expected = process.env.INTERNAL_SERVICE_SECRET;
  if (!expected || secret !== expected) {
    throw new AppError(401, API_ERROR_CODES.UNAUTHORIZED, 'Unauthorized');
  }
}

router.get(
  '/admin/users',
  asyncHandler(async (req, res) => {
    requireInternalSecret(req);
    const users = await listAdminUsers();
    res.json({ success: true, data: users });
  }),
);

router.post(
  '/token/validate',
  asyncHandler(async (req, res) => {
    requireInternalSecret(req);

    const token = req.body?.token;
    if (typeof token !== 'string' || !token) {
      throw new AppError(401, API_ERROR_CODES.UNAUTHORIZED, 'Invalid token');
    }

    try {
      const payload = verifyAccessToken(token);
      res.json({
        success: true,
        data: {
          userId: payload.sub,
          role: payload.role,
          onboardingCompletedAt: payload.onboardingCompletedAt,
          hasPhone: payload.hasPhone ?? true,
        },
      });
    } catch {
      throw new AppError(401, API_ERROR_CODES.UNAUTHORIZED, 'Invalid or expired token');
    }
  }),
);

export default router;
