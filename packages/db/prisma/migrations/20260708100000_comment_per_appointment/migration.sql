-- Comments are now tied to a single completed past appointment.
DELETE FROM "BusinessComment";

-- DropIndex
DROP INDEX IF EXISTS "BusinessComment_userId_businessId_idx";

-- AlterTable
ALTER TABLE "BusinessComment" ADD COLUMN "appointmentId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "BusinessComment_appointmentId_key" ON "BusinessComment"("appointmentId");

-- AddForeignKey
ALTER TABLE "BusinessComment" ADD CONSTRAINT "BusinessComment_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
