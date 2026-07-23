import { Router } from 'express';
import * as favoriteController from '../controllers/favorite.controller.js';
import * as userController from '../controllers/user.controller.js';
import { auditLogger } from '../middleware/audit-logger.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

router.get('/me', requireAuth, asyncHandler(userController.getMe));

router.patch(
  '/me',
  requireAuth,
  auditLogger('user.update_profile'),
  asyncHandler(userController.updateProfile),
);

router.patch(
  '/me/password',
  requireAuth,
  auditLogger('user.change_password'),
  asyncHandler(userController.changePassword),
);

router.patch(
  '/me/phone',
  requireAuth,
  auditLogger('user.complete_phone'),
  asyncHandler(userController.completePhone),
);

router.delete(
  '/me',
  requireAuth,
  auditLogger('user.delete'),
  asyncHandler(userController.deleteAccount),
);

router.post(
  '/me/gdpr-delete',
  requireAuth,
  auditLogger('user.gdpr_delete'),
  asyncHandler(userController.gdprDelete),
);

router.get('/me/favorites', requireAuth, asyncHandler(favoriteController.list));
router.post(
  '/me/favorites',
  requireAuth,
  auditLogger('favorite.add'),
  asyncHandler(favoriteController.add),
);
router.delete(
  '/me/favorites/:businessId',
  requireAuth,
  auditLogger('favorite.remove'),
  asyncHandler(favoriteController.remove),
);
router.get('/me/favorites/check/:slug', requireAuth, asyncHandler(favoriteController.check));
router.post(
  '/me/fcm-token',
  requireAuth,
  auditLogger('user.fcm_token.register'),
  asyncHandler(favoriteController.saveFcmToken),
);
router.delete(
  '/me/fcm-token',
  requireAuth,
  auditLogger('user.fcm_token.remove'),
  asyncHandler(favoriteController.deleteFcmToken),
);

export default router;
