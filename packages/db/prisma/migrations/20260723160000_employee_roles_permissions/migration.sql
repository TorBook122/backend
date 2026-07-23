-- CreateEnum
CREATE TYPE "EmployeePermission" AS ENUM (
  'VIEW_APPOINTMENTS',
  'CANCEL_APPOINTMENTS',
  'BROADCAST_MESSAGE',
  'EDIT_BUSINESS_MEDIA',
  'EDIT_BUSINESS_SOCIAL',
  'EDIT_BUSINESS_PROFILE',
  'EDIT_BUSINESS_SCHEDULE',
  'MANAGE_SERVICES',
  'EDIT_CANCELLATION_POLICY'
);

-- CreateTable
CREATE TABLE "EmployeeRole" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" "EmployeePermission"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeRole_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "roleId" TEXT;

-- CreateIndex
CREATE INDEX "EmployeeRole_businessId_idx" ON "EmployeeRole"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeRole_businessId_name_key" ON "EmployeeRole"("businessId", "name");

-- CreateIndex
CREATE INDEX "Employee_roleId_idx" ON "Employee"("roleId");

-- AddForeignKey
ALTER TABLE "EmployeeRole" ADD CONSTRAINT "EmployeeRole_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "EmployeeRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;
