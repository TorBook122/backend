import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { auditLogger } from '../middleware/audit-logger.js';
import { loginRateLimiter } from '../middleware/rate-limiter.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

router.post('/register', auditLogger('auth.register'), asyncHandler(authController.register));
router.post('/login', loginRateLimiter, auditLogger('auth.login'), asyncHandler(authController.login));
router.post('/refresh', auditLogger('auth.refresh'), asyncHandler(authController.refresh));
router.post('/logout', auditLogger('auth.logout'), asyncHandler(authController.logout));

export default router;
