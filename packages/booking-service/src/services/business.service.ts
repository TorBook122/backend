import { prisma } from '@torbook/db';
import { API_ERROR_CODES, UserRole, decryptPii, encryptPii, normalizePhone } from '@torbook/shared';
import type {
  AvailabilityDay,
  BreakBlockDto,
  BusinessListItem,
  BusinessOwner,
  BusinessPublic,
  ServiceDto,
} from '@torbook/shared';
import { AppError } from '../utils/app-error.js';
import type {
  CreateBusinessBody,
  CreateServiceBody,
  UpdateAvailabilityBody,
  UpdateBreaksBody,
  UpdateBusinessBody,
  UpdateServiceBody,
} from '../validators/business.validator.js';

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
    const existing = await prisma.business.findUnique({ where: { slug: candidate } });
    if (!existing) return candidate;
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

async function getBusinessOrThrow(businessId: string) {
  const business = await prisma.business.findFirst({
    where: { id: businessId, deletedAt: null },
    include: { availability: true, breakBlocks: true, services: { where: { isVisible: true } } },
  });
  if (!business) {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'עסק לא נמצא');
  }
  return business;
}

async function assertOwner(businessId: string, userId: string) {
  const business = await prisma.business.findFirst({ where: { id: businessId, deletedAt: null } });
  if (!business) {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'עסק לא נמצא');
  }
  if (business.ownerId !== userId) {
    throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'אין הרשאה לעסק זה');
  }
  return business;
}

function toPublic(business: Awaited<ReturnType<typeof getBusinessOrThrow>>): BusinessPublic {
  return {
    id: business.id,
    name: business.name,
    slug: business.slug,
    category: business.category,
    logoUrl: business.logoUrl,
    cancellationWindowHours: business.cancellationWindowHours,
    availability: business.availability.map((a) => ({
      dayOfWeek: a.dayOfWeek,
      isActive: a.isActive,
      startTime: a.startTime,
      endTime: a.endTime,
    })),
    breaks: business.breakBlocks.map((b) => ({
      dayOfWeek: b.dayOfWeek,
      startTime: b.startTime,
      endTime: b.endTime,
    })),
    services: business.services.map(toServiceDto),
  };
}

export async function createBusiness(userId: string, input: CreateBusinessBody): Promise<BusinessOwner> {
  const existing = await prisma.business.findUnique({ where: { ownerId: userId } });
  if (existing) {
    throw new AppError(409, API_ERROR_CODES.CONFLICT, 'כבר קיים עסק לחשבון זה');
  }

  const slug = await uniqueSlug(input.name);
  const business = await prisma.business.create({
    data: {
      ownerId: userId,
      name: input.name,
      slug,
      category: input.category ?? null,
      phoneEnc: encryptPii(normalizePhone(input.phone)),
    },
    include: { availability: true, breakBlocks: true, services: true },
  });

  return {
    ...toPublic(business),
    phone: input.phone,
  };
}

export async function updateBusiness(
  businessId: string,
  userId: string,
  input: UpdateBusinessBody,
): Promise<BusinessOwner> {
  const business = await assertOwner(businessId, userId);

  const updated = await prisma.business.update({
    where: { id: business.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.phone !== undefined ? { phoneEnc: encryptPii(normalizePhone(input.phone)) } : {}),
      ...(input.cancellationWindowHours !== undefined
        ? { cancellationWindowHours: input.cancellationWindowHours }
        : {}),
    },
    include: { availability: true, breakBlocks: true, services: { where: { isVisible: true } } },
  });

  return {
    ...toPublic(updated),
    phone: input.phone ?? decryptPii(updated.phoneEnc),
  };
}

export async function listPublicBusinesses(query?: string): Promise<BusinessListItem[]> {
  const q = query?.trim();
  const businesses = await prisma.business.findMany({
    where: {
      deletedAt: null,
      owner: { onboardingCompletedAt: { not: null } },
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { category: { contains: q, mode: 'insensitive' } },
              { slug: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: { id: true, name: true, slug: true, category: true },
    orderBy: { name: 'asc' },
  });
  return businesses;
}

export async function getBusinessBySlug(slug: string): Promise<BusinessPublic> {
  const business = await prisma.business.findFirst({
    where: { slug, deletedAt: null },
    include: {
      availability: true,
      breakBlocks: true,
      services: { where: { isVisible: true }, orderBy: { name: 'asc' } },
    },
  });
  if (!business) {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'עסק לא נמצא');
  }
  return toPublic(business);
}

export async function getOwnerBusiness(userId: string): Promise<BusinessOwner | null> {
  const business = await prisma.business.findFirst({
    where: { ownerId: userId, deletedAt: null },
    include: {
      availability: true,
      breakBlocks: true,
      services: { orderBy: { name: 'asc' } },
    },
  });
  if (!business) return null;
  return {
    ...toPublic({ ...business, services: business.services.filter((s) => s.isVisible) }),
    phone: decryptPii(business.phoneEnc),
  };
}

export async function updateAvailability(
  businessId: string,
  userId: string,
  input: UpdateAvailabilityBody,
): Promise<{ days: AvailabilityDay[]; warning: string | null }> {
  await assertOwner(businessId, userId);

  const futureAppointments = await prisma.appointment.count({
    where: {
      businessId,
      status: 'CONFIRMED',
      startsAt: { gt: new Date() },
    },
  });

  for (const day of input.days) {
    if (day.isActive && parseTime(day.endTime) <= parseTime(day.startTime)) {
      throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, 'שעת סיום חייבת להיות אחרי שעת ההתחלה');
    }
  }

  await prisma.$transaction(
    input.days.map((day) =>
      prisma.availability.upsert({
        where: { businessId_dayOfWeek: { businessId, dayOfWeek: day.dayOfWeek } },
        create: {
          businessId,
          dayOfWeek: day.dayOfWeek,
          isActive: day.isActive,
          startTime: day.startTime,
          endTime: day.endTime,
        },
        update: {
          isActive: day.isActive,
          startTime: day.startTime,
          endTime: day.endTime,
        },
      }),
    ),
  );

  const rows = await prisma.availability.findMany({ where: { businessId }, orderBy: { dayOfWeek: 'asc' } });
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

  const availability = await prisma.availability.findMany({ where: { businessId } });

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

  await prisma.$transaction(async (tx) => {
    await tx.breakBlock.deleteMany({ where: { businessId } });
    if (input.breaks.length > 0) {
      await tx.breakBlock.createMany({
        data: input.breaks.map((b) => ({
          businessId,
          dayOfWeek: b.dayOfWeek,
          startTime: b.startTime,
          endTime: b.endTime,
        })),
      });
    }
  });

  const rows = await prisma.breakBlock.findMany({ where: { businessId }, orderBy: { dayOfWeek: 'asc' } });
  return rows.map((b) => ({ dayOfWeek: b.dayOfWeek, startTime: b.startTime, endTime: b.endTime }));
}

export async function createService(
  businessId: string,
  userId: string,
  input: CreateServiceBody,
): Promise<ServiceDto> {
  await assertOwner(businessId, userId);
  const service = await prisma.service.create({
    data: { businessId, name: input.name, durationMins: input.durationMins, price: input.price ?? 0 },
  });
  return toServiceDto(service);
}

export async function updateService(
  serviceId: string,
  userId: string,
  input: UpdateServiceBody,
): Promise<ServiceDto> {
  const service = await prisma.service.findUnique({ where: { id: serviceId }, include: { business: true } });
  if (!service) {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'שירות לא נמצא');
  }
  if (service.business.ownerId !== userId) {
    throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'אין הרשאה');
  }

  const updated = await prisma.service.update({
    where: { id: serviceId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.durationMins !== undefined ? { durationMins: input.durationMins } : {}),
      ...(input.price !== undefined ? { price: input.price } : {}),
    },
  });
  return toServiceDto(updated);
}

export async function deleteService(serviceId: string, userId: string): Promise<void> {
  const service = await prisma.service.findUnique({ where: { id: serviceId }, include: { business: true } });
  if (!service) {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'שירות לא נמצא');
  }
  if (service.business.ownerId !== userId) {
    throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'אין הרשאה');
  }

  const futureAppt = await prisma.appointment.findFirst({
    where: {
      serviceId,
      status: 'CONFIRMED',
      startsAt: { gt: new Date() },
    },
  });

  if (futureAppt) {
    await prisma.service.update({ where: { id: serviceId }, data: { isVisible: false } });
    throw new AppError(
      409,
      API_ERROR_CODES.SERVICE_HAS_APPOINTMENTS,
      'לא ניתן למחוק שירות עם תורים עתידיים — השירות הוסתר',
    );
  }

  await prisma.service.delete({ where: { id: serviceId } });
}

export async function listOwnerServices(businessId: string, userId: string): Promise<ServiceDto[]> {
  await assertOwner(businessId, userId);
  const services = await prisma.service.findMany({ where: { businessId }, orderBy: { name: 'asc' } });
  return services.map(toServiceDto);
}

export async function completeOnboarding(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== UserRole.BUSINESS_OWNER) {
    throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'רק בעלי עסק יכולים להשלים הגדרה');
  }
  await prisma.user.update({
    where: { id: userId },
    data: { onboardingCompletedAt: new Date() },
  });
}
