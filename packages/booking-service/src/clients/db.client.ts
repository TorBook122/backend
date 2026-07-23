import {
  internalDelete,
  internalGet,
  internalPatch,
  internalPost,
  internalPut,
  ServiceRequestError,
} from '@torbook/shared/server/http-client';
import type { CommentSentiment } from '@torbook/shared';
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
  passwordHash: string | null;
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
  bannerUrl: string | null;
  notes: string | null;
  address: string | null;
  latitude?: number | null;
  longitude?: number | null;
  instagramUrl: string | null;
  whatsappUrl: string | null;
  facebookUrl: string | null;
  tiktokUrl: string | null;
  phoneEnc: string;
  cancellationWindowHours: number;
  isPro: boolean;
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
      dbGet<Array<{
        id: string;
        name: string;
        slug: string;
        category: string | null;
        instagramUrl: string | null;
        whatsappUrl: string | null;
        facebookUrl: string | null;
        tiktokUrl: string | null;
        isPro: boolean;
        bannerUrl: string | null;
        logoUrl: string | null;
        services: Array<{ id: string; name: string; price: number }>;
      }>>(
        query ? `/businesses?q=${encodeURIComponent(query)}` : '/businesses',
      ),
    listMapLocations: () =>
      dbGet<Array<{
        id: string;
        name: string;
        slug: string;
        category: string | null;
        address: string;
        logoUrl: string | null;
        latitude: number;
        longitude: number;
      }>>('/businesses/map'),
    listGeocodePending: () =>
      dbGet<Array<{ id: string; address: string }>>('/businesses/geocode-pending'),
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
    getRankings: (categories: string[]) =>
      dbGet<Array<{
        category: string;
        businesses: Array<{
          id: string;
          name: string;
          slug: string;
          category: string | null;
          likeCount: number;
          commentCount: number;
          positiveCount: number;
          negativeCount: number;
          neutralCount: number;
          score: number;
        }>;
      }>>(`/businesses/rankings?categories=${encodeURIComponent(categories.join(','))}`),
  },

  likes: {
    upsert: (userId: string, businessId: string) =>
      dbPost<{ id: string }>('/likes/upsert', { userId, businessId }),
    remove: (userId: string, businessId: string) =>
      dbDelete<{ removed: boolean }>(
        `/likes/user/${encodeURIComponent(userId)}/business/${encodeURIComponent(businessId)}`,
      ),
    count: (businessId: string) =>
      dbGet<{ count: number }>(`/likes/business/${encodeURIComponent(businessId)}/count`),
    exists: (userId: string, businessId: string) =>
      dbGet<{ exists: boolean }>(
        `/likes/user/${encodeURIComponent(userId)}/business/${encodeURIComponent(businessId)}/exists`,
      ),
  },

  comments: {
    listByBusiness: (businessId: string, userId?: string) => {
      const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
      return dbGet<Array<{
        id: string;
        text: string;
        sentiment: CommentSentiment;
        authorName: string;
        appointmentId: string;
        serviceName: string;
        visitDate: string;
        createdAt: string;
        updatedAt: string;
        isMine?: boolean;
      }>>(`/comments/business/${encodeURIComponent(businessId)}${qs}`);
    },
    count: (businessId: string) =>
      dbGet<{ count: number }>(`/comments/business/${encodeURIComponent(businessId)}/count`),
    sentimentCounts: (businessId: string) =>
      dbGet<{ positive: number; negative: number; neutral: number; total: number }>(
        `/comments/business/${encodeURIComponent(businessId)}/sentiment-counts`,
      ),
    listCommentable: (userId: string, businessId: string) =>
      dbGet<Array<{
        id: string;
        serviceName: string;
        startsAt: string;
        endsAt: string;
      }>>(
        `/comments/commentable/user/${encodeURIComponent(userId)}/business/${encodeURIComponent(businessId)}`,
      ),
    create: (userId: string, businessId: string, appointmentId: string, text: string, sentiment: CommentSentiment) =>
      dbPost<{
        id: string;
        text: string;
        sentiment: CommentSentiment;
        authorName: string;
        appointmentId: string;
        serviceName: string;
        visitDate: string;
        createdAt: string;
        updatedAt: string;
        isMine?: boolean;
      }>('/comments/create', { userId, businessId, appointmentId, text, sentiment }),
    update: (commentId: string, userId: string, text: string, sentiment: CommentSentiment) =>
      dbPut<{
        id: string;
        text: string;
        sentiment: CommentSentiment;
        authorName: string;
        appointmentId: string;
        serviceName: string;
        visitDate: string;
        createdAt: string;
        updatedAt: string;
        isMine?: boolean;
      }>(`/comments/${encodeURIComponent(commentId)}`, { userId, text, sentiment }),
    remove: (commentId: string, userId: string) =>
      dbDelete<{ deleted: boolean }>(
        `/comments/${encodeURIComponent(commentId)}/user/${encodeURIComponent(userId)}`,
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

  employees: {
    listByBusiness: (businessId: string) =>
      dbGet<
        Array<{
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
        }>
      >(`/employees/business/${encodeURIComponent(businessId)}`),
    countByBusiness: (businessId: string) =>
      dbGet<{ count: number }>(`/employees/business/${encodeURIComponent(businessId)}/count`),
    findByUserId: (userId: string) =>
      dbGet<{
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
        business: { id: string; name: string };
        user: { passwordHash: string | null } | null;
        role: { id: string; name: string; permissions: string[] } | null;
      }>(`/employees/user/${encodeURIComponent(userId)}`),
    findById: (id: string) =>
      dbGet<{
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
        business: DbBusiness;
        user: { passwordHash: string | null } | null;
        role: { id: string; name: string; permissions: string[] } | null;
      }>(`/employees/${encodeURIComponent(id)}`),
    create: (
      businessId: string,
      data: {
        name: string;
        phoneEnc: string;
        emailEnc: string;
        title?: string | null;
        userId?: string | null;
        roleId?: string | null;
        inviteTokenHash?: string | null;
        inviteExpiresAt?: string | null;
      },
    ) =>
      dbPost<{
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
      }>(`/employees/business/${encodeURIComponent(businessId)}`, data),
    update: (
      id: string,
      data: Partial<{
        name: string;
        phoneEnc: string;
        emailEnc: string;
        title: string | null;
        roleId: string | null;
        inviteTokenHash: string | null;
        inviteExpiresAt: string | null;
      }>,
    ) =>
      dbPatch<{
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
      }>(`/employees/${encodeURIComponent(id)}`, data),
    delete: (id: string) => dbDelete<{ deleted: boolean }>(`/employees/${encodeURIComponent(id)}`),
  },

  employeeRoles: {
    listByBusiness: (businessId: string) =>
      dbGet<Array<{ id: string; businessId: string; name: string; permissions: string[] }>>(
        `/employee-roles/business/${encodeURIComponent(businessId)}`,
      ),
    countByBusiness: (businessId: string) =>
      dbGet<{ count: number }>(`/employee-roles/business/${encodeURIComponent(businessId)}/count`),
    findById: (id: string) =>
      dbGet<{ id: string; businessId: string; name: string; permissions: string[]; business: DbBusiness }>(
        `/employee-roles/${encodeURIComponent(id)}`,
      ),
    create: (businessId: string, data: { name: string; permissions: string[] }) =>
      dbPost<{ id: string; businessId: string; name: string; permissions: string[] }>(
        `/employee-roles/business/${encodeURIComponent(businessId)}`,
        data,
      ),
    update: (id: string, data: Partial<{ name: string; permissions: string[] }>) =>
      dbPatch<{ id: string; businessId: string; name: string; permissions: string[] }>(
        `/employee-roles/${encodeURIComponent(id)}`,
        data,
      ),
    delete: (id: string) => dbDelete<{ deleted: boolean }>(`/employee-roles/${encodeURIComponent(id)}`),
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
