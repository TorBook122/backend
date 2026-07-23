import {
  API_ERROR_CODES,
  MAX_EMPLOYEES_PER_BUSINESS,
  type EmployeeDto,
} from '@torbook/shared';
import { dbClient, type DbBusiness } from '../clients/db.client.js';
import { sharedClient } from '../clients/shared.client.js';
import { AppError } from '../utils/app-error.js';
import type { CreateEmployeeBody, UpdateEmployeeBody } from '../validators/employee.validator.js';

type DbEmployeeRow = {
  id: string;
  businessId: string;
  name: string;
  phoneEnc: string;
  emailEnc: string | null;
  title: string | null;
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

async function toEmployeeDto(row: DbEmployeeRow): Promise<EmployeeDto> {
  return {
    id: row.id,
    name: row.name,
    phone: await sharedClient.decryptPii(row.phoneEnc),
    email: row.emailEnc ? await sharedClient.decryptPii(row.emailEnc) : null,
    title: row.title,
  };
}

export async function listEmployees(businessId: string, userId: string): Promise<EmployeeDto[]> {
  await assertOwnerPro(businessId, userId);
  const rows = await dbClient.employees.listByBusiness(businessId);
  return Promise.all(rows.map(toEmployeeDto));
}

export async function createEmployee(
  businessId: string,
  userId: string,
  input: CreateEmployeeBody,
): Promise<EmployeeDto> {
  await assertOwnerPro(businessId, userId);

  const { count } = await dbClient.employees.countByBusiness(businessId);
  if (count >= MAX_EMPLOYEES_PER_BUSINESS) {
    throw new AppError(
      409,
      API_ERROR_CODES.EMPLOYEE_LIMIT_REACHED,
      `ניתן להוסיף עד ${MAX_EMPLOYEES_PER_BUSINESS} עובדים`,
    );
  }

  const phoneEnc = await sharedClient.encryptPii(await sharedClient.normalizePhone(input.phone));
  const emailEnc =
    input.email?.trim()
      ? await sharedClient.encryptPii(await sharedClient.normalizeEmail(input.email))
      : null;

  const row = await dbClient.employees.create(businessId, {
    name: input.name.trim(),
    phoneEnc,
    emailEnc,
    title: input.title?.trim() || null,
  });

  return toEmployeeDto(row);
}

export async function updateEmployee(
  employeeId: string,
  userId: string,
  input: UpdateEmployeeBody,
): Promise<EmployeeDto> {
  const existing = await dbClient.employees.findById(employeeId);
  await assertOwnerPro(existing.businessId, userId);

  const data: Partial<{ name: string; phoneEnc: string; emailEnc: string | null; title: string | null }> = {};

  if (input.name !== undefined) data.name = input.name.trim();
  if (input.phone !== undefined) {
    data.phoneEnc = await sharedClient.encryptPii(await sharedClient.normalizePhone(input.phone));
  }
  if (input.email !== undefined) {
    data.emailEnc = input.email?.trim()
      ? await sharedClient.encryptPii(await sharedClient.normalizeEmail(input.email))
      : null;
  }
  if (input.title !== undefined) {
    data.title = input.title?.trim() || null;
  }

  const row = await dbClient.employees.update(employeeId, data);
  return toEmployeeDto(row);
}

export async function deleteEmployee(employeeId: string, userId: string): Promise<void> {
  const existing = await dbClient.employees.findById(employeeId);
  await assertOwnerPro(existing.businessId, userId);
  await dbClient.employees.delete(employeeId);
}
