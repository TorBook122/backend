-- AlterEnum: add calendar edit sub-permissions
ALTER TYPE "EmployeePermission" ADD VALUE 'CALENDAR_BLOCK_HOURS';
ALTER TYPE "EmployeePermission" ADD VALUE 'CALENDAR_SET_BREAK';
ALTER TYPE "EmployeePermission" ADD VALUE 'CALENDAR_BOOK_APPOINTMENT';
