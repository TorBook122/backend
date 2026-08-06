import { BusinessSubscriptionTier } from '../types/enums.js';

export function isPlusTier(tier: BusinessSubscriptionTier | null | undefined): boolean {
  return tier === BusinessSubscriptionTier.PLUS;
}

export function hasPaidTier(tier: BusinessSubscriptionTier | null | undefined): boolean {
  return tier === BusinessSubscriptionTier.GROWTH || tier === BusinessSubscriptionTier.PLUS;
}
