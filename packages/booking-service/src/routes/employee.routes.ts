import { Router } from 'express';
import * as employeeController from '../controllers/employee.controller.js';
import { auditLogger } from '../middleware/audit-logger.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { UserRole } from '@torbook/shared';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

router.patch(
  '/:id',
  requireAuth,
  requireRole(UserRole.BUSINESS_OWNER),
  auditLogger('business.employee.update'),
  asyncHandler(employeeController.patch),
);
router.delete(
  '/:id',
  requireAuth,
  requireRole(UserRole.BUSINESS_OWNER),
  auditLogger('business.employee.delete'),
  asyncHandler(employeeController.remove),
);

export default router;
