import { nextAvailableDate, defaultBookingTime } from './next-available-date.js';
import { clearUserPhone } from './db-reset.js';

const API_BASE = process.env.E2E_API_URL ?? 'http://localhost:3001';
const DEFAULT_PASSWORD = 'Password123';

type ApiSuccess<T> = {
  success: true;
  data: T;
};

type RegisterData = {
  accessToken: string;
  user: {
    id: string;
    name: string;
    role: string;
  };
};

type BusinessData = {
  id: string;
  slug: string;
  name: string;
};

type ServiceData = {
  id: string;
  name: string;
};

export type SeededUser = {
  id: string;
  accessToken: string;
  email: string;
  phone: string;
  password: string;
};

export type SeededOwnerBusiness = {
  owner: SeededUser;
  business: BusinessData;
  service: ServiceData;
  bookableDate: string;
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

async function parseJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T;
  if (!response.ok) {
    throw new Error(`API request failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

function authHeaders(accessToken: string, extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set('Authorization', `Bearer ${accessToken}`);
  headers.set('Content-Type', 'application/json');
  return headers;
}

function defaultAvailabilityDays() {
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    isActive: dayOfWeek !== 5,
    startTime: '09:00',
    endTime: '18:00',
  }));
}

export async function registerCustomer(
  overrides: Partial<{ name: string; email: string; phone: string; password: string }> = {},
): Promise<SeededUser> {
  const session = new ApiSession();
  const credentials = uniqueCredentials('customer');
  const payload = {
    name: overrides.name ?? 'לקוח בדיקה',
    phone: overrides.phone ?? credentials.phone,
    email: overrides.email ?? credentials.email,
    password: overrides.password ?? DEFAULT_PASSWORD,
    role: 'CUSTOMER',
  };

  const response = await session.withCsrf('/api/v1/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await parseJson<ApiSuccess<RegisterData>>(response);

  return {
    id: body.data.user.id,
    accessToken: body.data.accessToken,
    email: payload.email,
    phone: payload.phone,
    password: payload.password,
  };
}

export async function registerOwner(
  overrides: Partial<{ name: string; email: string; phone: string; password: string }> = {},
): Promise<SeededUser> {
  const session = new ApiSession();
  const credentials = uniqueCredentials('owner');
  const payload = {
    name: overrides.name ?? 'בעל עסק בדיקה',
    phone: overrides.phone ?? credentials.phone,
    email: overrides.email ?? credentials.email,
    password: overrides.password ?? DEFAULT_PASSWORD,
    role: 'BUSINESS_OWNER',
  };

  const response = await session.withCsrf('/api/v1/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await parseJson<ApiSuccess<RegisterData>>(response);

  return {
    id: body.data.user.id,
    accessToken: body.data.accessToken,
    email: payload.email,
    phone: payload.phone,
    password: payload.password,
  };
}

export async function seedOwnerWithBusiness(
  overrides: Partial<{
    businessName: string;
    serviceName: string;
    category: string;
    completeOnboarding: boolean;
    withService: boolean;
  }> = {},
): Promise<SeededOwnerBusiness> {
  const session = new ApiSession();
  const credentials = uniqueCredentials('owner');
  const password = DEFAULT_PASSWORD;
  const businessName = overrides.businessName ?? `עסק בדיקה ${Date.now()}`;

  const registerResponse = await session.withCsrf('/api/v1/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'בעל עסק בדיקה',
      phone: credentials.phone,
      email: credentials.email,
      password,
      role: 'BUSINESS_OWNER',
    }),
  });
  const registerBody = await parseJson<ApiSuccess<RegisterData>>(registerResponse);
  const accessToken = registerBody.data.accessToken;

  const businessResponse = await session.withCsrf('/api/v1/businesses', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      name: businessName,
      category: overrides.category ?? 'ספרות',
      address: 'רחוב הרצל 1, תל אביב',
      phone: credentials.phone,
    }),
  });
  const businessBody = await parseJson<ApiSuccess<BusinessData>>(businessResponse);

  const availabilityResponse = await session.withCsrf(
    `/api/v1/businesses/${businessBody.data.id}/availability`,
    {
      method: 'PUT',
      headers: authHeaders(accessToken),
      body: JSON.stringify({ days: defaultAvailabilityDays() }),
    },
  );
  await parseJson(availabilityResponse);

  const withService = overrides.withService !== false;
  let serviceBody: ApiSuccess<ServiceData> | null = null;

  if (withService) {
    const serviceResponse = await session.withCsrf(
      `/api/v1/businesses/${businessBody.data.id}/services`,
      {
        method: 'POST',
        headers: authHeaders(accessToken),
        body: JSON.stringify({
          name: overrides.serviceName ?? 'תספורת',
          durationMins: 30,
          price: 8000,
        }),
      },
    );
    serviceBody = await parseJson<ApiSuccess<ServiceData>>(serviceResponse);
  }

  if (overrides.completeOnboarding !== false) {
    const onboardingResponse = await session.withCsrf('/api/v1/businesses/onboarding/complete', {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({}),
    });
    await parseJson(onboardingResponse);
  }

  const loginResponse = await session.withCsrf('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: credentials.email,
      password,
      rememberMe: false,
    }),
  });
  const loginBody = await parseJson<ApiSuccess<RegisterData>>(loginResponse);
  const freshAccessToken = loginBody.data.accessToken;

  return {
    owner: {
      id: registerBody.data.user.id,
      accessToken: freshAccessToken,
      email: credentials.email,
      phone: credentials.phone,
      password,
    },
    business: businessBody.data,
    service: serviceBody?.data ?? { id: '', name: overrides.serviceName ?? 'תספורת' },
    bookableDate: nextAvailableDate(),
  };
}

export async function bookAppointmentViaApi(
  customer: SeededUser,
  slug: string,
  serviceId: string,
  date: string,
  time = defaultBookingTime(date),
): Promise<void> {
  const session = new ApiSession();
  const response = await session.withCsrf(`/api/v1/appointments/${slug}/book`, {
    method: 'POST',
    headers: authHeaders(customer.accessToken),
    body: JSON.stringify({ serviceId, date, time }),
  });
  await parseJson(response);
}

type AppointmentData = {
  id: string;
  status: string;
  businessName?: string;
};

export async function cancelAppointmentViaApi(
  user: SeededUser,
  appointmentId: string,
): Promise<AppointmentData> {
  const session = new ApiSession();
  const response = await session.withCsrf(`/api/v1/appointments/${appointmentId}/cancel`, {
    method: 'PATCH',
    headers: authHeaders(user.accessToken),
  });
  const body = await parseJson<ApiSuccess<AppointmentData>>(response);
  return body.data;
}

export async function resolveLateCancellationViaApi(
  owner: SeededUser,
  appointmentId: string,
  approved: boolean,
): Promise<AppointmentData> {
  const session = new ApiSession();
  const response = await session.withCsrf(
    `/api/v1/appointments/${appointmentId}/late-cancel-decision`,
    {
      method: 'PATCH',
      headers: authHeaders(owner.accessToken),
      body: JSON.stringify({ approved }),
    },
  );
  const body = await parseJson<ApiSuccess<AppointmentData>>(response);
  return body.data;
}

export async function getMyAppointmentsViaApi(
  user: SeededUser,
): Promise<{ upcoming: AppointmentData[]; past: AppointmentData[] }> {
  const session = new ApiSession();
  const response = await session.request('/api/v1/appointments/me/upcoming', {
    headers: authHeaders(user.accessToken),
  });
  const body = await parseJson<ApiSuccess<{ upcoming: AppointmentData[]; past: AppointmentData[] }>>(
    response,
  );
  return body.data;
}

export async function likeBusinessViaApi(customer: SeededUser, slug: string): Promise<void> {
  const session = new ApiSession();
  const response = await session.withCsrf(`/api/v1/businesses/${slug}/likes`, {
    method: 'POST',
    headers: authHeaders(customer.accessToken),
  });
  await parseJson(response);
}

type EngagementData = {
  likeCount: number;
  commentCount: number;
  score: number;
  positiveCount?: number;
  negativeCount?: number;
  neutralCount?: number;
};

type CategoryRankingsData = {
  category: string;
  businesses: Array<{
    slug: string;
    score: number;
    positiveCount?: number;
    negativeCount?: number;
  }>;
};

export async function getEngagementViaApi(slug: string, accessToken?: string): Promise<EngagementData> {
  const session = new ApiSession();
  const response = await session.request(`/api/v1/businesses/${slug}/engagement`, {
    headers: accessToken ? authHeaders(accessToken) : undefined,
  });
  const body = await parseJson<ApiSuccess<EngagementData>>(response);
  return body.data;
}

export async function getBusinessRankingScoreViaApi(
  slug: string,
  category: string,
): Promise<number | null> {
  const session = new ApiSession();
  const response = await session.request('/api/v1/businesses/rankings');
  const body = await parseJson<ApiSuccess<CategoryRankingsData[]>>(response);
  const categoryRankings = body.data.find((ranking) => ranking.category === category);
  const business = categoryRankings?.businesses.find((entry) => entry.slug === slug);
  return business?.score ?? null;
}

export async function registerCustomerNeedingPhoneCompletion(): Promise<SeededUser> {
  const session = new ApiSession();
  const credentials = uniqueCredentials('google-customer');
  const payload = {
    name: 'לקוח Google',
    phone: credentials.phone,
    email: credentials.email,
    password: DEFAULT_PASSWORD,
    role: 'CUSTOMER',
  };

  const registerResponse = await session.withCsrf('/api/v1/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const registerBody = await parseJson<ApiSuccess<RegisterData>>(registerResponse);
  await clearUserPhone(registerBody.data.user.id);

  const refreshResponse = await session.withCsrf('/api/v1/auth/refresh', {
    method: 'POST',
  });
  const refreshBody = await parseJson<ApiSuccess<RegisterData>>(refreshResponse);

  return {
    id: registerBody.data.user.id,
    accessToken: refreshBody.data.accessToken,
    email: payload.email,
    phone: credentials.phone,
    password: payload.password,
  };
}

export { nextAvailableDate };
