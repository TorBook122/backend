import { Router } from 'express';
import express from 'express';
import { UserRole } from '@torbook/shared';
import * as subscriptionController from '../controllers/subscription.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

const ownerOnly = [requireAuth, requireRole(UserRole.BUSINESS_OWNER)] as const;

const router = Router();

router.post('/trial/start', ...ownerOnly, asyncHandler(subscriptionController.startTrialHandler));

router.post('/payment-method/setup', ...ownerOnly, asyncHandler(subscriptionController.savePaymentMethod));

router.post('/checkout', ...ownerOnly, asyncHandler(subscriptionController.checkout));

router.post('/plus/checkout', ...ownerOnly, asyncHandler(subscriptionController.checkout));

router.get('/status', ...ownerOnly, asyncHandler(subscriptionController.status));

router.get('/plus/status', ...ownerOnly, asyncHandler(subscriptionController.status));

router.post('/sync-checkout', ...ownerOnly, asyncHandler(subscriptionController.syncCheckout));

router.post('/plus/sync-checkout', ...ownerOnly, asyncHandler(subscriptionController.syncCheckout));

router.post('/cancel', ...ownerOnly, asyncHandler(subscriptionController.cancel));

router.post('/plus/cancel', ...ownerOnly, asyncHandler(subscriptionController.cancel));

router.post(
  '/plus/webhook',
  express.urlencoded({ extended: true }),
  asyncHandler(subscriptionController.webhook),
);

export default router;
