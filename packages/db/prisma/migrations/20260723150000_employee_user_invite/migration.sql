-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'EMPLOYEE';

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "userId" TEXT;
ALTER TABLE "Employee" ADD COLUMN "inviteTokenHash" TEXT;
ALTER TABLE "Employee" ADD COLUMN "inviteExpiresAt" TIMESTAMP(3);

-- Backfill emailEnc for any legacy rows before NOT NULL constraint
UPDATE "Employee" SET "emailEnc" = "phoneEnc" WHERE "emailEnc" IS NULL;
ALTER TABLE "Employee" ALTER COLUMN "emailEnc" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");
CREATE INDEX "Employee_inviteTokenHash_idx" ON "Employee"("inviteTokenHash");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
