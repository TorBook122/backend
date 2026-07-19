-- DropIndex
DROP INDEX "BreakBlock_businessId_dayOfWeek_key";

-- CreateIndex
CREATE INDEX "BreakBlock_businessId_dayOfWeek_idx" ON "BreakBlock"("businessId", "dayOfWeek");
