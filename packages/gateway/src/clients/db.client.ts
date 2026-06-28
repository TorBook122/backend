import {
  internalDelete,
  internalGet,
  internalPatch,
  internalPost,
  internalPut,
  ServiceRequestError,
} from '@torbook/shared/server/http-client';
import { AppError } from '../utils/app-error.js';

function getBaseUrl(): string {
  const url = process.env.DB_SERVICE_URL?.trim();
  if (!url) {
    throw new Error('DB_SERVICE_URL is required');
  }
  return url;
}

function rethrowServiceError(error: unknown): never {
  if (error instanceof ServiceRequestError) {
    throw new AppError(
      error.status,
      error.code ?? 'SERVICE_ERROR',
      error.message,
      error.details as Record<string, unknown> | undefined,
    );
  }
  throw error;
}

async function dbGet<T>(path: string): Promise<T> {
  try {
    return await internalGet<T>(getBaseUrl(), path);
  } catch (error) {
    rethrowServiceError(error);
  }
}

async function dbPost<T>(path: string, body: unknown): Promise<T> {
  try {
    return await internalPost<T>(getBaseUrl(), path, body);
  } catch (error) {
    rethrowServiceError(error);
  }
}

async function dbPatch<T>(path: string, body: unknown): Promise<T> {
  try {
    return await internalPatch<T>(getBaseUrl(), path, body);
  } catch (error) {
    rethrowServiceError(error);
  }
}

async function dbPut<T>(path: string, body: unknown): Promise<T> {
  try {
    return await internalPut<T>(getBaseUrl(), path, body);
  } catch (error) {
    rethrowServiceError(error);
  }
}

async function dbDelete<T>(path: string): Promise<T> {
  try {
    return await internalDelete<T>(getBaseUrl(), path);
  } catch (error) {
    rethrowServiceError(error);
  }
}

export type DbUser = {
  id: string;
  name: string;
  role: string;
  emailEnc: string | null;
  emailHash: string | null;
  phoneEnc: string;
  phoneHash: string;
  passwordHash: string;
  onboardingCompletedAt: Date | string | null;
  deletedAt: Date | string | null;
};

export type DbBusiness = {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  category: string | null;
  logoUrl: string | null;
  phoneEnc: string;
  cancellationWindowHours: number;
  deletedAt: Date | string | null;
  availability?: Array<{ dayOfWeek: number; isActive: boolean; startTime: string; endTime: string }>;
  breakBlocks?: Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
  services?: Array<{ id: string; name: string; durationMins: number; price: number; isVisible: boolean }>;
};

export type DbAppointment = {
  id: string;
  businessId: string;
  customerId: string;
  serviceId: string;
  startsAt: string;
  endsAt: string;
  status: string;
  business?: { name: string; slug: string; ownerId?: string; cancellationWindowHours?: number };
  service?: { name: string; durationMins: number };
  customer?: { name: string };
};

export const dbClient = {
  users: {
    findById: (id: string) => dbGet<DbUser>(`/users/${encodeURIComponent(id)}`),
    findByPhoneHash: (phoneHash: string) =>
      dbGet<DbUser | null>(`/users/lookup/by-phone-hash/${encodeURIComponent(phoneHash)}`),
    findByEmailHash: (emailHash: string) =>
      dbGet<DbUser | null>(`/users/lookup/by-email-hash/${encodeURIComponent(emailHash)}`),
    lookup: (isEmail: boolean, hash: string) =>
      dbPost<DbUser | null>('/users/lookup', { isEmail, hash }),
    create: (data: Record<string, unknown>) => dbPost<DbUser>('/users', data),
    update: (id: string, data: Record<string, unknown>) =>
      dbPatch<DbUser>(`/users/${encodeURIComponent(id)}`, data),
    listAdmin: () => dbGet<Array<{ id: string; name: string; emailEnc: string | null; role: string; createdAt: string; deletedAt: string | null }>>('/users'),
    softDelete: (id: string) => dbPost<DbUser>(`/users/${encodeURIComponent(id)}/soft-delete`, {}),
    gdprDelete: (id: string) => dbPost<{ gdprDeleted: boolean }>(`/users/${encodeURIComponent(id)}/gdpr-delete`, {}),
    completeOnboarding: (id: string) =>
      dbPost<DbUser>(`/users/${encodeURIComponent(id)}/complete-onboarding`, {}),
  },

  businesses: {
    findBySlug: (slug: string, include?: 'full') =>
      dbGet<DbBusiness>(`/businesses/slug/${encodeURIComponent(slug)}${include ? '?include=full' : ''}`),
    slugExists: (slug: string) =>
      dbGet<{ exists: boolean }>(`/businesses/slug/${encodeURIComponent(slug)}/exists`),
    findByOwnerId: (ownerId: string) =>
      dbGet<DbBusiness | null>(`/businesses/owner/${encodeURIComponent(ownerId)}`),
    findById: (id: string, include?: 'full') =>
      dbGet<DbBusiness>(`/businesses/${encodeURIComponent(id)}${include ? '?include=full' : ''}`),
    listPublic: (query?: string) =>
      dbGet<Array<{ id: string; name: string; slug: string; category: string | null }>>(
        query ? `/businesses?q=${encodeURIComponent(query)}` : '/businesses',
      ),
    listAdmin: () => dbGet<Array<{ id: string; name: string; slug: string; category: string | null; createdAt: string; deletedAt: string | null }>>('/businesses?admin=true'),
    create: (data: Record<string, unknown>) => dbPost<DbBusiness>('/businesses', data),
    update: (id: string, data: Record<string, unknown>) =>
      dbPatch<DbBusiness>(`/businesses/${encodeURIComponent(id)}`, data),
    countFutureAppointments: (id: string) =>
      dbGet<{ count: number }>(`/businesses/${encodeURIComponent(id)}/future-appointments-count`),
    updateAvailability: (id: string, days: unknown[]) =>
      dbPut<Array<{ dayOfWeek: number; isActive: boolean; startTime: string; endTime: string }>>(
        `/businesses/${encodeURIComponent(id)}/availability`,
        { days },
      ),
    updateBreaks: (id: string, breaks: unknown[]) =>
      dbPut<Array<{ dayOfWeek: number; startTime: string; endTime: string }>>(
        `/businesses/${encodeURIComponent(id)}/breaks`,
        { breaks },
      ),
  },

  services: {
    findById: (id: string) => dbGet<{ id: string; name: string; durationMins: number; price: number; isVisible: boolean; business: DbBusiness }>(`/services/${encodeURIComponent(id)}`),
    findVisible: (businessId: string, serviceId: string) =>
      dbGet<{ id: string; name: string; durationMins: number; price: number; isVisible: boolean } | null>(
        `/services/business/${encodeURIComponent(businessId)}/visible/${encodeURIComponent(serviceId)}`,
      ),
    listByBusiness: (businessId: string) =>
      dbGet<Array<{ id: string; name: string; durationMins: number; price: number; isVisible: boolean }>>(
        `/services/business/${encodeURIComponent(businessId)}`,
      ),
    create: (businessId: string, data: Record<string, unknown>) =>
      dbPost<{ id: string; name: string; durationMins: number; price: number; isVisible: boolean }>(
        `/services/business/${encodeURIComponent(businessId)}`,
        data,
      ),
    update: (id: string, data: Record<string, unknown>) =>
      dbPatch<{ id: string; name: string; durationMins: number; price: number; isVisible: boolean }>(
        `/services/${encodeURIComponent(id)}`,
        data,
      ),
    delete: (id: string) => dbDelete<{ deleted: boolean }>(`/services/${encodeURIComponent(id)}`),
    findFutureAppointment: (id: string) =>
      dbGet<DbAppointment | null>(`/services/${encodeURIComponent(id)}/future-appointment`),
  },

  appointments: {
    findById: (id: string, include?: 'full') =>
      dbGet<DbAppointment>(`/appointments/${encodeURIComponent(id)}${include ? '?include=full' : ''}`),
    book: (data: Record<string, unknown>) => dbPost<DbAppointment>('/appointments/book', data),
    update: (id: string, data: Record<string, unknown>) =>
      dbPatch<DbAppointment>(`/appointments/${encodeURIComponent(id)}`, data),
    findByCustomer: (customerId: string) =>
      dbGet<DbAppointment[]>(`/appointments/customer/${encodeURIComponent(customerId)}`),
    findByBusiness: (businessId: string, startDate?: string, endDate?: string, excludeCancelled?: boolean) => {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (excludeCancelled) params.set('excludeCancelled', 'true');
      const qs = params.toString();
      return dbGet<DbAppointment[]>(
        `/appointments/business/${encodeURIComponent(businessId)}${qs ? `?${qs}` : ''}`,
      );
    },
    findForDay: (businessId: string, dayStart: string, dayEnd: string) =>
      dbGet<Array<{ startsAt: string; endsAt: string }>>(
        `/appointments/business/${encodeURIComponent(businessId)}/day?dayStart=${encodeURIComponent(dayStart)}&dayEnd=${encodeURIComponent(dayEnd)}`,
      ),
    findFutureByCustomer: (customerId: string, statuses: string[]) =>
      dbGet<DbAppointment[]>(
        `/appointments/customer/${encodeURIComponent(customerId)}/future?statuses=${statuses.join(',')}`,
      ),
  },

  timeBlocks: {
    list: (businessId: string, startDate?: string, endDate?: string) => {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      const qs = params.toString();
      return dbGet<Array<{ id: string; startsAt: string; endsAt: string; note: string | null }>>(
        `/appointments/time-blocks/business/${encodeURIComponent(businessId)}${qs ? `?${qs}` : ''}`,
      );
    },
    listForDay: (businessId: string, dayStart: string, dayEnd: string) =>
      dbGet<Array<{ startsAt: string; endsAt: string }>>(
        `/appointments/time-blocks/business/${encodeURIComponent(businessId)}/day?dayStart=${encodeURIComponent(dayStart)}&dayEnd=${encodeURIComponent(dayEnd)}`,
      ),
    create: (data: Record<string, unknown>) =>
      dbPost<{ id: string; startsAt: string; endsAt: string; note: string | null }>('/appointments/time-blocks', data),
    delete: (businessId: string, blockId: string) =>
      dbDelete<{ id: string; startsAt: string; endsAt: string; note: string | null }>(
        `/appointments/time-blocks/${encodeURIComponent(blockId)}?businessId=${encodeURIComponent(businessId)}`,
      ),
  },

  favorites: {
    list: (userId: string) =>
      dbGet<Array<{ id: string; businessId: string; business: DbBusiness }>>(`/favorites/user/${encodeURIComponent(userId)}`),
    exists: (userId: string, businessId: string) =>
      dbGet<{ exists: boolean }>(`/favorites/user/${encodeURIComponent(userId)}/business/${encodeURIComponent(businessId)}/exists`),
    upsert: (userId: string, businessId: string) =>
      dbPost<{ id: string; businessId: string; business: DbBusiness }>('/favorites/upsert', { userId, businessId }),
    remove: (userId: string, businessId: string) =>
      dbDelete<{ removed: boolean }>(`/favorites/user/${encodeURIComponent(userId)}/business/${encodeURIComponent(businessId)}`),
  },

  fcmTokens: {
    upsert: (userId: string, token: string) =>
      dbPost<{ registered: boolean }>('/fcm-tokens/upsert', { userId, token }),
    remove: (userId: string, token: string) =>
      dbDelete<{ removed: boolean }>(`/fcm-tokens/user/${encodeURIComponent(userId)}?token=${encodeURIComponent(token)}`),
  },

  auditLogs: {
    create: (data: { action: string; userId?: string | null; ipAddress?: string | null; metadata?: unknown }) =>
      dbPost('/audit-logs', data),
  },
};
