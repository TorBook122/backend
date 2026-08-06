import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PlusPaymentStatus,
  PlusPaymentType,
  PlusSubscriptionStatus,
  SubscriptionPlanTier,
} from '@torbook/shared';

const mockDb = vi.hoisted(() => ({
  businesses: {
    findByOwnerId: vi.fn(),
    update: vi.fn(),
  },
  users: {
    findById: vi.fn(),
  },
  subscriptions: {
    findByBusinessId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    createPayment: vi.fn(),
    updatePayment: vi.fn(),
    findPaymentByCheckoutRef: vi.fn(),
    listDueRenewal: vi.fn(),
    listTrialsEnding: vi.fn(),
    listCancelAtPeriodEnd: vi.fn(),
    listPastDueExpired: vi.fn(),
  },
}));

const mockMorning = vi.hoisted(() => ({
  findOrCreateClient: vi.fn(),
  createPaymentForm: vi.fn(),
  searchCreditCardTokens: vi.fn(),
  chargeCreditCardToken: vi.fn(),
}));

const mockShared = vi.hoisted(() => ({
  decryptPii: vi.fn(),
  normalizePhone: vi.fn(),
}));

vi.mock('../clients/db.client.js', () => ({
  dbClient: mockDb,
}));

vi.mock('../clients/morning.client.js', () => ({
  morningClient: mockMorning,
}));

vi.mock('../clients/shared.client.js', () => ({
  sharedClient: mockShared,
}));

vi.mock('../config/morning.config.js', () => ({
  getPlusMonthlyPriceIls: () => 100,
  getPlusMonthlyPriceAgorot: () => 10000,
  getTierMonthlyPriceIls: (tier: string) => (tier === 'GROWTH' ? 50 : 100),
  getTierMonthlyPriceAgorot: (tier: string) => (tier === 'GROWTH' ? 5000 : 10000),
  getTierDisplayName: (tier: string) => (tier === 'GROWTH' ? 'Growth' : 'Plus'),
  getPlusCheckoutVatType: () => 0,
  getMorningPluginId: () => 'plugin-test',
  getMorningCheckoutDocumentType: () => 400,
  getMorningWebhookUrl: () => 'https://staging.kvator.co.il/api/v1/subscriptions/plus/webhook',
  getMorningReturnBaseUrl: () => 'https://staging.kvator.co.il',
  buildMorningCheckoutReturnUrl: (path: string) => `https://staging.kvator.co.il${path}`,
  getPublicApiBaseUrl: () => 'http://localhost:3001',
  getFrontendBaseUrl: () => 'http://localhost:3000',
  getSubscriptionTrialDays: () => 14,
  RENEWAL_FAILURE_THRESHOLD: 3,
  PAST_DUE_GRACE_DAYS: 7,
}));

import {
  handlePaymentWebhook,
  renewDueSubscriptions,
  startSubscriptionWithPayment,
  syncPendingCheckoutFromMorning,
} from '../services/subscription.service.js';

describe('subscription.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.E2E_MORNING_MOCK;
    mockDb.businesses.findByOwnerId.mockResolvedValue({
      id: 'biz-1',
      ownerId: 'owner-1',
      phoneEnc: 'enc-phone',
      subscriptionTier: null,
    });
    mockDb.businesses.update.mockResolvedValue({});
    mockDb.subscriptions.findByBusinessId.mockResolvedValue(null);
    mockDb.subscriptions.create.mockImplementation(async (data) => ({
      id: 'sub-1',
      businessId: 'biz-1',
      morningClientId: null,
      morningTokenId: null,
      ...data,
    }));
    mockDb.subscriptions.update.mockImplementation(async (id, data) => ({
      id,
      businessId: 'biz-1',
      ...data,
    }));
    mockDb.subscriptions.createPayment.mockResolvedValue({
      id: 'pay-1',
      checkoutRef: 'checkout-ref-1',
    });
    mockDb.users.findById.mockResolvedValue({ id: 'owner-1', name: 'Owner', emailEnc: null });
    mockShared.decryptPii.mockResolvedValue('0501234567');
    mockShared.normalizePhone.mockResolvedValue('0501234567');
    mockMorning.findOrCreateClient.mockResolvedValue({ id: 'morning-client-1' });
    mockMorning.createPaymentForm.mockResolvedValue({
      paymentUrl: 'https://morning.test/pay/abc',
    });
    mockMorning.searchCreditCardTokens.mockResolvedValue([{ id: 'token-1' }]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('startSubscriptionWithPayment', () => {
    it('creates a PENDING Growth checkout and redirects to Morning hosted form', async () => {
      const result = await startSubscriptionWithPayment('owner-1', SubscriptionPlanTier.GROWTH);

      expect(mockDb.subscriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          businessId: 'biz-1',
          tier: SubscriptionPlanTier.GROWTH,
          status: PlusSubscriptionStatus.PENDING,
          priceAmount: 5000,
        }),
      );
      expect(mockDb.businesses.update).toHaveBeenCalledWith('biz-1', {
        subscriptionTier: null,
      });
      expect(mockDb.subscriptions.createPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          type: PlusPaymentType.INITIAL,
          amount: 5000,
          status: PlusPaymentStatus.PENDING,
        }),
      );
      expect(mockMorning.createPaymentForm).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 50,
          description: 'KvaTor Growth — מנוי חודשי',
          custom: 'checkout-ref-1',
        }),
      );
      expect(result).toEqual({
        paymentUrl: 'https://morning.test/pay/abc',
        saved: false,
        tier: SubscriptionPlanTier.GROWTH,
      });
    });

    it('returns saved when Plus is already active with a payment method', async () => {
      mockDb.subscriptions.findByBusinessId.mockResolvedValue({
        id: 'sub-1',
        businessId: 'biz-1',
        tier: SubscriptionPlanTier.PLUS,
        status: PlusSubscriptionStatus.ACTIVE,
        morningTokenId: 'token-1',
        priceAmount: 10000,
      });

      const result = await startSubscriptionWithPayment('owner-1', SubscriptionPlanTier.GROWTH);

      expect(result).toEqual({ saved: true, tier: SubscriptionPlanTier.PLUS });
      expect(mockMorning.createPaymentForm).not.toHaveBeenCalled();
    });
  });

  describe('syncPendingCheckoutFromMorning', () => {
    it('activates PENDING checkout when Morning already has a card token', async () => {
      mockDb.subscriptions.findByBusinessId
        .mockResolvedValueOnce({
          id: 'sub-1',
          businessId: 'biz-1',
          tier: SubscriptionPlanTier.GROWTH,
          status: PlusSubscriptionStatus.PENDING,
          morningClientId: 'morning-client-1',
          morningTokenId: null,
          priceAmount: 5000,
          cancelAtPeriodEnd: false,
          renewalFailures: 0,
          trialEndsAt: null,
          currentPeriodEnd: null,
          payments: [
            {
              id: 'pay-1',
              subscriptionId: 'sub-1',
              type: PlusPaymentType.INITIAL,
              status: PlusPaymentStatus.PENDING,
              amount: 5000,
              morningDocumentId: null,
              checkoutRef: 'ref-1',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        })
        .mockResolvedValueOnce({
          id: 'sub-1',
          businessId: 'biz-1',
          tier: SubscriptionPlanTier.GROWTH,
          status: PlusSubscriptionStatus.ACTIVE,
          morningClientId: 'morning-client-1',
          morningTokenId: 'token-synced',
          priceAmount: 5000,
          cancelAtPeriodEnd: false,
          renewalFailures: 0,
          trialEndsAt: null,
          currentPeriodEnd: new Date().toISOString(),
        });
      mockMorning.searchCreditCardTokens.mockResolvedValue([{ id: 'token-synced' }]);
      mockDb.subscriptions.updatePayment.mockResolvedValue({});
      mockDb.subscriptions.update.mockResolvedValue({
        id: 'sub-1',
        businessId: 'biz-1',
        tier: SubscriptionPlanTier.GROWTH,
        status: PlusSubscriptionStatus.ACTIVE,
        morningTokenId: 'token-synced',
        priceAmount: 5000,
        cancelAtPeriodEnd: false,
        renewalFailures: 0,
        trialEndsAt: null,
        currentPeriodEnd: new Date().toISOString(),
      });

      const result = await syncPendingCheckoutFromMorning('owner-1');

      expect(mockMorning.searchCreditCardTokens).toHaveBeenCalledWith({
        externalKey: 'morning-client-1',
      });
      expect(mockDb.subscriptions.updatePayment).toHaveBeenCalledWith(
        'pay-1',
        expect.objectContaining({ status: PlusPaymentStatus.COMPLETED }),
      );
      expect(result.status).toBe(PlusSubscriptionStatus.ACTIVE);
      expect(result.hasPaymentMethod).toBe(true);
    });
  });

  describe('handlePaymentWebhook', () => {
    it('activates Growth after INITIAL payment without granting access before webhook', async () => {
      mockDb.subscriptions.findPaymentByCheckoutRef.mockResolvedValue({
        id: 'pay-initial',
        type: PlusPaymentType.INITIAL,
        status: PlusPaymentStatus.PENDING,
        amount: 5000,
        subscriptionId: 'sub-1',
        subscription: {
          id: 'sub-1',
          businessId: 'biz-1',
          status: PlusSubscriptionStatus.PENDING,
          tier: SubscriptionPlanTier.GROWTH,
          morningClientId: 'morning-client-1',
        },
      });

      mockDb.subscriptions.update.mockResolvedValue({
        id: 'sub-1',
        businessId: 'biz-1',
        status: PlusSubscriptionStatus.ACTIVE,
        tier: SubscriptionPlanTier.GROWTH,
        morningClientId: 'morning-client-1',
        morningTokenId: 'token-1',
      });

      await handlePaymentWebhook({ custom: 'checkout-setup', amount: '50' });

      expect(mockDb.subscriptions.update).toHaveBeenCalledWith(
        'sub-1',
        expect.objectContaining({
          status: PlusSubscriptionStatus.ACTIVE,
          morningTokenId: 'token-1',
          tier: SubscriptionPlanTier.GROWTH,
        }),
      );
      expect(mockDb.businesses.update).toHaveBeenCalledWith('biz-1', {
        subscriptionTier: 'GROWTH',
      });
    });

    it('upgrades to Plus when INITIAL amount matches Plus price', async () => {
      mockDb.subscriptions.findPaymentByCheckoutRef.mockResolvedValue({
        id: 'pay-plus',
        type: PlusPaymentType.INITIAL,
        status: PlusPaymentStatus.PENDING,
        amount: 10000,
        subscriptionId: 'sub-1',
        subscription: {
          id: 'sub-1',
          businessId: 'biz-1',
          status: PlusSubscriptionStatus.ACTIVE,
          tier: SubscriptionPlanTier.GROWTH,
          morningClientId: 'morning-client-1',
        },
      });

      mockDb.subscriptions.update.mockResolvedValue({
        id: 'sub-1',
        businessId: 'biz-1',
        status: PlusSubscriptionStatus.ACTIVE,
        tier: SubscriptionPlanTier.PLUS,
        morningTokenId: 'token-1',
      });

      await handlePaymentWebhook({ custom: 'checkout-plus', amount: 100 });

      expect(mockDb.subscriptions.update).toHaveBeenCalledWith(
        'sub-1',
        expect.objectContaining({
          tier: SubscriptionPlanTier.PLUS,
          status: PlusSubscriptionStatus.ACTIVE,
        }),
      );
      expect(mockDb.businesses.update).toHaveBeenCalledWith('biz-1', {
        subscriptionTier: 'PLUS',
      });
    });

    it('is idempotent when payment is already completed', async () => {
      mockDb.subscriptions.findPaymentByCheckoutRef.mockResolvedValue({
        id: 'pay-1',
        status: PlusPaymentStatus.COMPLETED,
        amount: 10000,
        subscriptionId: 'sub-1',
        subscription: { id: 'sub-1', businessId: 'biz-1', morningClientId: 'morning-client-1' },
      });

      await handlePaymentWebhook({ custom: 'checkout-1', amount: '100' });

      expect(mockDb.subscriptions.updatePayment).not.toHaveBeenCalled();
    });
  });

  describe('renewDueSubscriptions', () => {
    it('converts ending trials with token to active paid subscriptions', async () => {
      mockDb.subscriptions.listCancelAtPeriodEnd.mockResolvedValue([]);
      mockDb.subscriptions.listTrialsEnding.mockResolvedValue([
        {
          id: 'sub-trial',
          businessId: 'biz-1',
          tier: SubscriptionPlanTier.GROWTH,
          morningTokenId: 'token-1',
          priceAmount: 5000,
          renewalFailures: 0,
        },
      ]);
      mockDb.subscriptions.listDueRenewal.mockResolvedValue([]);
      mockDb.subscriptions.listPastDueExpired.mockResolvedValue([]);
      mockDb.subscriptions.createPayment.mockResolvedValue({ id: 'pay-convert', checkoutRef: 'convert-1' });
      mockMorning.chargeCreditCardToken.mockResolvedValue({ documentId: 'doc-1' });
      mockDb.subscriptions.update.mockResolvedValue({
        id: 'sub-trial',
        businessId: 'biz-1',
        tier: SubscriptionPlanTier.GROWTH,
        status: PlusSubscriptionStatus.ACTIVE,
      });

      await renewDueSubscriptions();

      expect(mockMorning.chargeCreditCardToken).toHaveBeenCalledWith(
        'token-1',
        expect.objectContaining({ amount: 50 }),
      );
    });

    it('cancels ending trials without a saved payment method', async () => {
      mockDb.subscriptions.listCancelAtPeriodEnd.mockResolvedValue([]);
      mockDb.subscriptions.listTrialsEnding.mockResolvedValue([
        { id: 'sub-trial', businessId: 'biz-1', morningTokenId: null },
      ]);
      mockDb.subscriptions.listDueRenewal.mockResolvedValue([]);
      mockDb.subscriptions.listPastDueExpired.mockResolvedValue([]);
      mockDb.subscriptions.update.mockResolvedValue({
        id: 'sub-trial',
        businessId: 'biz-1',
        status: PlusSubscriptionStatus.CANCELLED,
      });

      await renewDueSubscriptions();

      expect(mockDb.subscriptions.update).toHaveBeenCalledWith('sub-trial', {
        status: PlusSubscriptionStatus.CANCELLED,
        trialEndsAt: null,
      });
      expect(mockDb.businesses.update).toHaveBeenCalledWith('biz-1', {
        subscriptionTier: null,
      });
    });
  });
});
