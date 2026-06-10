import { createHash } from 'node:crypto';
import { prisma } from '@torbook/db';
import {
  AppointmentStatus,
  API_ERROR_CODES,
  addMinutes,
  parseJerusalemDateTime,
  toJerusalemDateString,
} from '@torbook/shared';
import type { AppointmentDto } from '@torbook/shared';
import { enqueueJob } from '@torbook/queue';
import { AppError } from '../utils/app-error.js';
import { computeAvailableSlots, getNextAvailableSlots, invalidateSlotCache } from './availability.service.js';
import type { CreateAppointmentBody } from '../validators/appointment.validator.js';

function advisoryLockKey(businessId: string, date: string, time: string): bigint {
  const hash = createHash('sha256').update(`${businessId}:${date}:${time}`).digest();
  return hash.readBigInt64BE(0);
}

function toAppointmentDto(
  apt: {
    id: string;
    businessId: string;
    serviceId: string;
    startsAt: Date;
    endsAt: Date;
    status: string;
    business: { name: string; slug: string };
    service: { name: string };
    customer?: { name: string };
  },
): AppointmentDto {
  return {
    id: apt.id,
    businessId: apt.businessId,
    businessName: apt.business.name,
    businessSlug: apt.business.slug,
    serviceId: apt.serviceId,
    serviceName: apt.service.name,
    startsAt: apt.startsAt.toISOString(),
    endsAt: apt.endsAt.toISOString(),
    status: apt.status,
    ...(apt.customer ? { customerName: apt.customer.name } : {}),
  };
}

export async function createAppointment(
  customerId: string,
  slug: string,
  input: CreateAppointmentBody,
): Promise<AppointmentDto> {
  const business = await prisma.business.findFirst({ where: { slug, deletedAt: null } });
  if (!business) {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'עסק לא נמצא');
  }

  const service = await prisma.service.findFirst({
    where: { id: input.serviceId, businessId: business.id, isVisible: true },
  });
  if (!service) {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'שירות לא נמצא');
  }

  const startsAt = parseJerusalemDateTime(input.date, input.time);
  if (startsAt <= new Date()) {
    throw new AppError(400, API_ERROR_CODES.PAST_APPOINTMENT, 'לא ניתן להזמין תור בעבר');
  }

  const endsAt = addMinutes(startsAt, service.durationMins);
  const lockKey = advisoryLockKey(business.id, input.date, input.time);

  try {
    const appointment = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;

      const slots = await computeAvailableSlots(slug, input.serviceId, input.date);
      if (!slots.includes(input.time)) {
        const alternatives = await getNextAvailableSlots(slug, input.serviceId, input.date, input.time);
        throw new AppError(409, API_ERROR_CODES.SLOT_TAKEN, 'התור כבר תפוס', { alternativeSlots: alternatives });
      }

      const conflict = await tx.appointment.findFirst({
        where: {
          businessId: business.id,
          status: { in: ['CONFIRMED', 'PENDING', 'PENDING_OWNER_DECISION'] },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
      });

      if (conflict) {
        const alternatives = await getNextAvailableSlots(slug, input.serviceId, input.date, input.time);
        throw new AppError(409, API_ERROR_CODES.SLOT_TAKEN, 'התור כבר תפוס', { alternativeSlots: alternatives });
      }

      return tx.appointment.create({
        data: {
          businessId: business.id,
          customerId,
          serviceId: service.id,
          startsAt,
          endsAt,
          status: AppointmentStatus.CONFIRMED,
        },
        include: {
          business: { select: { name: true, slug: true } },
          service: { select: { name: true } },
        },
      });
    });

    await invalidateSlotCache(business.id, input.date, input.serviceId);

    const msUntilStart = startsAt.getTime() - Date.now();
    if (msUntilStart > 90 * 60 * 1000) {
      const reminderAt = addMinutes(startsAt, -60);
      await enqueueJob({
        type: 'REMINDER',
        appointmentId: appointment.id,
        scheduledAt: reminderAt.toISOString(),
      });
    }

    return toAppointmentDto(appointment);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw error;
  }
}

export async function cancelAppointment(appointmentId: string, userId: string): Promise<AppointmentDto> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      business: true,
      service: { select: { name: true } },
      customer: { select: { name: true } },
    },
  });

  if (!appointment) {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'תור לא נמצא');
  }

  const isCustomer = appointment.customerId === userId;
  const isOwner = appointment.business.ownerId === userId;

  if (!isCustomer && !isOwner) {
    throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'אין הרשאה');
  }

  if (appointment.startsAt <= new Date()) {
    throw new AppError(400, API_ERROR_CODES.PAST_APPOINTMENT, 'לא ניתן לבטל תור שעבר');
  }

  if (['CANCELLED_BY_CLIENT', 'CANCELLED_BY_BUSINESS'].includes(appointment.status)) {
    throw new AppError(409, API_ERROR_CODES.CONFLICT, 'התור כבר בוטל');
  }

  let newStatus: AppointmentStatus;
  if (isOwner) {
    newStatus = AppointmentStatus.CANCELLED_BY_BUSINESS;
  } else {
    const hoursUntil = (appointment.startsAt.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntil < appointment.business.cancellationWindowHours) {
      newStatus = AppointmentStatus.PENDING_OWNER_DECISION;
    } else {
      newStatus = AppointmentStatus.CANCELLED_BY_CLIENT;
    }
  }

  const updated = await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: newStatus },
    include: {
      business: { select: { name: true, slug: true } },
      service: { select: { name: true } },
      customer: { select: { name: true } },
    },
  });

  const dateStr = toJerusalemDateString(appointment.startsAt);
  await invalidateSlotCache(appointment.businessId, dateStr, appointment.serviceId);

  if (newStatus === AppointmentStatus.PENDING_OWNER_DECISION || newStatus === AppointmentStatus.CANCELLED_BY_BUSINESS) {
    await enqueueJob({
      type: 'CANCELLATION',
      appointmentId: updated.id,
      scheduledAt: new Date().toISOString(),
    });
  }

  return toAppointmentDto(updated);
}

export async function getCustomerAppointments(userId: string): Promise<{
  upcoming: AppointmentDto[];
  past: AppointmentDto[];
}> {
  const now = new Date();
  const appointments = await prisma.appointment.findMany({
    where: { customerId: userId },
    include: {
      business: { select: { name: true, slug: true } },
      service: { select: { name: true } },
    },
    orderBy: { startsAt: 'asc' },
  });

  const upcoming = appointments
    .filter((a) => a.startsAt >= now && !['CANCELLED_BY_CLIENT', 'CANCELLED_BY_BUSINESS'].includes(a.status))
    .map(toAppointmentDto);
  const past = appointments
    .filter((a) => a.startsAt < now || ['CANCELLED_BY_CLIENT', 'CANCELLED_BY_BUSINESS'].includes(a.status))
    .map(toAppointmentDto);

  return { upcoming, past };
}

export async function getBusinessAppointments(
  businessId: string,
  userId: string,
  date?: string,
  view: 'day' | 'week' = 'day',
): Promise<AppointmentDto[]> {
  const business = await prisma.business.findFirst({ where: { id: businessId, deletedAt: null } });
  if (!business) {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'עסק לא נמצא');
  }
  if (business.ownerId !== userId) {
    throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'אין הרשאה');
  }

  let startDate: Date;
  let endDate: Date;

  if (date) {
    startDate = parseJerusalemDateTime(date, '00:00');
    if (view === 'week') {
      endDate = addMinutes(startDate, 7 * 24 * 60);
    } else {
      endDate = addMinutes(startDate, 24 * 60);
    }
  } else {
    startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    endDate = addMinutes(startDate, 24 * 60);
  }

  const appointments = await prisma.appointment.findMany({
    where: {
      businessId,
      startsAt: { gte: startDate, lt: endDate },
      status: { notIn: ['CANCELLED_BY_CLIENT', 'CANCELLED_BY_BUSINESS'] },
    },
    include: {
      business: { select: { name: true, slug: true } },
      service: { select: { name: true } },
      customer: { select: { name: true } },
    },
    orderBy: { startsAt: 'asc' },
  });

  return appointments.map(toAppointmentDto);
}

export async function createTimeBlock(
  businessId: string,
  userId: string,
  startsAt: string,
  endsAt: string,
  note?: string,
) {
  const business = await prisma.business.findFirst({ where: { id: businessId, deletedAt: null } });
  if (!business) {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'עסק לא נמצא');
  }
  if (business.ownerId !== userId) {
    throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'אין הרשאה');
  }

  const block = await prisma.timeBlock.create({
    data: {
      businessId,
      startsAt: new Date(startsAt),
      endsAt: new Date(endsAt),
      note: note ?? null,
    },
  });

  const dateStr = toJerusalemDateString(block.startsAt);
  await invalidateSlotCache(businessId, dateStr);

  return {
    id: block.id,
    startsAt: block.startsAt.toISOString(),
    endsAt: block.endsAt.toISOString(),
    note: block.note,
  };
}

export async function deleteTimeBlock(businessId: string, blockId: string, userId: string): Promise<void> {
  const business = await prisma.business.findFirst({ where: { id: businessId, deletedAt: null } });
  if (!business || business.ownerId !== userId) {
    throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'אין הרשאה');
  }

  const block = await prisma.timeBlock.findFirst({ where: { id: blockId, businessId } });
  if (!block) {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'חסימה לא נמצאה');
  }

  await prisma.timeBlock.delete({ where: { id: blockId } });
  const dateStr = toJerusalemDateString(block.startsAt);
  await invalidateSlotCache(businessId, dateStr);
}

export async function getTimeBlocks(businessId: string, userId: string, date?: string) {
  const business = await prisma.business.findFirst({ where: { id: businessId, deletedAt: null } });
  if (!business || business.ownerId !== userId) {
    throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'אין הרשאה');
  }

  const where: { businessId: string; startsAt?: { gte: Date; lt: Date } } = { businessId };
  if (date) {
    const start = parseJerusalemDateTime(date, '00:00');
    const end = addMinutes(start, 24 * 60);
    where.startsAt = { gte: start, lt: end };
  }

  const blocks = await prisma.timeBlock.findMany({ where, orderBy: { startsAt: 'asc' } });
  return blocks.map((b) => ({
    id: b.id,
    startsAt: b.startsAt.toISOString(),
    endsAt: b.endsAt.toISOString(),
    note: b.note,
  }));
}
