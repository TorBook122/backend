import { createHash } from 'node:crypto';
import {
  AppointmentStatus,
  API_ERROR_CODES,
  addMinutes,
  parseJerusalemDateTime,
  toJerusalemDateString,
} from '@torbook/shared';
import type { AppointmentDto } from '@torbook/shared';
import { dbClient, type DbAppointment } from '../clients/db.client.js';
import { queueClient } from '../clients/queue.client.js';
import { AppError } from '../utils/app-error.js';
import { computeAvailableSlots, getNextAvailableSlots, invalidateSlotCache } from './availability.service.js';
import type { CreateAppointmentBody } from '../validators/appointment.validator.js';

function advisoryLockKey(businessId: string, date: string, time: string): bigint {
  const hash = createHash('sha256').update(`${businessId}:${date}:${time}`).digest();
  return hash.readBigInt64BE(0);
}

function toAppointmentDto(apt: DbAppointment): AppointmentDto {
  if (!apt.business || !apt.service) {
    throw new Error('Appointment missing business or service relation');
  }

  return {
    id: apt.id,
    businessId: apt.businessId,
    businessName: apt.business.name,
    businessSlug: apt.business.slug,
    serviceId: apt.serviceId,
    serviceName: apt.service.name,
    serviceDuration: apt.service.durationMins,
    startsAt: new Date(apt.startsAt).toISOString(),
    endsAt: new Date(apt.endsAt).toISOString(),
    status: apt.status,
    ...(apt.customer ? { customerName: apt.customer.name } : {}),
  };
}

export async function createAppointment(
  customerId: string,
  slug: string,
  input: CreateAppointmentBody,
): Promise<AppointmentDto> {
  let business;
  try {
    business = await dbClient.businesses.findBySlug(slug);
  } catch {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'עסק לא נמצא');
  }

  const service = await dbClient.services.findVisible(business.id, input.serviceId);
  if (!service) {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'שירות לא נמצא');
  }

  const startsAt = parseJerusalemDateTime(input.date, input.time);
  if (startsAt <= new Date()) {
    throw new AppError(400, API_ERROR_CODES.PAST_APPOINTMENT, 'לא ניתן להזמין תור בעבר');
  }

  const endsAt = addMinutes(startsAt, service.durationMins);
  const lockKey = advisoryLockKey(business.id, input.date, input.time).toString();

  const slots = await computeAvailableSlots(slug, input.serviceId, input.date);
  if (!slots.includes(input.time)) {
    const alternatives = await getNextAvailableSlots(slug, input.serviceId, input.date, input.time);
    throw new AppError(409, API_ERROR_CODES.SLOT_TAKEN, 'התור כבר תפוס', { alternativeSlots: alternatives });
  }

  try {
    const appointment = await dbClient.appointments.book({
      customerId,
      businessId: business.id,
      serviceId: service.id,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      lockKey,
      status: AppointmentStatus.CONFIRMED,
    });

    await invalidateSlotCache(business.id, input.date, input.serviceId);

    const msUntilStart = startsAt.getTime() - Date.now();
    if (msUntilStart > 90 * 60 * 1000) {
      const reminderAt = addMinutes(startsAt, -60);
      await queueClient.enqueueJob({
        type: 'REMINDER',
        appointmentId: appointment.id,
        scheduledAt: reminderAt.toISOString(),
      });
    }

    return toAppointmentDto(appointment);
  } catch (error) {
    if (error instanceof AppError && error.code === API_ERROR_CODES.SLOT_TAKEN) {
      const alternatives = await getNextAvailableSlots(slug, input.serviceId, input.date, input.time);
      throw new AppError(409, API_ERROR_CODES.SLOT_TAKEN, 'התור כבר תפוס', { alternativeSlots: alternatives });
    }
    throw error;
  }
}

export async function cancelAppointment(appointmentId: string, userId: string): Promise<AppointmentDto> {
  let appointment;
  try {
    appointment = await dbClient.appointments.findById(appointmentId, 'full');
  } catch {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'תור לא נמצא');
  }

  const isCustomer = appointment.customerId === userId;
  const isOwner = appointment.business!.ownerId === userId;

  if (!isCustomer && !isOwner) {
    throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'אין הרשאה');
  }

  const startsAt = new Date(appointment.startsAt);
  if (startsAt <= new Date()) {
    throw new AppError(400, API_ERROR_CODES.PAST_APPOINTMENT, 'לא ניתן לבטל תור שעבר');
  }

  if (['CANCELLED_BY_CLIENT', 'CANCELLED_BY_BUSINESS'].includes(appointment.status)) {
    throw new AppError(409, API_ERROR_CODES.CONFLICT, 'התור כבר בוטל');
  }

  let newStatus: AppointmentStatus;
  if (isOwner) {
    newStatus = AppointmentStatus.CANCELLED_BY_BUSINESS;
  } else {
    const hoursUntil = (startsAt.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntil < appointment.business!.cancellationWindowHours!) {
      newStatus = AppointmentStatus.PENDING_OWNER_DECISION;
    } else {
      newStatus = AppointmentStatus.CANCELLED_BY_CLIENT;
    }
  }

  const updated = await dbClient.appointments.update(appointmentId, { status: newStatus });

  const dateStr = toJerusalemDateString(startsAt);
  await invalidateSlotCache(appointment.businessId, dateStr, appointment.serviceId);

  if (newStatus === AppointmentStatus.PENDING_OWNER_DECISION || newStatus === AppointmentStatus.CANCELLED_BY_BUSINESS) {
    await queueClient.enqueueJob({
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
  const appointments = await dbClient.appointments.findByCustomer(userId);

  const upcoming = appointments
    .filter((a) => new Date(a.startsAt) >= now && !['CANCELLED_BY_CLIENT', 'CANCELLED_BY_BUSINESS'].includes(a.status))
    .map(toAppointmentDto);
  const past = appointments
    .filter((a) => new Date(a.startsAt) < now || ['CANCELLED_BY_CLIENT', 'CANCELLED_BY_BUSINESS'].includes(a.status))
    .map(toAppointmentDto);

  return { upcoming, past };
}

export async function getBusinessAppointments(
  businessId: string,
  userId: string,
  date?: string,
  view: 'day' | 'week' = 'day',
): Promise<AppointmentDto[]> {
  let business;
  try {
    business = await dbClient.businesses.findById(businessId);
  } catch {
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

  const appointments = await dbClient.appointments.findByBusiness(
    businessId,
    startDate.toISOString(),
    endDate.toISOString(),
    true,
  );

  return appointments.map(toAppointmentDto);
}

export async function createTimeBlock(
  businessId: string,
  userId: string,
  startsAt: string,
  endsAt: string,
  note?: string,
) {
  let business;
  try {
    business = await dbClient.businesses.findById(businessId);
  } catch {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'עסק לא נמצא');
  }
  if (business.ownerId !== userId) {
    throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'אין הרשאה');
  }

  const block = await dbClient.timeBlocks.create({
    businessId,
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt),
    note: note ?? null,
  });

  const dateStr = toJerusalemDateString(new Date(block.startsAt));
  await invalidateSlotCache(businessId, dateStr);

  return {
    id: block.id,
    startsAt: block.startsAt,
    endsAt: block.endsAt,
    note: block.note,
  };
}

export async function deleteTimeBlock(businessId: string, blockId: string, userId: string): Promise<void> {
  let business;
  try {
    business = await dbClient.businesses.findById(businessId);
  } catch {
    throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'אין הרשאה');
  }
  if (business.ownerId !== userId) {
    throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'אין הרשאה');
  }

  let block;
  try {
    block = await dbClient.timeBlocks.delete(businessId, blockId);
  } catch {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'חסימה לא נמצאה');
  }

  const dateStr = toJerusalemDateString(new Date(block.startsAt));
  await invalidateSlotCache(businessId, dateStr);
}

export async function getTimeBlocks(businessId: string, userId: string, date?: string) {
  let business;
  try {
    business = await dbClient.businesses.findById(businessId);
  } catch {
    throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'אין הרשאה');
  }
  if (business.ownerId !== userId) {
    throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'אין הרשאה');
  }

  let start: string | undefined;
  let end: string | undefined;
  if (date) {
    const startDate = parseJerusalemDateTime(date, '00:00');
    const endDate = addMinutes(startDate, 24 * 60);
    start = startDate.toISOString();
    end = endDate.toISOString();
  }

  const blocks = await dbClient.timeBlocks.list(businessId, start, end);
  return blocks.map((b) => ({
    id: b.id,
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    note: b.note,
  }));
}
