import {
  API_ERROR_CODES,
  EmployeePermission,
  UserRole,
} from '@torbook/shared';
import { dbClient } from '../clients/db.client.js';
import { AppError } from './app-error.js';

export async function assertBusinessPermission(
  userId: string,
  userRole: string,
  businessId: string,
  permission: EmployeePermission,
): Promise<void> {
  if (userRole === UserRole.BUSINESS_OWNER) {
    const business = await dbClient.businesses.findById(businessId);
    if (business.ownerId !== userId) {
      throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'אין הרשאה לעסק זה');
    }
    return;
  }

  if (userRole === UserRole.EMPLOYEE) {
    const employee = await dbClient.employees.findByUserId(userId);
    if (!employee || employee.businessId !== businessId) {
      throw new AppError(403, API_ERROR_CODES.PERMISSION_DENIED, 'אין לך הרשאה לבצע את זה');
    }
    const permissions = employee.role?.permissions ?? [];
    if (!permissions.includes(permission)) {
      throw new AppError(403, API_ERROR_CODES.PERMISSION_DENIED, 'אין לך הרשאה לבצע את זה');
    }
    return;
  }

  throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'אין הרשאה');
}

export async function assertAnyBusinessPermission(
  userId: string,
  userRole: string,
  businessId: string,
  permissions: EmployeePermission[],
): Promise<void> {
  if (permissions.length === 0) {
    throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'אין הרשאה');
  }

  if (userRole === UserRole.BUSINESS_OWNER) {
    const business = await dbClient.businesses.findById(businessId);
    if (business.ownerId !== userId) {
      throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'אין הרשאה לעסק זה');
    }
    return;
  }

  if (userRole === UserRole.EMPLOYEE) {
    const employee = await dbClient.employees.findByUserId(userId);
    if (!employee || employee.businessId !== businessId) {
      throw new AppError(403, API_ERROR_CODES.PERMISSION_DENIED, 'אין לך הרשאה לבצע את זה');
    }
    const rolePermissions = employee.role?.permissions ?? [];
    if (!permissions.some((p) => rolePermissions.includes(p))) {
      throw new AppError(403, API_ERROR_CODES.PERMISSION_DENIED, 'אין לך הרשאה לבצע את זה');
    }
    return;
  }

  throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'אין הרשאה');
}

export async function hasBusinessPermission(
  userId: string,
  userRole: string,
  businessId: string,
  permission: EmployeePermission,
): Promise<boolean> {
  try {
    await assertBusinessPermission(userId, userRole, businessId, permission);
    return true;
  } catch (error) {
    if (error instanceof AppError && error.code === API_ERROR_CODES.PERMISSION_DENIED) {
      return false;
    }
    if (error instanceof AppError && error.code === API_ERROR_CODES.FORBIDDEN) {
      return false;
    }
    throw error;
  }
}

export async function getEmployeeBusinessId(userId: string): Promise<string | null> {
  try {
    const employee = await dbClient.employees.findByUserId(userId);
    return employee?.businessId ?? null;
  } catch {
    return null;
  }
}

/** True when the user owns the business or is an employee of it. */
export async function isAffiliatedWithBusiness(
  userId: string,
  businessId: string,
  ownerId: string,
): Promise<boolean> {
  if (ownerId === userId) return true;
  const employeeBusinessId = await getEmployeeBusinessId(userId);
  return employeeBusinessId === businessId;
}

export async function assertNotAffiliatedBusiness(
  userId: string,
  businessId: string,
  ownerId: string,
  message = 'לא ניתן לבצע פעולה זו בעסק שלך',
): Promise<void> {
  if (await isAffiliatedWithBusiness(userId, businessId, ownerId)) {
    throw new AppError(403, API_ERROR_CODES.FORBIDDEN, message);
  }
}
