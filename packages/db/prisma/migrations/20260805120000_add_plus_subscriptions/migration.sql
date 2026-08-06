-- CreateEnum
CREATE TYPE "PlusSubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAST_DUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PlusPaymentType" AS ENUM ('INITIAL', 'RENEWAL');

-- CreateEnum
CREATE TYPE "PlusPaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "PlusSubscription" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "status" "PlusSubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "morningClientId" TEXT NOT NULL,
    "morningTokenId" TEXT,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "priceAmount" INTEGER NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "renewalFailures" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlusSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlusPayment" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "type" "PlusPaymentType" NOT NULL,
    "status" "PlusPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" INTEGER NOT NULL,
    "morningDocumentId" TEXT,
    "checkoutRef" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlusPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlusSubscription_businessId_key" ON "PlusSubscription"("businessId");

-- CreateIndex
CREATE INDEX "PlusSubscription_status_currentPeriodEnd_idx" ON "PlusSubscription"("status", "currentPeriodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "PlusPayment_checkoutRef_key" ON "PlusPayment"("checkoutRef");

-- CreateIndex
CREATE INDEX "PlusPayment_subscriptionId_idx" ON "PlusPayment"("subscriptionId");

-- AddForeignKey
ALTER TABLE "PlusSubscription" ADD CONSTRAINT "PlusSubscription_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlusPayment" ADD CONSTRAINT "PlusPayment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "PlusSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
