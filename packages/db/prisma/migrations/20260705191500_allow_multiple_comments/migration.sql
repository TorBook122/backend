-- DropIndex
DROP INDEX "BusinessComment_userId_businessId_key";

-- CreateIndex
CREATE INDEX "BusinessComment_userId_businessId_idx" ON "BusinessComment"("userId", "businessId");
