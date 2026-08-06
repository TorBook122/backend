-- CreateEnum
CREATE TYPE "BusinessSubscriptionTier" AS ENUM ('FREE', 'GROWTH', 'PLUS');

-- CreateEnum
CREATE TYPE "SubscriptionPlanTier" AS ENUM ('GROWTH', 'PLUS');

-- AlterEnum
ALTER TYPE "PlusSubscriptionStatus" ADD VALUE 'TRIALING';

-- AlterEnum
ALTER TYPE "PlusPaymentType" ADD VALUE 'SETUP';
ALTER TYPE "PlusPaymentType" ADD VALUE 'TRIAL_CONVERSION';

-- AlterTable
ALTER TABLE "Business" ADD COLUMN "subscriptionTier" "BusinessSubscriptionTier" NOT NULL DEFAULT 'FREE';

-- AlterTable
ALTER TABLE "PlusSubscription" ADD COLUMN "tier" "SubscriptionPlanTier";
ALTER TABLE "PlusSubscription" ADD COLUMN "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "PlusSubscription" ALTER COLUMN "morningClientId" DROP NOT NULL;
ALTER TABLE "PlusSubscription" ALTER COLUMN "currentPeriodEnd" DROP NOT NULL;

-- Backfill tier for any existing rows
UPDATE "PlusSubscription" SET "tier" = 'PLUS' WHERE "tier" IS NULL;
ALTER TABLE "PlusSubscription" ALTER COLUMN "tier" SET NOT NULL;

-- CreateIndex
CREATE INDEX "PlusSubscription_status_trialEndsAt_idx" ON "PlusSubscription"("status", "trialEndsAt");
