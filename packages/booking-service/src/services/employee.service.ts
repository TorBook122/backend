import { createHash, randomBytes } from 'node:crypto';
import {
  API_ERROR_CODES,
  AuthProvider,
  EMPLOYEE_INVITE_TTL_DAYS,
  EmployeePermission,
  MAX_EMPLOYEES_PER_BUSINESS,
  UserRole,
  type CreateEmployeeResponse,
  type EmployeeAccountStatus,
  type EmployeeContextDto,
  type EmployeeDto,
  type RegenerateEmployeeInviteResponse,
} from '@torbook/shared';
import { dbClient, type DbBusiness } from '../clients/db.client.js';
import { sharedClient } from '../clients/shared.client.js';
import { AppError } from '../utils/app-error.js';
import { assertRoleBelongsToBusiness } from './employee-role.service.js';
import type { CreateEmployeeBody, UpdateEmployeeBody } from '../validators/employee.validator.js';

type DbEmployeeRow = {
  id: string;
  businessId: string;
  userId: string | null;
  roleId: string | null;
  name: string;
  phoneEnc: string;
  emailEnc: string;
  title: string | null;
  inviteTokenHash: string | null;
  inviteExpiresAt: string | null;
  user: { passwordHash: string | null } | null;
  role: { id: string; name: string; permissions: string[] } | null;
};

function isLocalOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}

/**
 * Public app base for invite links, derived from CORS_ORIGIN (same var as Railway).
 * Skips localhost when a public origin is listed; appends /frontend for GitHub Pages.
 */
function getInviteBaseUrl(): string {
  const origins = (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);

  const origin = origins.find((o) => !isLocalOrigin(o)) ?? origins[0] ?? 'http://localhost:3000';

  try {
    if (new URL(origin).hostname.endsWith('github.io')) {
      return `${origin}/frontend`;
    }
  } catch {
    /* ignore invalid origin */
  }

  return origin;
}

function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function buildInviteUrl(token: string): string {
  return `${getInviteBaseUrl()}/set-password?token=${encodeURIComponent(token)}`;
}

function generateInviteFields(): { rawToken: string; inviteTokenHash: string; inviteExpiresAt: string } {
  const rawToken = randomBytes(32).toString('hex');
  const inviteExpiresAt = new Date(
    Date.now() + EMPLOYEE_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  return {
    rawToken,
    inviteTokenHash: hashInviteToken(rawToken),
    inviteExpiresAt,
  };
}

function resolveAccountStatus(row: DbEmployeeRow): EmployeeAccountStatus {
  if (row.user?.passwordHash) {
    return 'active';
  }
  return 'pending_activation';
}

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
    email: await sharedClient.decryptPii(row.emailEnc),
    title: row.title,
    roleId: row.roleId,
    roleName: row.role?.name ?? null,
    accountStatus: resolveAccountStatus(row),
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
): Promise<CreateEmployeeResponse> {
  await assertOwnerPro(businessId, userId);

  const { count } = await dbClient.employees.countByBusiness(businessId);
  if (count >= MAX_EMPLOYEES_PER_BUSINESS) {
    throw new AppError(
      409,
      API_ERROR_CODES.EMPLOYEE_LIMIT_REACHED,
      `ניתן להוסיף עד ${MAX_EMPLOYEES_PER_BUSINESS} עובדים`,
    );
  }

  const normalizedPhone = await sharedClient.normalizePhone(input.phone);
  const normalizedEmail = await sharedClient.normalizeEmail(input.email);
  const phoneHash = await sharedClient.hashPii(normalizedPhone);
  const emailHash = await sharedClient.hashPii(normalizedEmail);

  const existingPhone = await dbClient.users.findByPhoneHash(phoneHash);
  if (existingPhone) {
    throw new AppError(409, API_ERROR_CODES.DUPLICATE_PHONE, 'מספר טלפון כבר רשום במערכת');
  }

  const existingEmail = await dbClient.users.findByEmailHash(emailHash);
  if (existingEmail) {
    throw new AppError(409, API_ERROR_CODES.DUPLICATE_EMAIL, 'אימייל כבר רשום במערכת');
  }

  const phoneEnc = await sharedClient.encryptPii(normalizedPhone);
  const emailEnc = await sharedClient.encryptPii(normalizedEmail);
  const { rawToken, inviteTokenHash, inviteExpiresAt } = generateInviteFields();

  await assertRoleBelongsToBusiness(input.roleId, businessId);

  const createdUser = await dbClient.users.create({
    name: input.name.trim(),
    phoneEnc,
    phoneHash,
    emailEnc,
    emailHash,
    passwordHash: null,
    provider: AuthProvider.LOCAL,
    role: UserRole.EMPLOYEE,
  });

  const row = await dbClient.employees.create(businessId, {
    name: input.name.trim(),
    phoneEnc,
    emailEnc,
    title: input.title?.trim() || null,
    userId: createdUser.id,
    roleId: input.roleId,
    inviteTokenHash,
    inviteExpiresAt,
  });

  const employee = await toEmployeeDto(row);
  return {
    ...employee,
    inviteUrl: buildInviteUrl(rawToken),
  };
}

export async function regenerateEmployeeInvite(
  employeeId: string,
  userId: string,
): Promise<RegenerateEmployeeInviteResponse> {
  const existing = await dbClient.employees.findById(employeeId);
  await assertOwnerPro(existing.businessId, userId);

  if (existing.user?.passwordHash) {
    throw new AppError(409, API_ERROR_CODES.ACCOUNT_ALREADY_ACTIVE, 'חשבון העובד כבר הופעל');
  }

  const { rawToken, inviteTokenHash, inviteExpiresAt } = generateInviteFields();
  await dbClient.employees.update(employeeId, {
    inviteTokenHash,
    inviteExpiresAt,
  });

  return { inviteUrl: buildInviteUrl(rawToken) };
}

export async function updateEmployee(
  employeeId: string,
  userId: string,
  input: UpdateEmployeeBody,
): Promise<EmployeeDto> {
  const existing = await dbClient.employees.findById(employeeId);
  await assertOwnerPro(existing.businessId, userId);

  const data: Partial<{
    name: string;
    phoneEnc: string;
    emailEnc: string;
    title: string | null;
    roleId: string;
  }> = {};

  if (input.name !== undefined) data.name = input.name.trim();
  if (input.phone !== undefined) {
    data.phoneEnc = await sharedClient.encryptPii(await sharedClient.normalizePhone(input.phone));
  }
  if (input.email !== undefined) {
    data.emailEnc = await sharedClient.encryptPii(await sharedClient.normalizeEmail(input.email));
  }
  if (input.title !== undefined) {
    data.title = input.title?.trim() || null;
  }
  if (input.roleId !== undefined) {
    await assertRoleBelongsToBusiness(input.roleId, existing.businessId);
    data.roleId = input.roleId;
  }

  const row = await dbClient.employees.update(employeeId, data);
  return toEmployeeDto(row);
}

export async function deleteEmployee(employeeId: string, userId: string): Promise<void> {
  const existing = await dbClient.employees.findById(employeeId);
  await assertOwnerPro(existing.businessId, userId);
  await dbClient.employees.delete(employeeId);
}

export async function getMyEmployeeContext(userId: string): Promise<EmployeeContextDto> {
  const employee = await dbClient.employees.findByUserId(userId);
  return {
    businessId: employee.business.id,
    businessName: employee.business.name,
    roleName: employee.role?.name ?? null,
    permissions: (employee.role?.permissions ?? []) as EmployeePermission[],
  };
}
