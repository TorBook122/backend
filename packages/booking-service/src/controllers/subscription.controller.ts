import type { Request, Response } from 'express';
import { API_ERROR_CODES, SubscriptionPlanTier } from '@torbook/shared';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  cancelSubscription,
  getSubscriptionStatus,
  handlePaymentWebhook,
  savePaymentMethodDuringTrial,
  startSubscriptionWithPayment,
  syncPendingCheckoutFromMorning,
} from '../services/subscription.service.js';
import { getMorningReturnBaseUrl, buildMorningCheckoutReturnUrl } from '../config/morning.config.js';
import { AppError } from '../utils/app-error.js';

function parseTier(value: unknown): SubscriptionPlanTier {
  if (value === SubscriptionPlanTier.GROWTH || value === SubscriptionPlanTier.PLUS) {
    return value;
  }
  throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, 'יש לבחור חבילת Growth או Plus');
}

function paymentReturnUrls(body: { fromSetup?: unknown }) {
  // Morning rejects raw localhost URLs. In development we bounce via public HTTPS → localhost.
  if (body.fromSetup === true) {
    return {
      successUrl: buildMorningCheckoutReturnUrl('/upgrade/success?from=setup'),
      failureUrl: buildMorningCheckoutReturnUrl('/upgrade/failure?from=setup'),
    };
  }
  return undefined;
}

export async function checkout(req: Request, res: Response) {
  const authReq = req as AuthenticatedRequest;
  const body = req.body as { tier?: unknown; fromSetup?: unknown };
  const tier = parseTier(body.tier ?? SubscriptionPlanTier.GROWTH);
  const result = await startSubscriptionWithPayment(authReq.userId, tier, paymentReturnUrls(body));

  if (result.paymentUrl) {
    res.status(201).json({ success: true, data: { paymentUrl: result.paymentUrl, tier: result.tier } });
    return;
  }

  res.status(201).json({
    success: true,
    data: { saved: true, tier: result.tier },
  });
}

export async function startTrialHandler(req: Request, res: Response) {
  return checkout(req, res);
}

export async function savePaymentMethod(req: Request, res: Response) {
  const authReq = req as AuthenticatedRequest;
  const body = req.body as { fromSetup?: unknown };
  const result = await savePaymentMethodDuringTrial(authReq.userId, paymentReturnUrls(body));
  if (!result.saved && !result.paymentUrl) {
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, 'נדרש להזין אמצעי תשלום');
  }
  res.status(201).json({ success: true, data: result });
}

export async function status(req: Request, res: Response) {
  const authReq = req as AuthenticatedRequest;
  const result = await getSubscriptionStatus(authReq.userId);
  res.json({ success: true, data: result });
}

export async function syncCheckout(req: Request, res: Response) {
  const authReq = req as AuthenticatedRequest;
  const result = await syncPendingCheckoutFromMorning(authReq.userId);
  res.json({ success: true, data: result });
}

export async function cancel(req: Request, res: Response) {
  const authReq = req as AuthenticatedRequest;
  const result = await cancelSubscription(authReq.userId);
  res.json({ success: true, data: result });
}

export async function webhook(req: Request, res: Response) {
  await handlePaymentWebhook(req.body as Record<string, unknown>);
  res.status(200).send('OK');
}
