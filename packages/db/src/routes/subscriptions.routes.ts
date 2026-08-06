import { Router } from 'express';
import type { PlusPaymentStatus, PlusPaymentType, PlusSubscriptionStatus, Prisma } from '@prisma/client';
import { prisma } from '../client.js';

const router = Router();

router.get('/plus/by-business/:businessId', async (req, res) => {
  const subscription = await prisma.plusSubscription.findUnique({
    where: { businessId: req.params.businessId },
    include: { payments: { orderBy: { createdAt: 'desc' } } },
  });
  res.json({ success: true, data: subscription });
});

router.get('/plus/trials-ending', async (_req, res) => {
  const now = new Date();
  const subscriptions = await prisma.plusSubscription.findMany({
    where: {
      status: 'TRIALING',
      trialEndsAt: { lte: now },
    },
    orderBy: { trialEndsAt: 'asc' },
  });
  res.json({ success: true, data: subscriptions });
});

router.get('/plus/due-renewal', async (_req, res) => {
  const now = new Date();
  const subscriptions = await prisma.plusSubscription.findMany({
    where: {
      status: 'ACTIVE',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: { lte: now },
      morningTokenId: { not: null },
    },
    orderBy: { currentPeriodEnd: 'asc' },
  });
  res.json({ success: true, data: subscriptions });
});

router.get('/plus/cancel-at-period-end', async (_req, res) => {
  const now = new Date();
  const subscriptions = await prisma.plusSubscription.findMany({
    where: {
      status: 'ACTIVE',
      cancelAtPeriodEnd: true,
      currentPeriodEnd: { lte: now },
    },
    orderBy: { currentPeriodEnd: 'asc' },
  });
  res.json({ success: true, data: subscriptions });
});

router.get('/plus/past-due-expired', async (req, res) => {
  const graceDays = Number.parseInt(String(req.query.graceDays ?? '7'), 10);
  const graceMs = (Number.isFinite(graceDays) ? graceDays : 7) * 24 * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - graceMs);

  const subscriptions = await prisma.plusSubscription.findMany({
    where: {
      status: 'PAST_DUE',
      updatedAt: { lte: cutoff },
    },
    orderBy: { updatedAt: 'asc' },
  });
  res.json({ success: true, data: subscriptions });
});

router.post('/plus', async (req, res) => {
  const body = req.body as {
    businessId?: string;
    tier?: 'GROWTH' | 'PLUS';
    status?: PlusSubscriptionStatus;
    morningClientId?: string;
    priceAmount?: number;
    trialEndsAt?: string;
  };

  const { businessId, tier, morningClientId, priceAmount, status, trialEndsAt } = body;
  if (!businessId || !tier || priceAmount == null) {
    res.status(400).json({
      success: false,
      error: 'businessId, tier, and priceAmount are required',
    });
    return;
  }

  const subscription = await prisma.plusSubscription.create({
    data: {
      businessId,
      tier,
      morningClientId: morningClientId ?? null,
      priceAmount,
      status: status ?? 'PENDING',
      trialEndsAt: trialEndsAt ? new Date(trialEndsAt) : null,
      currentPeriodEnd: null,
    },
  });

  res.status(201).json({ success: true, data: subscription });
});

router.patch('/plus/:id', async (req, res) => {
  const data = req.body as Prisma.PlusSubscriptionUpdateInput;
  const subscription = await prisma.plusSubscription.update({
    where: { id: req.params.id },
    data,
    include: { payments: { orderBy: { createdAt: 'desc' } } },
  });
  res.json({ success: true, data: subscription });
});

router.get('/plus/payments/by-checkout-ref/:checkoutRef', async (req, res) => {
  const payment = await prisma.plusPayment.findUnique({
    where: { checkoutRef: req.params.checkoutRef },
    include: { subscription: true },
  });
  if (!payment) {
    res.status(404).json({ success: false, error: 'Payment not found' });
    return;
  }
  res.json({ success: true, data: payment });
});

router.post('/plus/payments', async (req, res) => {
  const body = req.body as {
    subscriptionId?: string;
    type?: PlusPaymentType;
    status?: PlusPaymentStatus;
    amount?: number;
    checkoutRef?: string;
    morningDocumentId?: string | null;
  };

  const { subscriptionId, type, amount, checkoutRef } = body;
  if (!subscriptionId || !type || amount == null || !checkoutRef) {
    res.status(400).json({
      success: false,
      error: 'subscriptionId, type, amount, and checkoutRef are required',
    });
    return;
  }

  const payment = await prisma.plusPayment.create({
    data: {
      subscriptionId,
      type,
      status: body.status ?? 'PENDING',
      amount,
      checkoutRef,
      morningDocumentId: body.morningDocumentId ?? null,
    },
    include: { subscription: true },
  });

  res.status(201).json({ success: true, data: payment });
});

router.patch('/plus/payments/:id', async (req, res) => {
  const data = req.body as {
    status?: PlusPaymentStatus;
    morningDocumentId?: string | null;
    type?: PlusPaymentType;
    amount?: number;
  };

  const payment = await prisma.plusPayment.update({
    where: { id: req.params.id },
    data,
    include: { subscription: true },
  });
  res.json({ success: true, data: payment });
});

export default router;
