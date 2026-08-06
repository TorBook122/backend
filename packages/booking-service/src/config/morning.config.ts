import { SubscriptionPlanTier } from '@torbook/shared';

type MorningEnv = 'sandbox' | 'production';

const MORNING_HOSTS = {
  sandbox: {
    oauth: 'https://api.sandbox.morning.dev',
    api: 'https://sandbox.d.greeninvoice.co.il/api/v1',
  },
  production: {
    oauth: 'https://api.morning.co',
    api: 'https://api.greeninvoice.co.il/api/v1',
  },
} as const;

function resolveMorningEnv(): MorningEnv {
  const env = process.env.MORNING_ENV?.trim().toLowerCase();
  return env === 'production' ? 'production' : 'sandbox';
}

export function getMorningOAuthBaseUrl(): string {
  const override = process.env.MORNING_OAUTH_BASE_URL?.trim();
  if (override) return override;
  return MORNING_HOSTS[resolveMorningEnv()].oauth;
}

export function getMorningApiBaseUrl(): string {
  const override = process.env.MORNING_API_BASE_URL?.trim();
  if (override) return override;
  return MORNING_HOSTS[resolveMorningEnv()].api;
}

export function getMorningClientId(): string {
  const value = process.env.MORNING_CLIENT_ID?.trim();
  if (!value) {
    throw new Error('MORNING_CLIENT_ID is required');
  }
  return value;
}

export function getMorningClientSecret(): string {
  const value = process.env.MORNING_CLIENT_SECRET?.trim();
  if (!value) {
    throw new Error('MORNING_CLIENT_SECRET is required');
  }
  return value;
}

export function getMorningPluginId(): string | undefined {
  const value = process.env.MORNING_PLUGIN_ID?.trim();
  return value || undefined;
}

/** Morning document type for hosted checkout (320 = tax invoice-receipt, 400 = receipt). */
export function getMorningCheckoutDocumentType(): number {
  const raw = process.env.MORNING_CHECKOUT_DOCUMENT_TYPE?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : 320;
  return Number.isFinite(parsed) ? parsed : 320;
}

const LOCAL_HTTP_HOSTS = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

/**
 * Webhook URL Morning POSTs after payment. Morning rejects localhost notify URLs (403).
 * Override with MORNING_NOTIFY_URL (full URL) or MORNING_WEBHOOK_BASE_URL (origin only).
 */
export function getMorningWebhookUrl(): string {
  const notifyOverride = process.env.MORNING_NOTIFY_URL?.trim();
  if (notifyOverride) {
    return notifyOverride.replace(/\/$/, '');
  }

  const path = '/api/v1/subscriptions/plus/webhook';
  const publicBase = getPublicApiBaseUrl();
  if (!LOCAL_HTTP_HOSTS.test(publicBase)) {
    return `${publicBase}${path}`;
  }

  const webhookBase = process.env.MORNING_WEBHOOK_BASE_URL?.trim();
  if (webhookBase) {
    return `${webhookBase.replace(/\/$/, '')}${path}`;
  }

  throw new Error(
    'Morning webhook URL cannot use localhost. Set MORNING_NOTIFY_URL or MORNING_WEBHOOK_BASE_URL to a public HTTPS URL.',
  );
}

/**
 * Public HTTPS origin Morning is allowed to redirect to (never localhost — WAF 403).
 */
export function getMorningReturnBaseUrl(): string {
  const override = process.env.MORNING_RETURN_BASE_URL?.trim();
  if (override) {
    return override.replace(/\/$/, '');
  }

  const frontend = getFrontendBaseUrl();
  if (!LOCAL_HTTP_HOSTS.test(frontend)) {
    return frontend;
  }

  const fallback =
    process.env.MORNING_WEBHOOK_BASE_URL?.trim() || process.env.MORNING_NOTIFY_URL?.trim();
  if (fallback) {
    try {
      return new URL(fallback).origin;
    } catch {
      return fallback.replace(/\/$/, '');
    }
  }

  throw new Error(
    'Morning return URLs cannot use localhost. Set MORNING_RETURN_BASE_URL or MORNING_WEBHOOK_BASE_URL to a public HTTPS origin.',
  );
}

/**
 * Final success/failure URL for Morning hosted checkout.
 *
 * Local development cannot use raw localhost (Morning WAF 403). Do NOT use Meshulam /
 * grow.business as successUrl — that hijacks the browser after pay. Bounce via a
 * public HTTPS host to localhost instead (`/api/v1/dev/morning-return?to=<base64url>`).
 */
export function buildMorningCheckoutReturnUrl(pathWithQuery: string): string {
  const frontend = getFrontendBaseUrl();
  const normalizedPath = pathWithQuery.startsWith('/') ? pathWithQuery : `/${pathWithQuery}`;
  const localTarget = `${frontend}${normalizedPath}`;

  if (!LOCAL_HTTP_HOSTS.test(frontend)) {
    return localTarget;
  }

  const bounceOrigin = getMorningReturnBaseUrl();
  return `${bounceOrigin}/api/v1/dev/morning-return?to=${toBase64Url(localTarget)}`;
}

export function getPlusMonthlyPriceIls(): number {
  return getTierMonthlyPriceIls(SubscriptionPlanTier.PLUS);
}

export function getPlusMonthlyPriceAgorot(): number {
  return getTierMonthlyPriceAgorot(SubscriptionPlanTier.PLUS);
}

export function getGrowthMonthlyPriceIls(): number {
  return getTierMonthlyPriceIls(SubscriptionPlanTier.GROWTH);
}

export function getGrowthMonthlyPriceAgorot(): number {
  return getTierMonthlyPriceAgorot(SubscriptionPlanTier.GROWTH);
}

function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : fallback;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export function getTierMonthlyPriceIls(tier: SubscriptionPlanTier): number {
  if (tier === SubscriptionPlanTier.GROWTH) {
    return parsePositiveIntEnv('GROWTH_MONTHLY_PRICE_ILS', 50);
  }
  return parsePositiveIntEnv('PLUS_MONTHLY_PRICE_ILS', 100);
}

export function getTierMonthlyPriceAgorot(tier: SubscriptionPlanTier): number {
  return getTierMonthlyPriceIls(tier) * 100;
}

export function getSubscriptionTrialDays(): number {
  return parsePositiveIntEnv('SUBSCRIPTION_TRIAL_DAYS', 14);
}

export function getTierDisplayName(tier: SubscriptionPlanTier): string {
  return tier === SubscriptionPlanTier.GROWTH ? 'Growth' : 'Plus';
}

export const RENEWAL_FAILURE_THRESHOLD = 3;
export const PAST_DUE_GRACE_DAYS = 7;

export function getPlusCheckoutVatType(): number {
  const raw = process.env.PLUS_CHECKOUT_VAT_TYPE?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getPublicApiBaseUrl(): string {
  const value = process.env.PUBLIC_API_BASE_URL?.trim();
  if (!value) {
    throw new Error('PUBLIC_API_BASE_URL is required');
  }
  return value.replace(/\/$/, '');
}

export function getFrontendBaseUrl(): string {
  const value = process.env.FRONTEND_BASE_URL?.trim();
  if (!value) {
    throw new Error('FRONTEND_BASE_URL is required');
  }
  return value.replace(/\/$/, '');
}

export const RENEWAL_JOB_INTERVAL_MS = 24 * 60 * 60 * 1000;
