import {
  API_ERROR_CODES,
  MAX_EMPLOYEE_ROLES_PER_BUSINESS,
  type EmployeePermission,
  type EmployeeRoleDto,
} from '@torbook/shared';
import { dbClient, type DbBusiness } from '../clients/db.client.js';
import { AppError } from '../utils/app-error.js';
import type { CreateEmployeeRoleBody, UpdateEmployeeRoleBody } from '../validators/employee-role.validator.js';

type DbEmployeeRoleRow = {
  id: string;
  businessId: string;
  name: string;
  permissions: string[];
};

async function getBusinessOrThrow(businessId: string): Promise<DbBusiness> {
  try {
    return await dbClient.businesses.findById(businessId);
  } catch {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'עסק לא נמצא');
  }
}

async function assertOwnerPro(businessId: string, userId: string): Promise<DbBusiness> {
  const business = await getBusinessOrThrow(businessId);
  if (business.ownerId !== userId) {
    throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'אין הרשאה לעסק זה');
  }
  if (!business.isPro) {
    throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'פיצ\'ר זמין למנוי Plus בלבד');
  }
  return business;
}

async function getRoleOrThrow(roleId: string): Promise<DbEmployeeRoleRow & { business: DbBusiness }> {
  try {
    return await dbClient.employeeRoles.findById(roleId);
  } catch {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'תפקיד לא נמצא');
  }
}

function toRoleDto(row: DbEmployeeRoleRow): EmployeeRoleDto {
  return {
    id: row.id,
    name: row.name,
    permissions: row.permissions as EmployeePermission[],
  };
}

export async function listEmployeeRoles(businessId: string, userId: string): Promise<EmployeeRoleDto[]> {
  await assertOwnerPro(businessId, userId);
  const rows = await dbClient.employeeRoles.listByBusiness(businessId);
  return rows.map(toRoleDto);
}

export async function createEmployeeRole(
  businessId: string,
  userId: string,
  input: CreateEmployeeRoleBody,
): Promise<EmployeeRoleDto> {
  await assertOwnerPro(businessId, userId);

  const { count } = await dbClient.employeeRoles.countByBusiness(businessId);
  if (count >= MAX_EMPLOYEE_ROLES_PER_BUSINESS) {
    throw new AppError(
      409,
      API_ERROR_CODES.ROLE_LIMIT_REACHED,
      `ניתן להגדיר עד ${MAX_EMPLOYEE_ROLES_PER_BUSINESS} תפקידים`,
    );
  }

  try {
    const row = await dbClient.employeeRoles.create(businessId, {
      name: input.name.trim(),
      permissions: input.permissions,
    });
    return toRoleDto(row);
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 409) {
      throw new AppError(409, API_ERROR_CODES.CONFLICT, 'תפקיד בשם זה כבר קיים');
    }
    throw error;
  }
}

export async function updateEmployeeRole(
  roleId: string,
  userId: string,
  input: UpdateEmployeeRoleBody,
): Promise<EmployeeRoleDto> {
  const existing = await getRoleOrThrow(roleId);
  await assertOwnerPro(existing.businessId, userId);

  try {
    const row = await dbClient.employeeRoles.update(roleId, {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.permissions !== undefined ? { permissions: input.permissions } : {}),
    });
    return toRoleDto(row);
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 409) {
      throw new AppError(409, API_ERROR_CODES.CONFLICT, 'תפקיד בשם זה כבר קיים');
    }
    throw error;
  }
}

export async function deleteEmployeeRole(roleId: string, userId: string): Promise<void> {
  const existing = await getRoleOrThrow(roleId);
  await assertOwnerPro(existing.businessId, userId);

  const employees = await dbClient.employees.listByBusiness(existing.businessId);
  if (employees.some((employee) => employee.roleId === roleId)) {
    throw new AppError(409, API_ERROR_CODES.ROLE_HAS_EMPLOYEES, 'לא ניתן למחוק תפקיד עם עובדים משויכים');
  }

  await dbClient.employeeRoles.delete(roleId);
}

export async function assertRoleBelongsToBusiness(roleId: string, businessId: string): Promise<void> {
  const role = await getRoleOrThrow(roleId);
  if (role.businessId !== businessId) {
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, 'תפקיד לא שייך לעסק זה');
  }
}
