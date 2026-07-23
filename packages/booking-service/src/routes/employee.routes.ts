import { Router } from 'express';
import * as employeeController from '../controllers/employee.controller.js';
import { auditLogger } from '../middleware/audit-logger.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { UserRole } from '@torbook/shared';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

router.get(
  '/me',
  requireAuth,
  requireRole(UserRole.EMPLOYEE),
  asyncHandler(employeeController.me),
);

router.patch(
  '/:id',
  requireAuth,
  requireRole(UserRole.BUSINESS_OWNER),
  auditLogger('business.employee.update'),
  asyncHandler(employeeController.patch),
);
router.post(
  '/:id/invite',
  requireAuth,
  requireRole(UserRole.BUSINESS_OWNER),
  auditLogger('business.employee.invite'),
  asyncHandler(employeeController.regenerateInvite),
);
router.delete(
  '/:id',
  requireAuth,
  requireRole(UserRole.BUSINESS_OWNER),
  auditLogger('business.employee.delete'),
  asyncHandler(employeeController.remove),
);

export default router;
