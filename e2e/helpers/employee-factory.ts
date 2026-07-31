import { setBusinessPro } from './db-reset.js';
import {
  seedOwnerWithBusiness,
  type SeededOwnerBusiness,
  type SeededUser,
} from './seed-via-api.js';

const API_BASE = process.env.E2E_API_URL ?? 'http://localhost:3001';
const DEFAULT_PASSWORD = 'Password123';

export type EmployeePermissionCode =
  | 'VIEW_APPOINTMENTS'
  | 'CANCEL_APPOINTMENTS'
  | 'CALENDAR_BLOCK_HOURS'
  | 'CALENDAR_SET_BREAK'
  | 'CALENDAR_BOOK_APPOINTMENT'
  | 'BROADCAST_MESSAGE'
  | 'EDIT_BUSINESS_MEDIA'
  | 'EDIT_BUSINESS_SOCIAL'
  | 'EDIT_BUSINESS_PROFILE'
  | 'EDIT_BUSINESS_SCHEDULE'
  | 'MANAGE_SERVICES'
  | 'EDIT_CANCELLATION_POLICY';

type ApiSuccess<T> = {
  success: true;
  data: T;
};

type ApiFailure = {
  success: false;
  error: { code?: string; message?: string };
};

type EmployeeRoleData = {
  id: string;
  name: string;
  permissions: EmployeePermissionCode[];
};

type CreateEmployeeData = {
  id: string;
  name: string;
  roleId: string | null;
  roleName: string | null;
  inviteUrl: string;
};

type EmployeeContextData = {
  businessId: string;
  businessName: string;
  roleName: string | null;
  permissions: EmployeePermissionCode[];
};

type RegisterData = {
  accessToken: string;
  user: { id: string; role: string };
};

class ApiSession {
  private cookies = new Map<string, string>();

  private storeCookies(response: Response): void {
    const rawCookies = response.headers.getSetCookie?.() ?? [];
    for (const cookie of rawCookies) {
      const [pair] = cookie.split(';');
      const separatorIndex = pair.indexOf('=');
      if (separatorIndex === -1) continue;
      const name = pair.slice(0, separatorIndex).trim();
      const value = pair.slice(separatorIndex + 1).trim();
      this.cookies.set(name, value);
    }
  }

  private cookieHeader(): string {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    const cookieHeader = this.cookieHeader();
    if (cookieHeader) {
      headers.set('Cookie', cookieHeader);
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
    });
    this.storeCookies(response);
    return response;
  }

  async withCsrf(path: string, init: RequestInit = {}): Promise<Response> {
    const csrfResponse = await this.request('/api/v1/csrf');
    const csrfBody = (await csrfResponse.json()) as ApiSuccess<{ csrfToken: string }>;
    const headers = new Headers(init.headers);
    headers.set('X-CSRF-Token', csrfBody.data.csrfToken);
    return this.request(path, { ...init, headers });
  }
}

function uniqueCredentials(prefix: string): { email: string; phone: string } {
  const stamp = Date.now().toString();
  return {
    email: `${prefix}-${stamp}@e2e.test`,
    phone: `05${stamp.slice(-8)}`,
  };
}

function authHeaders(accessToken: string, extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set('Authorization', `Bearer ${accessToken}`);
  headers.set('Content-Type', 'application/json');
  return headers;
}

async function parseJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T;
  if (!response.ok) {
    throw new Error(`API request failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

function extractInviteToken(inviteUrl: string): string {
  const token = new URL(inviteUrl).searchParams.get('token');
  if (!token) {
    throw new Error(`Invite URL missing token: ${inviteUrl}`);
  }
  return token;
}

export async function createEmployeeRoleViaApi(
  owner: SeededUser,
  businessId: string,
  name: string,
  permissions: EmployeePermissionCode[],
): Promise<EmployeeRoleData> {
  const session = new ApiSession();
  const response = await session.withCsrf(`/api/v1/businesses/${businessId}/employee-roles`, {
    method: 'POST',
    headers: authHeaders(owner.accessToken),
    body: JSON.stringify({ name, permissions }),
  });
  const body = await parseJson<ApiSuccess<EmployeeRoleData>>(response);
  return body.data;
}

export async function createEmployeeViaApi(
  owner: SeededUser,
  businessId: string,
  roleId: string,
  overrides: Partial<{ name: string; phone: string; email: string }> = {},
): Promise<CreateEmployeeData> {
  const session = new ApiSession();
  const credentials = uniqueCredentials('employee');
  const response = await session.withCsrf(`/api/v1/businesses/${businessId}/employees`, {
    method: 'POST',
    headers: authHeaders(owner.accessToken),
    body: JSON.stringify({
      name: overrides.name ?? 'עובד בדיקה',
      phone: overrides.phone ?? credentials.phone,
      email: overrides.email ?? credentials.email,
      roleId,
    }),
  });
  const body = await parseJson<ApiSuccess<CreateEmployeeData>>(response);
  return body.data;
}

export async function activateEmployeeViaApi(
  inviteUrl: string,
  password = DEFAULT_PASSWORD,
): Promise<SeededUser> {
  const session = new ApiSession();
  const response = await session.withCsrf('/api/v1/auth/activate-employee', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: extractInviteToken(inviteUrl),
      password,
      confirmPassword: password,
    }),
  });
  const body = await parseJson<ApiSuccess<RegisterData>>(response);
  return {
    id: body.data.user.id,
    accessToken: body.data.accessToken,
    email: '',
    phone: '',
    password,
  };
}

export async function getEmployeeContextViaApi(accessToken: string): Promise<EmployeeContextData> {
  const session = new ApiSession();
  const response = await session.request('/api/v1/employees/me', {
    headers: authHeaders(accessToken),
  });
  const body = await parseJson<ApiSuccess<EmployeeContextData>>(response);
  return body.data;
}

export async function deleteEmployeeRoleViaApi(
  owner: SeededUser,
  roleId: string,
): Promise<{ ok: boolean; status: number; body: ApiSuccess<{ deleted: boolean }> | ApiFailure }> {
  const session = new ApiSession();
  const response = await session.withCsrf(`/api/v1/employee-roles/${roleId}`, {
    method: 'DELETE',
    headers: authHeaders(owner.accessToken),
  });
  const body = (await response.json()) as ApiSuccess<{ deleted: boolean }> | ApiFailure;
  return { ok: response.ok, status: response.status, body };
}

export async function patchBusinessViaApi(
  accessToken: string,
  businessId: string,
  data: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const session = new ApiSession();
  const response = await session.withCsrf(`/api/v1/businesses/${businessId}`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify(data),
  });
  const body = await response.json();
  return { ok: response.ok, status: response.status, body };
}

export type SeededEmployeeSetup = SeededOwnerBusiness & {
  role: EmployeeRoleData;
  employeeRecord: CreateEmployeeData;
  employee: SeededUser;
};

export async function seedProBusinessWithEmployee(
  permissions: EmployeePermissionCode[],
  options: Partial<{
    roleName: string;
    employeeName: string;
    businessName: string;
  }> = {},
): Promise<SeededEmployeeSetup> {
  const seeded = await seedOwnerWithBusiness({
    completeOnboarding: true,
    businessName: options.businessName,
  });
  await setBusinessPro(seeded.business.id);

  const role = await createEmployeeRoleViaApi(
    seeded.owner,
    seeded.business.id,
    options.roleName ?? 'תפקיד בדיקה',
    permissions,
  );

  const employeeRecord = await createEmployeeViaApi(
    seeded.owner,
    seeded.business.id,
    role.id,
    { name: options.employeeName ?? 'עובד בדיקה' },
  );

  const employee = await activateEmployeeViaApi(employeeRecord.inviteUrl);

  return {
    ...seeded,
    role,
    employeeRecord,
    employee,
  };
}
