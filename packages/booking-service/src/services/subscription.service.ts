import { randomBytes } from 'node:crypto';
import {
  API_ERROR_CODES,
  BusinessSubscriptionTier,
  PlusPaymentStatus,
  PlusPaymentType,
  PlusSubscriptionStatus,
  SubscriptionPlanTier,
} from '@torbook/shared';
import { morningClient } from '../clients/morning.client.js';
import { dbClient, type DbPlusSubscription } from '../clients/db.client.js';
import { sharedClient } from '../clients/shared.client.js';
import {
  getFrontendBaseUrl,
  getMorningCheckoutDocumentType,
  getMorningPluginId,
  buildMorningCheckoutReturnUrl,
  getMorningWebhookUrl,
  getPlusCheckoutVatType,
  getTierDisplayName,
  getTierMonthlyPriceAgorot,
  getTierMonthlyPriceIls,
  PAST_DUE_GRACE_DAYS,
  RENEWAL_FAILURE_THRESHOLD,
} from '../config/morning.config.js';
import { AppError } from '../utils/app-error.js';

export type SubscriptionStatusDto = {
  status: PlusSubscriptionStatus;
  tier: SubscriptionPlanTier | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  priceAmountIls: number;
  hasPaymentMethod: boolean;
};

function createCheckoutRef(): string {
  return randomBytes(16).toString('hex');
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function agorotToIls(agorot: number): number {
  return agorot / 100;
}

function resolveTierFromPaymentAmount(
  amountAgorot: number,
  fallback: SubscriptionPlanTier,
): SubscriptionPlanTier {
  if (amountAgorot === getTierMonthlyPriceAgorot(SubscriptionPlanTier.PLUS)) {
    return SubscriptionPlanTier.PLUS;
  }
  if (amountAgorot === getTierMonthlyPriceAgorot(SubscriptionPlanTier.GROWTH)) {
    return SubscriptionPlanTier.GROWTH;
  }
  return fallback;
}

function parseWebhookAmountIls(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function webhookAmountMatchesPrice(amountIls: number, priceAmountAgorot: number): boolean {
  return Math.round(amountIls * 100) === priceAmountAgorot;
}

function isPaidAccessStatus(status: string): boolean {
  return (
    status === PlusSubscriptionStatus.TRIALING ||
    status === PlusSubscriptionStatus.ACTIVE ||
    status === PlusSubscriptionStatus.PAST_DUE
  );
}

function resolveBusinessTier(subscription: DbPlusSubscription): BusinessSubscriptionTier | null {
  if (!isPaidAccessStatus(subscription.status)) {
    return null;
  }
  return subscription.tier === SubscriptionPlanTier.PLUS
    ? BusinessSubscriptionTier.PLUS
    : BusinessSubscriptionTier.GROWTH;
}

async function syncBusinessEntitlements(
  businessId: string,
  subscription: DbPlusSubscription,
): Promise<void> {
  const subscriptionTier = resolveBusinessTier(subscription);
  await dbClient.businesses.update(businessId, { subscriptionTier });
}

function mapSubscriptionDto(subscription: DbPlusSubscription | null): SubscriptionStatusDto {
  if (!subscription) {
    return {
      status: PlusSubscriptionStatus.CANCELLED,
      tier: null,
      trialEndsAt: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      priceAmountIls: getTierMonthlyPriceIls(SubscriptionPlanTier.GROWTH),
      hasPaymentMethod: false,
    };
  }

  return {
    status: subscription.status as PlusSubscriptionStatus,
    tier: subscription.tier as SubscriptionPlanTier,
    trialEndsAt: subscription.trialEndsAt,
    currentPeriodEnd: subscription.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    priceAmountIls: agorotToIls(subscription.priceAmount),
    hasPaymentMethod:
      Boolean(subscription.morningTokenId) || subscription.status === PlusSubscriptionStatus.ACTIVE,
  };
}

async function getOwnerBusiness(ownerId: string) {
  const business = await dbClient.businesses.findByOwnerId(ownerId);
  if (!business) {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'עסק לא נמצא');
  }
  return business;
}

async function getOwnerContact(ownerId: string, phoneEnc: string) {
  const owner = await dbClient.users.findById(ownerId);
  const phoneRaw = await sharedClient.decryptPii(phoneEnc);
  const phone = phoneRaw ? await sharedClient.normalizePhone(phoneRaw) : phoneRaw;
  const email = owner.emailEnc ? await sharedClient.decryptPii(owner.emailEnc) : undefined;
  return { owner, phone, email };
}

export async function getSubscriptionStatus(ownerId: string): Promise<SubscriptionStatusDto> {
  const business = await getOwnerBusiness(ownerId);
  const subscription = await dbClient.subscriptions.findByBusinessId(business.id);
  return mapSubscriptionDto(subscription);
}

/**
 * Reconcile a PENDING checkout with Morning when the webhook cannot reach this server
 * (or was dropped). Prefer card tokens when present; otherwise match a recent paid
 * document for this Morning client (payment forms do not always create reusable tokens).
 */
export async function syncPendingCheckoutFromMorning(ownerId: string): Promise<SubscriptionStatusDto> {
  const business = await getOwnerBusiness(ownerId);
  const subscription = await dbClient.subscriptions.findByBusinessId(business.id);
  if (!subscription) {
    return mapSubscriptionDto(null);
  }

  if (isPaidAccessStatus(subscription.status)) {
    return mapSubscriptionDto(subscription);
  }

  if (!subscription.morningClientId) {
    return mapSubscriptionDto(subscription);
  }

  const pendingPayment = (subscription.payments ?? []).find(
    (payment) =>
      payment.status === PlusPaymentStatus.PENDING &&
      (payment.type === PlusPaymentType.INITIAL || payment.type === PlusPaymentType.SETUP),
  );
  if (!pendingPayment) {
    return mapSubscriptionDto(subscription);
  }

  const tier = subscription.tier as SubscriptionPlanTier;
  const priceAmount = pendingPayment.amount > 0 ? pendingPayment.amount : getTierMonthlyPriceAgorot(tier);

  const tokens = await morningClient.searchCreditCardTokens({
    externalKey: subscription.morningClientId,
  });
  const tokenId = tokens[0]?.id;

  let documentId: string | null = null;
  if (!tokenId) {
    const docs = await morningClient.searchDocuments({
      page: 1,
      pageSize: 10,
      type: getMorningCheckoutDocumentType(),
      clientId: subscription.morningClientId,
    });
    const match = docs.find((doc) => {
      if (typeof doc.amount !== 'number') return false;
      return webhookAmountMatchesPrice(doc.amount, priceAmount);
    });
    if (!match?.id) {
      return mapSubscriptionDto(subscription);
    }
    documentId = match.id;
  }

  await activatePaidSubscription({
    subscription,
    paymentId: pendingPayment.id,
    tokenId: tokenId ?? `doc:${documentId}`,
    documentId,
    tier: resolveTierFromPaymentAmount(priceAmount, tier),
    priceAmount,
  });

  return getSubscriptionStatus(ownerId);
}

/** @deprecated use getSubscriptionStatus */
export const getPlusSubscriptionStatus = getSubscriptionStatus;

function extractCheckoutRef(body: Record<string, unknown>): string {
  // Morning payment-form notifyUrl returns our `custom` field as `external_data`
  // (form-urlencoded). Also accept JSON / Meshulam-style aliases.
  const candidates: unknown[] = [
    body.external_data,
    body.externalData,
    body.custom,
    body.checkoutRef,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
    if (candidate && typeof candidate === 'object') {
      const record = candidate as Record<string, unknown>;
      const nested = record.checkoutRef ?? record.ref ?? record.id ?? record.external_data;
      if (typeof nested === 'string' && nested.trim()) {
        return nested.trim();
      }
    }
  }

  return '';
}

function hasUsablePaidSubscription(
  subscription: DbPlusSubscription,
  requestedTier: SubscriptionPlanTier,
): boolean {
  if (!isPaidAccessStatus(subscription.status)) {
    return false;
  }
  if (subscription.tier === SubscriptionPlanTier.PLUS) {
    return true;
  }
  return subscription.tier === requestedTier;
}

async function upsertPendingSubscription(
  businessId: string,
  existing: DbPlusSubscription | null,
  tier: SubscriptionPlanTier,
): Promise<DbPlusSubscription> {
  const priceAmount = getTierMonthlyPriceAgorot(tier);

  if (!existing) {
    return dbClient.subscriptions.create({
      businessId,
      tier,
      status: PlusSubscriptionStatus.PENDING,
      priceAmount,
      trialEndsAt: null,
    });
  }

  if (isPaidAccessStatus(existing.status) && existing.morningTokenId) {
    // Keep current entitlement until checkout webhook upgrades the tier.
    return existing;
  }

  return dbClient.subscriptions.update(existing.id, {
    tier,
    status: PlusSubscriptionStatus.PENDING,
    priceAmount,
    trialEndsAt: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    renewalFailures: 0,
  });
}

async function activatePaidSubscription(input: {
  subscription: DbPlusSubscription;
  paymentId: string;
  tokenId: string;
  documentId: string | null;
  tier: SubscriptionPlanTier;
  priceAmount: number;
  morningClientId?: string | null;
}): Promise<DbPlusSubscription> {
  const {
    subscription,
    paymentId,
    tokenId,
    documentId,
    tier,
    priceAmount,
    morningClientId,
  } = input;

  await dbClient.subscriptions.updatePayment(paymentId, {
    status: PlusPaymentStatus.COMPLETED,
    morningDocumentId: documentId,
  });

  const updated = await dbClient.subscriptions.update(subscription.id, {
    tier,
    status: PlusSubscriptionStatus.ACTIVE,
    morningClientId: morningClientId ?? subscription.morningClientId,
    morningTokenId: tokenId,
    trialEndsAt: null,
    currentPeriodEnd: addMonths(new Date(), 1).toISOString(),
    priceAmount,
    renewalFailures: 0,
    cancelAtPeriodEnd: false,
  });

  await syncBusinessEntitlements(subscription.businessId, updated);
  return updated;
}

/**
 * @deprecated Trial-without-charge is not supported by Morning payment forms (amount must be > 0).
 * Kept for API compatibility — delegates to paid checkout.
 */
export async function startTrial(
  ownerId: string,
  tier: SubscriptionPlanTier,
): Promise<SubscriptionStatusDto> {
  const result = await startSubscriptionWithPayment(ownerId, tier);
  if (result.saved) {
    return getSubscriptionStatus(ownerId);
  }
  return {
    status: PlusSubscriptionStatus.PENDING,
    tier,
    trialEndsAt: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    priceAmountIls: getTierMonthlyPriceIls(tier),
    hasPaymentMethod: false,
  };
}

/** @deprecated use startSubscriptionWithPayment — Morning cannot tokenize without charging */
export async function savePaymentMethodDuringTrial(
  ownerId: string,
  options?: { successUrl?: string; failureUrl?: string },
): Promise<{ paymentUrl?: string; saved: boolean }> {
  const business = await getOwnerBusiness(ownerId);
  const subscription = await dbClient.subscriptions.findByBusinessId(business.id);
  const tier = (subscription?.tier as SubscriptionPlanTier | undefined) ?? SubscriptionPlanTier.GROWTH;
  const result = await startSubscriptionWithPayment(ownerId, tier, options);
  return { paymentUrl: result.paymentUrl, saved: result.saved };
}

/**
 * PCI DSS (SAQ A): card data is entered only on Morning's hosted payment page.
 * KvaTor never receives PAN/CVV — only opaque tokens after webhook confirmation.
 */
export async function startSubscriptionWithPayment(
  ownerId: string,
  tier: SubscriptionPlanTier,
  options?: { successUrl?: string; failureUrl?: string },
): Promise<{ paymentUrl?: string; saved: boolean; tier: SubscriptionPlanTier }> {
  const business = await getOwnerBusiness(ownerId);
  const existing = await dbClient.subscriptions.findByBusinessId(business.id);

  if (existing && hasUsablePaidSubscription(existing, tier)) {
    return { saved: true, tier: existing.tier as SubscriptionPlanTier };
  }

  const priceAmount = getTierMonthlyPriceAgorot(tier);
  const subscription = await upsertPendingSubscription(business.id, existing, tier);

  // Never grant Growth/Plus until Morning confirms payment + card tokenization.
  if (!isPaidAccessStatus(subscription.status)) {
    await dbClient.businesses.update(business.id, { subscriptionTier: null });
  }

  if (process.env.E2E_MORNING_MOCK === 'true') {
    await activatePaidSubscription({
      subscription,
      paymentId: (
        await dbClient.subscriptions.createPayment({
          subscriptionId: subscription.id,
          type: PlusPaymentType.INITIAL,
          status: PlusPaymentStatus.PENDING,
          amount: priceAmount,
          checkoutRef: createCheckoutRef(),
        })
      ).id,
      tokenId: `e2e-token-${subscription.id}`,
      documentId: `e2e-doc-${subscription.id}`,
      tier,
      priceAmount,
      morningClientId: subscription.morningClientId ?? 'e2e-morning-client',
    });
    return { saved: true, tier };
  }

  const { owner, phone, email } = await getOwnerContact(ownerId, business.phoneEnc);
  const morningClientRecord = await morningClient.findOrCreateClient({
    name: owner.name,
    email,
    phone,
  });

  if (!subscription.morningClientId) {
    await dbClient.subscriptions.update(subscription.id, {
      morningClientId: morningClientRecord.id,
    });
  }

  const checkoutRef = createCheckoutRef();
  const payment = await dbClient.subscriptions.createPayment({
    subscriptionId: subscription.id,
    type: PlusPaymentType.INITIAL,
    status: PlusPaymentStatus.PENDING,
    amount: priceAmount,
    checkoutRef,
  });

  if (!phone?.trim()) {
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, 'נדרש מספר טלפון תקין בעסק לפני תשלום');
  }

  // Morning requires a valid IL mobile (10 digits). normalizePhone strips non-digits only.
  if (!/^05\d{8}$/.test(phone)) {
    throw new AppError(
      400,
      API_ERROR_CODES.VALIDATION_ERROR,
      'מספר הטלפון של העסק אינו תקין. עדכנו בהגדרות העסק מספר נייד ישראלי בן 10 ספרות (למשל 0501234567).',
    );
  }

  try {
    const { paymentUrl } = await morningClient.createPaymentForm({
      description: `KvaTor ${getTierDisplayName(tier)} — מנוי חודשי`,
      type: getMorningCheckoutDocumentType(),
      amount: getTierMonthlyPriceIls(tier),
      currency: 'ILS',
      vatType: getPlusCheckoutVatType(),
      lang: 'he',
      client: {
        id: morningClientRecord.id,
        name: owner.name,
        ...(email ? { emails: [email] } : {}),
        phone,
      },
      notifyUrl: getMorningWebhookUrl(),
      successUrl: options?.successUrl ?? buildMorningCheckoutReturnUrl('/upgrade/success'),
      failureUrl: options?.failureUrl ?? buildMorningCheckoutReturnUrl('/upgrade/failure'),
      custom: payment.checkoutRef,
      ...(getMorningPluginId() ? { pluginId: getMorningPluginId() } : {}),
    });

    return { paymentUrl, saved: false, tier };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'שגיאה ביצירת טופס תשלום';
    throw new AppError(502, API_ERROR_CODES.INTERNAL_ERROR, message);
  }
}

/** @deprecated use startSubscriptionWithPayment */
export async function startPlusCheckout(ownerId: string): Promise<{ paymentUrl: string }> {
  const result = await startSubscriptionWithPayment(ownerId, SubscriptionPlanTier.PLUS);
  if (result.paymentUrl) {
    return { paymentUrl: result.paymentUrl };
  }
  return { paymentUrl: `${getFrontendBaseUrl()}/upgrade/success` };
}

export async function handlePaymentWebhook(body: Record<string, unknown>): Promise<void> {
  const checkoutRef = extractCheckoutRef(body);
  if (!checkoutRef) {
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, 'checkoutRef חסר');
  }

  const payment = await dbClient.subscriptions.findPaymentByCheckoutRef(checkoutRef);
  if (!payment?.subscription) {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'תשלום לא נמצא');
  }

  if (payment.status === PlusPaymentStatus.COMPLETED) {
    return;
  }

  const subscription = payment.subscription;
  const morningClientId = subscription.morningClientId;
  if (!morningClientId) {
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, 'לקוח Morning חסר');
  }

  const amountIls = parseWebhookAmountIls(
    body.amount ?? body.sum ?? body.total ?? body.document_amount,
  );

  // INITIAL / renewal-style charges must match the expected amount when Morning sends it.
  // Form-urlencoded document notify often omits amount — then we trust checkoutRef match.
  if (payment.type !== PlusPaymentType.SETUP) {
    if (amountIls != null && !webhookAmountMatchesPrice(amountIls, payment.amount)) {
      throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, 'סכום התשלום אינו תואם');
    }
  } else if (
    amountIls != null &&
    !webhookAmountMatchesPrice(amountIls, getTierMonthlyPriceAgorot(subscription.tier as SubscriptionPlanTier))
  ) {
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, 'סכום התשלום אינו תואם');
  }

  const tokens = await morningClient.searchCreditCardTokens({ externalKey: morningClientId });
  const tokenId = tokens[0]?.id;

  const documentId =
    typeof body.documentId === 'string'
      ? body.documentId
      : typeof body.id === 'string'
        ? body.id
        : null;

  // Payment forms charge successfully but often do not create a reusable card token.
  // Activate on confirmed notify anyway; renewals can use Morning recurrings / token links later.
  if (!tokenId && !documentId) {
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, 'לא נמצא אמצעי תשלום או מסמך');
  }

  if (
    payment.type === PlusPaymentType.SETUP &&
    subscription.status === PlusSubscriptionStatus.TRIALING
  ) {
    await dbClient.subscriptions.updatePayment(payment.id, {
      status: PlusPaymentStatus.COMPLETED,
      morningDocumentId: documentId,
    });
    const updated = await dbClient.subscriptions.update(subscription.id, {
      morningTokenId: tokenId ?? (documentId ? `doc:${documentId}` : subscription.morningTokenId),
    });
    await syncBusinessEntitlements(subscription.businessId, updated);
    return;
  }

  const fallbackTier = subscription.tier as SubscriptionPlanTier;
  const priceAmount =
    payment.amount > 0 ? payment.amount : getTierMonthlyPriceAgorot(fallbackTier);
  const tier = resolveTierFromPaymentAmount(priceAmount, fallbackTier);

  await activatePaidSubscription({
    subscription,
    paymentId: payment.id,
    tokenId: tokenId ?? `doc:${documentId}`,
    documentId,
    tier,
    priceAmount,
  });
}

export async function cancelSubscription(ownerId: string): Promise<SubscriptionStatusDto> {
  const business = await getOwnerBusiness(ownerId);
  const subscription = await dbClient.subscriptions.findByBusinessId(business.id);

  if (
    !subscription ||
    (subscription.status !== PlusSubscriptionStatus.ACTIVE &&
      subscription.status !== PlusSubscriptionStatus.TRIALING)
  ) {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'לא נמצא מנוי פעיל');
  }

  if (subscription.status === PlusSubscriptionStatus.TRIALING) {
    const updated = await dbClient.subscriptions.update(subscription.id, {
      status: PlusSubscriptionStatus.CANCELLED,
      trialEndsAt: null,
    });
    await syncBusinessEntitlements(business.id, updated);
    return mapSubscriptionDto(updated);
  }

  const updated = await dbClient.subscriptions.update(subscription.id, {
    cancelAtPeriodEnd: true,
  });
  return mapSubscriptionDto(updated);
}

/** @deprecated use cancelSubscription */
export const cancelPlusSubscription = cancelSubscription;

async function finalizeCancelledSubscription(subscription: DbPlusSubscription): Promise<void> {
  const updated = await dbClient.subscriptions.update(subscription.id, {
    status: PlusSubscriptionStatus.CANCELLED,
    trialEndsAt: null,
  });
  await syncBusinessEntitlements(subscription.businessId, updated);
}

async function chargeRenewal(subscription: DbPlusSubscription): Promise<void> {
  if (!subscription.morningTokenId) {
    throw new Error('Missing Morning token for renewal');
  }

  const tier = subscription.tier as SubscriptionPlanTier;
  const checkoutRef = createCheckoutRef();
  const payment = await dbClient.subscriptions.createPayment({
    subscriptionId: subscription.id,
    type: PlusPaymentType.RENEWAL,
    status: PlusPaymentStatus.PENDING,
    amount: subscription.priceAmount,
    checkoutRef,
  });

  try {
    const chargeResult = await morningClient.chargeCreditCardToken(subscription.morningTokenId, {
      description: `KvaTor ${getTierDisplayName(tier)} — חידוש מנוי חודשי`,
      type: getMorningCheckoutDocumentType(),
      amount: agorotToIls(subscription.priceAmount),
      currency: 'ILS',
      vatType: getPlusCheckoutVatType(),
      lang: 'he',
      custom: checkoutRef,
      ...(getMorningPluginId() ? { pluginId: getMorningPluginId() } : {}),
    });

    await dbClient.subscriptions.updatePayment(payment.id, {
      status: PlusPaymentStatus.COMPLETED,
      morningDocumentId: chargeResult.documentId ?? null,
    });

    const updated = await dbClient.subscriptions.update(subscription.id, {
      status: PlusSubscriptionStatus.ACTIVE,
      currentPeriodEnd: addMonths(new Date(subscription.currentPeriodEnd ?? new Date()), 1).toISOString(),
      renewalFailures: 0,
    });
    await syncBusinessEntitlements(subscription.businessId, updated);
  } catch (error) {
    await dbClient.subscriptions.updatePayment(payment.id, {
      status: PlusPaymentStatus.FAILED,
    });

    const failures = subscription.renewalFailures + 1;
    const nextStatus =
      failures >= RENEWAL_FAILURE_THRESHOLD
        ? PlusSubscriptionStatus.PAST_DUE
        : PlusSubscriptionStatus.ACTIVE;

    const updated = await dbClient.subscriptions.update(subscription.id, {
      renewalFailures: failures,
      status: nextStatus,
    });

    if (nextStatus === PlusSubscriptionStatus.PAST_DUE) {
      await syncBusinessEntitlements(subscription.businessId, updated);
    }

    throw error;
  }
}

async function convertTrialToPaid(subscription: DbPlusSubscription): Promise<void> {
  if (!subscription.morningTokenId) {
    await finalizeCancelledSubscription(subscription);
    return;
  }

  const tier = subscription.tier as SubscriptionPlanTier;
  const checkoutRef = createCheckoutRef();
  const payment = await dbClient.subscriptions.createPayment({
    subscriptionId: subscription.id,
    type: PlusPaymentType.TRIAL_CONVERSION,
    status: PlusPaymentStatus.PENDING,
    amount: subscription.priceAmount,
    checkoutRef,
  });

  try {
    const chargeResult = await morningClient.chargeCreditCardToken(subscription.morningTokenId, {
      description: `KvaTor ${getTierDisplayName(tier)} — תחילת מנוי לאחר ניסיון`,
      type: getMorningCheckoutDocumentType(),
      amount: agorotToIls(subscription.priceAmount),
      currency: 'ILS',
      vatType: getPlusCheckoutVatType(),
      lang: 'he',
      custom: checkoutRef,
      ...(getMorningPluginId() ? { pluginId: getMorningPluginId() } : {}),
    });

    await dbClient.subscriptions.updatePayment(payment.id, {
      status: PlusPaymentStatus.COMPLETED,
      morningDocumentId: chargeResult.documentId ?? null,
    });

    const updated = await dbClient.subscriptions.update(subscription.id, {
      status: PlusSubscriptionStatus.ACTIVE,
      trialEndsAt: null,
      currentPeriodEnd: addMonths(new Date(), 1).toISOString(),
      renewalFailures: 0,
    });
    await syncBusinessEntitlements(subscription.businessId, updated);
  } catch {
    await dbClient.subscriptions.updatePayment(payment.id, {
      status: PlusPaymentStatus.FAILED,
    });
    await finalizeCancelledSubscription(subscription);
  }
}

export async function renewDueSubscriptions(): Promise<void> {
  const cancelAtPeriodEnd = await dbClient.subscriptions.listCancelAtPeriodEnd();
  for (const subscription of cancelAtPeriodEnd) {
    await finalizeCancelledSubscription(subscription);
  }

  const endingTrials = await dbClient.subscriptions.listTrialsEnding();
  for (const subscription of endingTrials) {
    await convertTrialToPaid(subscription);
  }

  const dueRenewals = await dbClient.subscriptions.listDueRenewal();
  for (const subscription of dueRenewals) {
    try {
      await chargeRenewal(subscription);
    } catch {
      // Failure already persisted on the subscription record.
    }
  }

  const expiredPastDue = await dbClient.subscriptions.listPastDueExpired(PAST_DUE_GRACE_DAYS);
  for (const subscription of expiredPastDue) {
    await finalizeCancelledSubscription(subscription);
  }
}

export function isActiveSubscription(subscription: DbPlusSubscription): boolean {
  if (subscription.status === PlusSubscriptionStatus.TRIALING) {
    return subscription.trialEndsAt != null && new Date(subscription.trialEndsAt) > new Date();
  }
  return (
    subscription.status === PlusSubscriptionStatus.ACTIVE &&
    subscription.currentPeriodEnd != null &&
    new Date(subscription.currentPeriodEnd) > new Date()
  );
}
