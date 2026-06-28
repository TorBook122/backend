import { Router } from 'express';
import { API_ERROR_CODES } from '@torbook/shared';
import { listAdminBusinesses } from '../services/admin.service.js';
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
  '/admin/businesses',
  asyncHandler(async (req, res) => {
    requireInternalSecret(req);
    const businesses = await listAdminBusinesses();
    res.json({ success: true, data: businesses });
  }),
);

export default router;
