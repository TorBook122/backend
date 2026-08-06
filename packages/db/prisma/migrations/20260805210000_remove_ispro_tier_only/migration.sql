-- Allow null subscription tier (no active paid subscription yet / cancelled).
ALTER TABLE "Business" ALTER COLUMN "subscriptionTier" DROP DEFAULT;
ALTER TABLE "Business" ALTER COLUMN "subscriptionTier" DROP NOT NULL;

-- Map legacy FREE tier to null.
UPDATE "Business" SET "subscriptionTier" = NULL WHERE "subscriptionTier" = 'FREE';

ALTER TABLE "Business" DROP COLUMN "isPro";

ALTER TYPE "BusinessSubscriptionTier" RENAME TO "BusinessSubscriptionTier_old";
CREATE TYPE "BusinessSubscriptionTier" AS ENUM ('GROWTH', 'PLUS');
ALTER TABLE "Business"
  ALTER COLUMN "subscriptionTier" TYPE "BusinessSubscriptionTier"
  USING (
    CASE
      WHEN "subscriptionTier" IS NULL THEN NULL
      ELSE "subscriptionTier"::text::"BusinessSubscriptionTier"
    END
  );
DROP TYPE "BusinessSubscriptionTier_old";
