import { prisma } from '@torbook/db';
import {
  API_ERROR_CODES,
  SLOT_CACHE_TTL_SECONDS,
  addMinutes,
  getJerusalemDayOfWeek,
  minutesToTimeString,
  parseJerusalemDateTime,
  parseTimeToMinutes,
  toJerusalemTimeString,
} from '@torbook/shared';
import { getRedis } from '../lib/redis.js';
import { AppError } from '../utils/app-error.js';

function slotCacheKey(businessId: string, date: string, serviceId: string): string {
  return `slots:${businessId}:${date}:${serviceId}`;
}

export async function invalidateSlotCache(businessId: string, date: string, serviceId?: string): Promise<void> {
  const redis = getRedis();
  if (serviceId) {
    await redis.del(slotCacheKey(businessId, date, serviceId));
    return;
  }
  const pattern = `slots:${businessId}:${date}:*`;
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

type Interval = { start: number; end: number };

function subtractInterval(intervals: Interval[], block: Interval): Interval[] {
  const result: Interval[] = [];
  for (const iv of intervals) {
    if (block.end <= iv.start || block.start >= iv.end) {
      result.push(iv);
      continue;
    }
    if (block.start > iv.start) {
      result.push({ start: iv.start, end: block.start });
    }
    if (block.end < iv.end) {
      result.push({ start: block.end, end: iv.end });
    }
  }
  return result;
}

export async function computeAvailableSlots(
  slug: string,
  serviceId: string,
  date: string,
): Promise<string[]> {
  const cacheKey = `slots:${slug}:${date}:${serviceId}`;
  const redis = getRedis();
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as string[];
  }

  const business = await prisma.business.findFirst({
    where: { slug, deletedAt: null },
    include: { availability: true, breakBlocks: true },
  });
  if (!business) {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'עסק לא נמצא');
  }

  const service = await prisma.service.findFirst({
    where: { id: serviceId, businessId: business.id, isVisible: true },
  });
  if (!service) {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'שירות לא נמצא');
  }

  const dayOfWeek = getJerusalemDayOfWeek(date);
  const dayAvail = business.availability.find((a) => a.dayOfWeek === dayOfWeek);
  if (!dayAvail?.isActive) {
    return [];
  }

  let intervals: Interval[] = [
    { start: parseTimeToMinutes(dayAvail.startTime), end: parseTimeToMinutes(dayAvail.endTime) },
  ];

  const dayBreak = business.breakBlocks.find((b) => b.dayOfWeek === dayOfWeek);
  if (dayBreak) {
    intervals = subtractInterval(intervals, {
      start: parseTimeToMinutes(dayBreak.startTime),
      end: parseTimeToMinutes(dayBreak.endTime),
    });
  }

  const dayStart = parseJerusalemDateTime(date, '00:00');
  const dayEnd = addMinutes(dayStart, 24 * 60);

  const appointments = await prisma.appointment.findMany({
    where: {
      businessId: business.id,
      status: { in: ['CONFIRMED', 'PENDING', 'PENDING_OWNER_DECISION'] },
      startsAt: { gte: dayStart, lt: dayEnd },
    },
  });

  for (const apt of appointments) {
    const aptStart = parseTimeToMinutes(toJerusalemTimeString(apt.startsAt));
    const aptEnd = parseTimeToMinutes(toJerusalemTimeString(apt.endsAt));
    intervals = subtractInterval(intervals, { start: aptStart, end: aptEnd });
  }

  const timeBlocks = await prisma.timeBlock.findMany({
    where: {
      businessId: business.id,
      startsAt: { lt: dayEnd },
      endsAt: { gt: dayStart },
    },
  });

  for (const block of timeBlocks) {
    const blockStart = parseTimeToMinutes(toJerusalemTimeString(block.startsAt));
    const blockEnd = parseTimeToMinutes(toJerusalemTimeString(block.endsAt));
    intervals = subtractInterval(intervals, { start: blockStart, end: blockEnd });
  }

  const now = new Date();
  const slots: string[] = [];
  const duration = service.durationMins;

  for (const iv of intervals) {
    let cursor = iv.start;
    while (cursor + duration <= iv.end) {
      const timeStr = minutesToTimeString(cursor);
      const slotStart = parseJerusalemDateTime(date, timeStr);
      if (slotStart > now) {
        slots.push(timeStr);
      }
      cursor += duration;
    }
  }

  const businessCacheKey = slotCacheKey(business.id, date, serviceId);
  await redis.set(businessCacheKey, JSON.stringify(slots), 'EX', SLOT_CACHE_TTL_SECONDS);
  await redis.set(cacheKey, JSON.stringify(slots), 'EX', SLOT_CACHE_TTL_SECONDS);

  return slots;
}

export async function getNextAvailableSlots(
  slug: string,
  serviceId: string,
  date: string,
  afterTime: string,
  count = 3,
): Promise<string[]> {
  const all = await computeAvailableSlots(slug, serviceId, date);
  const afterMins = parseTimeToMinutes(afterTime);
  const filtered = all.filter((t) => parseTimeToMinutes(t) > afterMins);
  if (filtered.length >= count) return filtered.slice(0, count);

  const result = [...filtered];
  let nextDate = new Date(`${date}T12:00:00Z`);
  for (let i = 0; i < 7 && result.length < count; i += 1) {
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDateStr = nextDate.toISOString().slice(0, 10);
    const nextSlots = await computeAvailableSlots(slug, serviceId, nextDateStr);
    for (const slot of nextSlots) {
      result.push(slot);
      if (result.length >= count) break;
    }
  }
  return result.slice(0, count);
}
