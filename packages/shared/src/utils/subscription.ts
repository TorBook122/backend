import { BusinessSubscriptionTier } from '../types/enums.js';

/** Accept string from Prisma/DB JSON while keeping enum comparisons typed. */
export function normalizeSubscriptionTier(
  tier: BusinessSubscriptionTier | string | null | undefined,
): BusinessSubscriptionTier | null {
  if (tier === BusinessSubscriptionTier.GROWTH || tier === 'GROWTH') {
    return BusinessSubscriptionTier.GROWTH;
  }
  if (tier === BusinessSubscriptionTier.PLUS || tier === 'PLUS') {
    return BusinessSubscriptionTier.PLUS;
  }
  return null;
}

export function isPlusTier(tier: BusinessSubscriptionTier | string | null | undefined): boolean {
  return normalizeSubscriptionTier(tier) === BusinessSubscriptionTier.PLUS;
}

export function hasPaidTier(tier: BusinessSubscriptionTier | string | null | undefined): boolean {
  const normalized = normalizeSubscriptionTier(tier);
  return normalized === BusinessSubscriptionTier.GROWTH || normalized === BusinessSubscriptionTier.PLUS;
}
