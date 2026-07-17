import { API_ERROR_CODES, UserRole, type AvailabilityDay, type BreakBlockDto, type BusinessListItem, type BusinessMapLocationDto, type BusinessOwner, type BusinessPublic, type ServiceDto } from '@torbook/shared';
import { dbClient, type DbBusiness } from '../clients/db.client.js';
import { sharedClient } from '../clients/shared.client.js';
import { AppError } from '../utils/app-error.js';
import type {
  CreateBusinessBody,
  CreateServiceBody,
  UpdateAvailabilityBody,
  UpdateBreaksBody,
  UpdateBusinessBody,
  UpdateServiceBody,
} from '../validators/business.validator.js';
import { resolveBusinessCoordinates } from './nominatim.service.js';

function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^\w\s\u0590-\u05FF-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return base || 'business';
}

async function uniqueSlug(name: string): Promise<string> {
  let slug = slugify(name);
  let attempt = 0;
  while (attempt < 20) {
    const candidate = attempt === 0 ? slug : `${slug}-${attempt}`;
    const existing = await dbClient.businesses.slugExists(candidate);
    if (!existing.exists) return candidate;
    attempt += 1;
  }
  return `${slug}-${Date.now()}`;
}

function parseTime(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function toServiceDto(s: { id: string; name: string; durationMins: number; price: number; isVisible: boolean }): ServiceDto {
  return { id: s.id, name: s.name, durationMins: s.durationMins, price: s.price, isVisible: s.isVisible };
}

async function getBusinessOrThrow(businessId: string): Promise<DbBusiness> {
  try {
    return await dbClient.businesses.findById(businessId, 'full');
  } catch {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'עסק לא נמצא');
  }
}

async function assertOwner(businessId: string, userId: string) {
  const business = await getBusinessOrThrow(businessId);
  if (business.ownerId !== userId) {
    throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'אין הרשאה לעסק זה');
  }
  return business;
}

function assertPro(business: DbBusiness) {
  if (!business.isPro) {
    throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'פיצ\'ר זמין למנוי Plus בלבד');
  }
}

function needsGeocoding(business: DbBusiness): boolean {
  const address = business.address?.trim();
  return Boolean(address && (business.latitude == null || business.longitude == null));
}

async function resolveCoordinatesForSave(
  business: DbBusiness,
  input: UpdateBusinessBody,
): Promise<{ latitude: number | null; longitude: number | null } | undefined> {
  if (input.address !== undefined) {
    return resolveBusinessCoordinates(input.address ?? '');
  }
  if (needsGeocoding(business)) {
    return resolveBusinessCoordinates(business.address!.trim());
  }
  return undefined;
}

async function ensureBusinessCoordinates(business: DbBusiness): Promise<DbBusiness> {
  if (!needsGeocoding(business)) return business;

  const coordinates = await resolveBusinessCoordinates(business.address!.trim());
  if (!coordinates || coordinates.latitude == null) return business;

  return dbClient.businesses.update(business.id, coordinates);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toPublic(business: DbBusiness): BusinessPublic {
  return {
    id: business.id,
    name: business.name,
    slug: business.slug,
    category: business.category,
    logoUrl: business.logoUrl,
    bannerUrl: business.isPro ? business.bannerUrl : null,
    notes: business.notes ?? null,
    address: business.address ?? null,
    instagramUrl: business.instagramUrl ?? null,
    whatsappUrl: business.whatsappUrl ?? null,
    facebookUrl: business.facebookUrl ?? null,
    tiktokUrl: business.tiktokUrl ?? null,
    cancellationWindowHours: business.cancellationWindowHours,
    availability: (business.availability ?? []).map((a) => ({
      dayOfWeek: a.dayOfWeek,
      isActive: a.isActive,
      startTime: a.startTime,
      endTime: a.endTime,
    })),
    breaks: (business.breakBlocks ?? []).map((b) => ({
      dayOfWeek: b.dayOfWeek,
      startTime: b.startTime,
      endTime: b.endTime,
    })),
    services: (business.services ?? []).map(toServiceDto),
  };
}

export async function createBusiness(userId: string, input: CreateBusinessBody): Promise<BusinessOwner> {
  const existing = await dbClient.businesses.findByOwnerId(userId);
  if (existing) {
    throw new AppError(409, API_ERROR_CODES.CONFLICT, 'כבר קיים עסק לחשבון זה');
  }

  const slug = await uniqueSlug(input.name);
  const coordinates = await resolveBusinessCoordinates(input.address.trim());
  const business = await dbClient.businesses.create({
    ownerId: userId,
    name: input.name,
    slug,
    category: input.category ?? null,
    address: input.address.trim(),
    ...(coordinates ?? {}),
    ...(input.instagramUrl !== undefined ? { instagramUrl: input.instagramUrl } : {}),
    ...(input.whatsappUrl !== undefined ? { whatsappUrl: input.whatsappUrl } : {}),
    ...(input.facebookUrl !== undefined ? { facebookUrl: input.facebookUrl } : {}),
    ...(input.tiktokUrl !== undefined ? { tiktokUrl: input.tiktokUrl } : {}),
    phoneEnc: await sharedClient.encryptPii(await sharedClient.normalizePhone(input.phone)),
  });

  return {
    ...toPublic(business),
    phone: input.phone,
    isPro: business.isPro,
  };
}

export async function updateBusiness(
  businessId: string,
  userId: string,
  input: UpdateBusinessBody,
): Promise<BusinessOwner> {
  const business = await assertOwner(businessId, userId);
  if (input.bannerUrl !== undefined) {
    assertPro(business);
  }
  const coordinates = await resolveCoordinatesForSave(business, input);

  const updated = await dbClient.businesses.update(business.id, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.category !== undefined ? { category: input.category } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    ...(input.address !== undefined ? { address: input.address } : {}),
    ...(input.instagramUrl !== undefined ? { instagramUrl: input.instagramUrl } : {}),
    ...(input.whatsappUrl !== undefined ? { whatsappUrl: input.whatsappUrl } : {}),
    ...(input.facebookUrl !== undefined ? { facebookUrl: input.facebookUrl } : {}),
    ...(input.tiktokUrl !== undefined ? { tiktokUrl: input.tiktokUrl } : {}),
    ...(coordinates ?? {}),
    ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
    ...(input.bannerUrl !== undefined ? { bannerUrl: input.bannerUrl } : {}),
    ...(input.phone !== undefined
      ? { phoneEnc: await sharedClient.encryptPii(await sharedClient.normalizePhone(input.phone)) }
      : {}),
    ...(input.cancellationWindowHours !== undefined
      ? { cancellationWindowHours: input.cancellationWindowHours }
      : {}),
  });

  return {
    ...toPublic(updated),
    phone: input.phone ?? (await sharedClient.decryptPii(updated.phoneEnc)),
    isPro: updated.isPro,
  };
}

export async function listPublicBusinesses(query?: string): Promise<BusinessListItem[]> {
  const businesses = await dbClient.businesses.listPublic(query);
  return businesses.map(({ isPro, bannerUrl, ...rest }) => ({
    ...rest,
    isPro,
    bannerUrl: isPro ? bannerUrl : null,
  }));
}

export async function listMapLocations(): Promise<BusinessMapLocationDto[]> {
  const pending = await dbClient.businesses.listGeocodePending();
  for (const business of pending) {
    const coordinates = await resolveBusinessCoordinates(business.address);
    if (coordinates?.latitude != null) {
      await dbClient.businesses.update(business.id, coordinates);
    }
    await sleep(1100);
  }

  return dbClient.businesses.listMapLocations();
}

export async function getBusinessBySlug(slug: string): Promise<BusinessPublic> {
  try {
    const business = await dbClient.businesses.findBySlug(slug, 'full');
    return toPublic(business);
  } catch {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'עסק לא נמצא');
  }
}

export async function getOwnerBusiness(userId: string): Promise<BusinessOwner | null> {
  const business = await dbClient.businesses.findByOwnerId(userId);
  if (!business) return null;
  const resolved = await ensureBusinessCoordinates(business);
  return {
    ...toPublic({ ...resolved, services: (resolved.services ?? []).filter((s) => s.isVisible) }),
    phone: await sharedClient.decryptPii(resolved.phoneEnc),
    isPro: resolved.isPro,
  };
}

export async function updateAvailability(
  businessId: string,
  userId: string,
  input: UpdateAvailabilityBody,
): Promise<{ days: AvailabilityDay[]; warning: string | null }> {
  await assertOwner(businessId, userId);

  const { count: futureAppointments } = await dbClient.businesses.countFutureAppointments(businessId);

  for (const day of input.days) {
    if (day.isActive && parseTime(day.endTime) <= parseTime(day.startTime)) {
      throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, 'שעת סיום חייבת להיות אחרי שעת ההתחלה');
    }
  }

  const rows = await dbClient.businesses.updateAvailability(businessId, input.days);
  return {
    days: rows.map((a) => ({
      dayOfWeek: a.dayOfWeek,
      isActive: a.isActive,
      startTime: a.startTime,
      endTime: a.endTime,
    })),
    warning:
      futureAppointments > 0
        ? `שימו לב: קיימים ${futureAppointments} תורים עתידיים שעשויים להיות מושפעים משינוי השעות`
        : null,
  };
}

export async function updateBreaks(
  businessId: string,
  userId: string,
  input: UpdateBreaksBody,
): Promise<BreakBlockDto[]> {
  await assertOwner(businessId, userId);

  const business = await getBusinessOrThrow(businessId);
  const availability = business.availability ?? [];

  for (const brk of input.breaks) {
    const day = availability.find((a) => a.dayOfWeek === brk.dayOfWeek);
    if (!day?.isActive) {
      throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, 'הפסקה רק ביום פעיל');
    }
    const brkStart = parseTime(brk.startTime);
    const brkEnd = parseTime(brk.endTime);
    const dayStart = parseTime(day.startTime);
    const dayEnd = parseTime(day.endTime);
    if (brkEnd <= brkStart || brkStart < dayStart || brkEnd > dayEnd) {
      throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, 'הפסקה חייבת להיות בתוך שעות הפעילות');
    }
  }

  const rows = await dbClient.businesses.updateBreaks(businessId, input.breaks);
  return rows.map((b) => ({ dayOfWeek: b.dayOfWeek, startTime: b.startTime, endTime: b.endTime }));
}

export async function createService(
  businessId: string,
  userId: string,
  input: CreateServiceBody,
): Promise<ServiceDto> {
  await assertOwner(businessId, userId);
  const service = await dbClient.services.create(businessId, {
    name: input.name,
    durationMins: input.durationMins,
    price: input.price ?? 0,
  });
  return toServiceDto(service);
}

export async function updateService(
  serviceId: string,
  userId: string,
  input: UpdateServiceBody,
): Promise<ServiceDto> {
  const service = await dbClient.services.findById(serviceId);
  if (service.business.ownerId !== userId) {
    throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'אין הרשאה');
  }

  const updated = await dbClient.services.update(serviceId, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.durationMins !== undefined ? { durationMins: input.durationMins } : {}),
    ...(input.price !== undefined ? { price: input.price } : {}),
  });
  return toServiceDto(updated);
}

export async function deleteService(serviceId: string, userId: string): Promise<void> {
  const service = await dbClient.services.findById(serviceId);
  if (service.business.ownerId !== userId) {
    throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'אין הרשאה');
  }

  const futureAppt = await dbClient.services.findFutureAppointment(serviceId);

  if (futureAppt) {
    await dbClient.services.update(serviceId, { isVisible: false });
    throw new AppError(
      409,
      API_ERROR_CODES.SERVICE_HAS_APPOINTMENTS,
      'לא ניתן למחוק שירות עם תורים עתידיים — השירות הוסתר',
    );
  }

  await dbClient.services.delete(serviceId);
}

export async function listOwnerServices(businessId: string, userId: string): Promise<ServiceDto[]> {
  await assertOwner(businessId, userId);
  const services = await dbClient.services.listByBusiness(businessId);
  return services.map(toServiceDto);
}

export async function completeOnboarding(userId: string): Promise<void> {
  const user = await dbClient.users.findById(userId);
  if (!user || user.role !== UserRole.BUSINESS_OWNER) {
    throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'רק בעלי עסק יכולים להשלים הגדרה');
  }
  await dbClient.users.completeOnboarding(userId);
}
