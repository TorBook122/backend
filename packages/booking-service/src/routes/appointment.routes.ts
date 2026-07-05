import { Router } from 'express';
import * as appointmentController from '../controllers/appointment.controller.js';
import { auditLogger } from '../middleware/audit-logger.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { UserRole } from '@torbook/shared';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

router.post(
  '/:slug/book',
  requireAuth,
  auditLogger('appointment.create'),
  asyncHandler(appointmentController.book),
);
router.patch(
  '/:id/cancel',
  requireAuth,
  auditLogger('appointment.cancel'),
  asyncHandler(appointmentController.cancel),
);
router.get('/me/upcoming', requireAuth, asyncHandler(appointmentController.myAppointments));

router.get(
  '/business/:id/stats',
  requireAuth,
  requireRole(UserRole.BUSINESS_OWNER),
  asyncHandler(appointmentController.businessAppointmentStats),
);
router.get(
  '/business/:id',
  requireAuth,
  requireRole(UserRole.BUSINESS_OWNER),
  asyncHandler(appointmentController.businessAppointments),
);
router.post(
  '/business/:id/time-blocks',
  requireAuth,
  requireRole(UserRole.BUSINESS_OWNER),
  auditLogger('business.timeblock.create'),
  asyncHandler(appointmentController.addTimeBlock),
);
router.delete(
  '/business/:id/time-blocks/:blockId',
  requireAuth,
  requireRole(UserRole.BUSINESS_OWNER),
  auditLogger('business.timeblock.delete'),
  asyncHandler(appointmentController.removeTimeBlock),
);
router.get(
  '/business/:id/time-blocks',
  requireAuth,
  requireRole(UserRole.BUSINESS_OWNER),
  asyncHandler(appointmentController.listTimeBlocks),
);

export default router;
