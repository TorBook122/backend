import { Router } from 'express';
import * as employeeRoleController from '../controllers/employee-role.controller.js';
import { auditLogger } from '../middleware/audit-logger.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { UserRole } from '@torbook/shared';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

router.patch(
  '/:id',
  requireAuth,
  requireRole(UserRole.BUSINESS_OWNER),
  auditLogger('business.employee-role.update'),
  asyncHandler(employeeRoleController.patch),
);
router.delete(
  '/:id',
  requireAuth,
  requireRole(UserRole.BUSINESS_OWNER),
  auditLogger('business.employee-role.delete'),
  asyncHandler(employeeRoleController.remove),
);

export default router;
