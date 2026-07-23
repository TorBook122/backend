import { Router } from 'express';
import * as businessController from '../controllers/business.controller.js';
import * as employeeController from '../controllers/employee.controller.js';
import * as employeeRoleController from '../controllers/employee-role.controller.js';
import * as engagementController from '../controllers/engagement.controller.js';
import { auditLogger } from '../middleware/audit-logger.js';
import { optionalAuth, requireAuth, requireRole } from '../middleware/auth.js';
import { UserRole } from '@torbook/shared';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

router.post(
  '/onboarding/complete',
  requireAuth,
  requireRole(UserRole.BUSINESS_OWNER),
  auditLogger('business.onboarding.complete'),
  asyncHandler(businessController.finishOnboarding),
);

router.get('/', asyncHandler(businessController.list));
router.get('/map', asyncHandler(businessController.mapLocations));
router.get('/rankings', asyncHandler(engagementController.rankings));
router.post(
  '/',
  requireAuth,
  requireRole(UserRole.BUSINESS_OWNER),
  auditLogger('business.create'),
  asyncHandler(businessController.create),
);
router.get('/mine/owner', requireAuth, requireRole(UserRole.BUSINESS_OWNER), asyncHandler(businessController.getMine));
router.get(
  '/mine/managed',
  requireAuth,
  requireRole(UserRole.BUSINESS_OWNER, UserRole.EMPLOYEE),
  asyncHandler(businessController.getManaged),
);

router.get('/:slug/slots', asyncHandler(businessController.getSlots));
router.get('/:slug/engagement', optionalAuth, asyncHandler(engagementController.engagement));
router.post('/:slug/likes', requireAuth, asyncHandler(engagementController.like));
router.delete('/:slug/likes', requireAuth, asyncHandler(engagementController.unlike));
router.get('/:slug/comments', optionalAuth, asyncHandler(engagementController.comments));
router.put('/:slug/comments', requireAuth, asyncHandler(engagementController.createCommentHandler));
router.put('/:slug/comments/:commentId', requireAuth, asyncHandler(engagementController.updateCommentHandler));
router.delete('/:slug/comments/:commentId', requireAuth, asyncHandler(engagementController.removeComment));
router.get('/:slug', asyncHandler(businessController.getBySlug));
const ownerOrEmployee = [UserRole.BUSINESS_OWNER, UserRole.EMPLOYEE] as const;

router.patch(
  '/:id',
  requireAuth,
  requireRole(...ownerOrEmployee),
  auditLogger('business.update'),
  asyncHandler(businessController.update),
);
router.put(
  '/:id/availability',
  requireAuth,
  requireRole(...ownerOrEmployee),
  auditLogger('business.availability.update'),
  asyncHandler(businessController.setAvailability),
);
router.put(
  '/:id/breaks',
  requireAuth,
  requireRole(...ownerOrEmployee),
  auditLogger('business.breaks.update'),
  asyncHandler(businessController.setBreaks),
);
router.post(
  '/:id/services',
  requireAuth,
  requireRole(...ownerOrEmployee),
  auditLogger('business.service.create'),
  asyncHandler(businessController.addService),
);
router.get(
  '/:id/services',
  requireAuth,
  requireRole(...ownerOrEmployee),
  asyncHandler(businessController.listServices),
);

router.post(
  '/:id/employees',
  requireAuth,
  requireRole(UserRole.BUSINESS_OWNER),
  auditLogger('business.employee.create'),
  asyncHandler(employeeController.create),
);
router.get(
  '/:id/employees',
  requireAuth,
  requireRole(UserRole.BUSINESS_OWNER),
  asyncHandler(employeeController.list),
);

router.get(
  '/:id/employee-roles',
  requireAuth,
  requireRole(UserRole.BUSINESS_OWNER),
  asyncHandler(employeeRoleController.list),
);
router.post(
  '/:id/employee-roles',
  requireAuth,
  requireRole(UserRole.BUSINESS_OWNER),
  auditLogger('business.employee-role.create'),
  asyncHandler(employeeRoleController.create),
);

export default router;
