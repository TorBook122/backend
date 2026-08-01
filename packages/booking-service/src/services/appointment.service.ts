import { createHash } from 'node:crypto';
import { prisma } from '@torbook/db';
import {
  AppointmentStatus,
  API_ERROR_CODES,
  EmployeePermission,
  UserRole,
  addMinutes,
  parseJerusalemDateTime,
  toJerusalemDateString,
  toJerusalemTimeString,
} from '@torbook/shared';
import type { AppointmentDto, BusinessAppointmentStats } from '@torbook/shared';
import { sharedClient } from '../clients/shared.client.js';
import { queueClient } from '../lib/queue-client.js';
import { AppError } from '../utils/app-error.js';
import {
  assertAnyBusinessPermission,
  assertBusinessPermission,
  assertNotAffiliatedBusiness,
  hasBusinessPermission,
} from '../utils/business-access.js';
import { computeAvailableSlots, getNextAvailableSlots, invalidateSlotCache } from './availability.service.js';
import type { CreateAppointmentBody } from '../validators/appointment.validator.js';

const CALENDAR_ACCESS_PERMISSIONS: EmployeePermission[] = [
  EmployeePermission.VIEW_APPOINTMENTS,
  EmployeePermission.CANCEL_APPOINTMENTS,
  EmployeePermission.CALENDAR_BLOCK_HOURS,
  EmployeePermission.CALENDAR_SET_BREAK,
  EmployeePermission.CALENDAR_BOOK_APPOINTMENT,
];

function advisoryLockKey(businessId: string, date: string, time: string): bigint {
  const hash = createHash('sha256').update(`${businessId}:${date}:${time}`).digest();
  return hash.readBigInt64BE(0);
}

function toAppointmentDto(
  apt: {
    id: string;
    businessId: string;
    customerId?: string;
    serviceId: string;
    startsAt: Date;
    endsAt: Date;
    status: string;
    business: { name: string; slug: string; cancellationWindowHours?: number };
    service: { name: string; durationMins: number };
    customer?: { name: string; phoneEnc?: string; emailEnc?: string | null };
  },
): AppointmentDto {
  return {
    id: apt.id,
    businessId: apt.businessId,
    businessName: apt.business.name,
    businessSlug: apt.business.slug,
    serviceId: apt.serviceId,
    serviceName: apt.service.name,
    serviceDuration: apt.service.durationMins,
    startsAt: apt.startsAt.toISOString(),
    endsAt: apt.endsAt.toISOString(),
    status: apt.status,
    ...(apt.customerId ? { customerId: apt.customerId } : {}),
    ...(apt.customer
      ? {
          customerName: apt.customer.name,
          customerAvatarUrl: apt.customer.avatarUrl ?? null,
        }
      : {}),
    ...(apt.business.cancellationWindowHours !== undefined
      ? { cancellationWindowHours: apt.business.cancellationWindowHours }
      : {}),
  };
}

async function toOwnerAppointmentDto(
  apt: Parameters<typeof toAppointmentDto>[0],
): Promise<AppointmentDto> {
  const base = toAppointmentDto(apt);
  if (!apt.customer?.phoneEnc) return base;

  const customerPhone = await sharedClient.decryptPii(apt.customer.phoneEnc);
  const customerEmail = apt.customer.emailEnc
    ? await sharedClient.decryptPii(apt.customer.emailEnc)
    : undefined;

  return {
    ...base,
    customerPhone,
    ...(customerEmail ? { customerEmail } : {}),
  };
}

const CANCELLED_STATUSES = ['CANCELLED_BY_CLIENT', 'CANCELLED_BY_BUSINESS'] as const;

function formatJerusalemDateDisplay(date: Date): string {
  const [year, month, day] = toJerusalemDateString(date).split('-');
  return `${day}.${month}.${year}`;
}

async function enqueueWhatsAppIfPhone(
  phoneEnc: string | null | undefined,
  userId: string,
  title: string,
  body: string,
  data: Record<string, string>,
): Promise<void> {
  if (!phoneEnc) return;

  try {
    const phone = await sharedClient.decryptPii(phoneEnc);
    await queueClient.enqueue({
      type: 'WHATSAPP',
      userId,
      title,
      body,
      data: { ...data, phone },
      scheduledAt: new Date().toISOString(),
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[booking] failed to enqueue WHATSAPP', error);
  }
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

  await assertNotAffiliatedBusiness(
    customerId,
    business.id,
    business.ownerId,
    'לא ניתן לקבוע תור לעסק שלך',
  );

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
          business: { select: { name: true, slug: true, cancellationWindowHours: true } },
          service: { select: { name: true, durationMins: true } },
        },
      });
    });

    await invalidateSlotCache(business.id, input.date, input.serviceId);

    const msUntilStart = startsAt.getTime() - Date.now();
    if (msUntilStart > 90 * 60 * 1000) {
      const reminderAt = addMinutes(startsAt, -60);
      await queueClient.enqueue({
        type: 'REMINDER',
        userId: customerId,
        title: 'תזכורת לתור',
        body: `יש לך תור ל${service.name} ב${business.name} בעוד שעה`,
        data: {
          type: 'REMINDER',
          appointmentId: appointment.id,
          businessSlug: business.slug,
        },
        scheduledAt: reminderAt.toISOString(),
      });
    }

    const [customer, owner] = await Promise.all([
      prisma.user.findUnique({
        where: { id: customerId },
        select: { phoneEnc: true, name: true },
      }),
      prisma.user.findUnique({
        where: { id: business.ownerId },
        select: { name: true },
      }),
    ]);

    const [year, month, day] = input.date.split('-');
    const dateFormatted = `${day}.${month}.${year}`;
    const customerName = customer?.name ?? 'לקוח/ה';
    const ownerName = owner?.name ?? 'בעל/ת העסק';

    if (customer?.phoneEnc) {
      try {
        const phone = await sharedClient.decryptPii(customer.phoneEnc);
        await queueClient.enqueue({
          type: 'BOOKING_CONFIRMATION',
          userId: customerId,
          title: 'התור נקבע בהצלחה',
          body: `שלום ${customerName}, התור שלך ל${service.name} ב${business.name} בתאריך ${dateFormatted} ובשעה ${input.time} נקבע בהצלחה!`,
          data: {
            type: 'BOOKING_CONFIRMATION',
            appointmentId: appointment.id,
            businessSlug: business.slug,
            phone,
            // Twilio Content Template vars — Utility text (booking success):
            // שלום {{first_name}}, התור שלך ל{{service}} ב{{business}} בתאריך {{date}} ובשעה {{time}} נקבע בהצלחה!
            first_name: customerName,
            service: service.name,
            business: business.name,
            date: dateFormatted,
            time: input.time,
          },
          scheduledAt: new Date().toISOString(),
        });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[booking] failed to enqueue BOOKING_CONFIRMATION', error);
      }
    }

    await enqueueWhatsAppIfPhone(
      business.phoneEnc,
      business.ownerId,
      'תור חדש נקבע',
      `שלום ${ownerName},\n${customerName} קבע/ה תור חדש אצלך דרך -Kvator לשירות ${service.name}, בתאריך ${dateFormatted} בשעה ${input.time}.\nלפרטים נוספים היכנס/י לאפליקציה.`,
      {
        type: 'WHATSAPP',
        template: 'appointment_confirm_to_business',
        appointmentId: appointment.id,
        name: ownerName,
        clientName: customerName,
        service: service.name,
        date: dateFormatted,
        time: input.time,
      },
    );

    return toAppointmentDto(appointment);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw error;
  }
}

export async function cancelAppointment(
  appointmentId: string,
  userId: string,
  userRole: string,
): Promise<AppointmentDto> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      business: true,
      service: { select: { name: true, durationMins: true } },
      customer: { select: { name: true, phoneEnc: true } },
    },
  });

  if (!appointment) {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'תור לא נמצא');
  }

  const isCustomer = appointment.customerId === userId;
  const isOwner = appointment.business.ownerId === userId;
  const canCancelAsBusiness =
    isOwner ||
    (userRole === UserRole.EMPLOYEE &&
      (await hasBusinessPermission(
        userId,
        userRole,
        appointment.businessId,
        EmployeePermission.CANCEL_APPOINTMENTS,
      )));

  if (!isCustomer && !canCancelAsBusiness) {
    throw new AppError(403, API_ERROR_CODES.PERMISSION_DENIED, 'אין לך הרשאה לבצע את זה');
  }

  if (appointment.startsAt <= new Date()) {
    throw new AppError(400, API_ERROR_CODES.PAST_APPOINTMENT, 'לא ניתן לבטל תור שעבר');
  }

  if (['CANCELLED_BY_CLIENT', 'CANCELLED_BY_BUSINESS'].includes(appointment.status)) {
    throw new AppError(409, API_ERROR_CODES.CONFLICT, 'התור כבר בוטל');
  }

  let newStatus: AppointmentStatus;
  if (canCancelAsBusiness && !isCustomer) {
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
      service: { select: { name: true, durationMins: true } },
      customer: { select: { name: true, phoneEnc: true } },
    },
  });

  const dateStr = toJerusalemDateString(appointment.startsAt);
  await invalidateSlotCache(appointment.businessId, dateStr, appointment.serviceId);

  if (newStatus === AppointmentStatus.PENDING_OWNER_DECISION) {
    await queueClient.enqueue({
      type: 'CANCELLATION',
      userId: appointment.business.ownerId,
      title: 'בקשת ביטול מאוחר',
      body: `${appointment.customer?.name ?? 'לקוח/ה'} ביקש/ה לבטל תור ל${appointment.service.name}`,
      data: {
        type: 'LATE_CANCELLATION',
        appointmentId: updated.id,
      },
      scheduledAt: new Date().toISOString(),
    });
  } else if (newStatus === AppointmentStatus.CANCELLED_BY_BUSINESS) {
    await queueClient.enqueue({
      type: 'CANCELLATION',
      userId: appointment.customerId,
      title: 'התור בוטל',
      body: `התור שלך ל${appointment.service.name} ב${appointment.business.name} בוטל`,
      data: {
        type: 'CANCELLED_BY_BUSINESS',
        appointmentId: updated.id,
        businessSlug: appointment.business.slug,
      },
      scheduledAt: new Date().toISOString(),
    });
  }

  const dateFormatted = formatJerusalemDateDisplay(appointment.startsAt);
  const timeFormatted = toJerusalemTimeString(appointment.startsAt);
  const customerName = appointment.customer?.name ?? 'לקוח/ה';
  const serviceName = appointment.service.name;
  const businessName = appointment.business.name;

  if (newStatus === AppointmentStatus.CANCELLED_BY_CLIENT) {
    const owner = await prisma.user.findUnique({
      where: { id: appointment.business.ownerId },
      select: { name: true },
    });
    const ownerName = owner?.name ?? 'בעל/ת העסק';

    await enqueueWhatsAppIfPhone(
      appointment.customer?.phoneEnc,
      appointment.customerId,
      'התור בוטל',
      `שלום ${customerName},\nביטול תור לשירות ${serviceName} ב${businessName} בתאריך ${dateFormatted} ובשעה ${timeFormatted} בוטל בהצלחה!`,
      {
        type: 'WHATSAPP',
        template: 'client_cancel_customer',
        appointmentId: updated.id,
        name: customerName,
        service: serviceName,
        bussinesName: businessName,
        date: dateFormatted,
        time: timeFormatted,
      },
    );
    await enqueueWhatsAppIfPhone(
      appointment.business.phoneEnc,
      appointment.business.ownerId,
      'תור בוטל',
      `שלום ${ownerName},\n${customerName} ביטל את התור שלו ל${serviceName} בתאריך ${dateFormatted} ובשעה ${timeFormatted}\nלפרטים נוספים היכנס/י לאפליקציה.`,
      {
        type: 'WHATSAPP',
        template: 'client_cancel_business',
        appointmentId: updated.id,
        name: ownerName,
        clientName: customerName,
        service: serviceName,
        date: dateFormatted,
        time: timeFormatted,
      },
    );
  } else if (newStatus === AppointmentStatus.PENDING_OWNER_DECISION) {
    const owner = await prisma.user.findUnique({
      where: { id: appointment.business.ownerId },
      select: { name: true },
    });
    const ownerName = owner?.name ?? 'בעל/ת העסק';

    await enqueueWhatsAppIfPhone(
      appointment.customer?.phoneEnc,
      appointment.customerId,
      'בקשת ביטול נשלחה',
      `שלום ${customerName},\nבקשתך לביטול תור ל${serviceName} ב${businessName} בתאריך ${dateFormatted} בשעה ${timeFormatted} נשלחה לבעל העסק לאישור.\nנעדכן אותך כשתתקבל החלטה.\nלפרטים נוספים היכנס/י לאפליקציה.`,
      {
        type: 'WHATSAPP',
        template: 'late_cancel_customer',
        appointmentId: updated.id,
        name: customerName,
        service: serviceName,
        business: businessName,
        date: dateFormatted,
        time: timeFormatted,
      },
    );
    await enqueueWhatsAppIfPhone(
      appointment.business.phoneEnc,
      appointment.business.ownerId,
      'בקשת ביטול מאוחר',
      `שלום ${ownerName},\n${customerName} ביקש/ה לבטל תור ל${serviceName} בתאריך ${dateFormatted} בשעה ${timeFormatted}.\nאנא אשר/י או דחה/י את הבקשה באפליקציה.\nלפרטים נוספים היכנס/י לאפליקציה.`,
      {
        type: 'WHATSAPP',
        template: 'late_cancel_business',
        appointmentId: updated.id,
        name: ownerName,
        clientName: customerName,
        service: serviceName,
        date: dateFormatted,
        time: timeFormatted,
      },
    );
  } else if (newStatus === AppointmentStatus.CANCELLED_BY_BUSINESS) {
    let businessPhone = '';
    if (appointment.business.phoneEnc) {
      try {
        businessPhone = await sharedClient.decryptPii(appointment.business.phoneEnc);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[booking] failed to decrypt business phone for WHATSAPP', error);
      }
    }

    await enqueueWhatsAppIfPhone(
      appointment.customer?.phoneEnc,
      appointment.customerId,
      'התור בוטל',
      `התור שלך ל${serviceName} בעסק ${businessName} בתאריך ${dateFormatted} ובשעה ${timeFormatted} בוטל על ידי בעל העסק. לפרטים התקשר ${businessPhone}.`,
      {
        type: 'WHATSAPP',
        template: 'business_cancel_customer',
        appointmentId: updated.id,
        service: serviceName,
        business: businessName,
        date: dateFormatted,
        time: timeFormatted,
        business_phone: businessPhone,
      },
    );
  }

  return toAppointmentDto(updated);
}

export async function resolveLateCancellation(
  appointmentId: string,
  userId: string,
  userRole: string,
  approved: boolean,
): Promise<AppointmentDto> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      business: true,
      service: { select: { name: true, durationMins: true } },
      customer: { select: { name: true, phoneEnc: true } },
    },
  });

  if (!appointment) {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'תור לא נמצא');
  }

  if (appointment.status !== AppointmentStatus.PENDING_OWNER_DECISION) {
    throw new AppError(409, API_ERROR_CODES.CONFLICT, 'אין בקשת ביטול מאוחרת לתור זה');
  }

  const isOwner = appointment.business.ownerId === userId;
  const canDecide =
    isOwner ||
    (userRole === UserRole.EMPLOYEE &&
      (await hasBusinessPermission(
        userId,
        userRole,
        appointment.businessId,
        EmployeePermission.CANCEL_APPOINTMENTS,
      )));

  if (!canDecide) {
    throw new AppError(403, API_ERROR_CODES.PERMISSION_DENIED, 'אין לך הרשאה לבצע את זה');
  }

  if (appointment.startsAt <= new Date()) {
    throw new AppError(400, API_ERROR_CODES.PAST_APPOINTMENT, 'לא ניתן לטפל בתור שעבר');
  }

  const newStatus = approved
    ? AppointmentStatus.CANCELLED_BY_CLIENT
    : AppointmentStatus.CONFIRMED;

  const updated = await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: newStatus },
    include: {
      business: { select: { name: true, slug: true } },
      service: { select: { name: true, durationMins: true } },
      customer: { select: { name: true, phoneEnc: true } },
    },
  });

  const dateStr = toJerusalemDateString(appointment.startsAt);
  await invalidateSlotCache(appointment.businessId, dateStr, appointment.serviceId);

  const dateFormatted = formatJerusalemDateDisplay(appointment.startsAt);
  const timeFormatted = toJerusalemTimeString(appointment.startsAt);
  const customerName = appointment.customer?.name ?? 'לקוח/ה';
  const serviceName = appointment.service.name;
  const businessName = appointment.business.name;

  if (approved) {
    await enqueueWhatsAppIfPhone(
      appointment.customer?.phoneEnc,
      appointment.customerId,
      'בקשת הביטול אושרה',
      `שלום ${customerName},\nבקשתך לביטול תור ל${serviceName} ב${businessName} בתאריך ${dateFormatted} בשעה ${timeFormatted} אושרה על ידי בעל העסק.\nהתור בוטל בהצלחה.\nלפרטים נוספים היכנס/י לאפליקציה.`,
      {
        type: 'WHATSAPP',
        template: 'late_cancel_approved_customer',
        appointmentId: updated.id,
        name: customerName,
        service: serviceName,
        business: businessName,
        date: dateFormatted,
        time: timeFormatted,
      },
    );
  } else {
    await enqueueWhatsAppIfPhone(
      appointment.customer?.phoneEnc,
      appointment.customerId,
      'בקשת הביטול נדחתה',
      `שלום ${customerName},\nבקשתך לביטול תור ל${serviceName} ב${businessName} בתאריך ${dateFormatted} בשעה ${timeFormatted} נדחתה על ידי בעל העסק.\nהתור נשאר בתוקף.\nלפרטים נוספים היכנס/י לאפליקציה.`,
      {
        type: 'WHATSAPP',
        template: 'late_cancel_rejected_customer',
        appointmentId: updated.id,
        name: customerName,
        service: serviceName,
        business: businessName,
        date: dateFormatted,
        time: timeFormatted,
      },
    );
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
      service: { select: { name: true, durationMins: true } },
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

export async function getBusinessAppointmentStats(
  businessId: string,
  userId: string,
  userRole: string,
  date?: string,
): Promise<BusinessAppointmentStats> {
  await assertAnyBusinessPermission(userId, userRole, businessId, CALENDAR_ACCESS_PERMISSIONS);

  const today = date ?? toJerusalemDateString(new Date());
  const dayStart = parseJerusalemDateTime(today, '00:00');
  const dayEnd = addMinutes(dayStart, 24 * 60);
  const activeFilter = { status: { notIn: [...CANCELLED_STATUSES] } };

  const [totalAllTime, todayTotal, todayConfirmed, serviceGroups] = await Promise.all([
    prisma.appointment.count({ where: { businessId, ...activeFilter } }),
    prisma.appointment.count({
      where: { businessId, startsAt: { gte: dayStart, lt: dayEnd }, ...activeFilter },
    }),
    prisma.appointment.count({
      where: {
        businessId,
        startsAt: { gte: dayStart, lt: dayEnd },
        status: AppointmentStatus.CONFIRMED,
      },
    }),
    prisma.appointment.groupBy({
      by: ['serviceId'],
      where: { businessId, ...activeFilter },
      _count: { serviceId: true },
      orderBy: { _count: { serviceId: 'desc' } },
    }),
  ]);

  type ServiceInfo = { id: string; name: string; price: number };
  const services: ServiceInfo[] = serviceGroups.length
    ? await prisma.service.findMany({
        where: { id: { in: serviceGroups.map((group) => group.serviceId) } },
        select: { id: true, name: true, price: true },
      })
    : [];
  const serviceById = new Map<string, ServiceInfo>(
    services.map((service) => [service.id, service]),
  );

  const totalRevenueAllTime = serviceGroups.reduce((sum, group) => {
    const price = serviceById.get(group.serviceId)?.price ?? 0;
    return sum + price * group._count.serviceId;
  }, 0);

  const topServices = serviceGroups.slice(0, 5).map((group) => ({
    serviceId: group.serviceId,
    serviceName: serviceById.get(group.serviceId)?.name ?? 'שירות',
    count: group._count.serviceId,
  }));

  return { totalAllTime, todayTotal, todayConfirmed, totalRevenueAllTime, topServices };
}

export async function getBusinessAppointments(
  businessId: string,
  userId: string,
  userRole: string,
  date?: string,
  view: 'day' | 'week' = 'day',
): Promise<AppointmentDto[]> {
  await assertAnyBusinessPermission(userId, userRole, businessId, CALENDAR_ACCESS_PERMISSIONS);

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
      service: { select: { name: true, durationMins: true } },
      customer: { select: { name: true, phoneEnc: true, emailEnc: true, avatarUrl: true } },
    },
    orderBy: { startsAt: 'asc' },
  });

  return Promise.all(appointments.map(toOwnerAppointmentDto));
}

export async function createTimeBlock(
  businessId: string,
  userId: string,
  userRole: string,
  startsAt: string,
  endsAt: string,
  note?: string,
) {
  await assertBusinessPermission(userId, userRole, businessId, EmployeePermission.CALENDAR_BLOCK_HOURS);

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

export async function deleteTimeBlock(
  businessId: string,
  blockId: string,
  userId: string,
  userRole: string,
): Promise<void> {
  await assertBusinessPermission(userId, userRole, businessId, EmployeePermission.CALENDAR_BLOCK_HOURS);

  const block = await prisma.timeBlock.findFirst({ where: { id: blockId, businessId } });
  if (!block) {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'חסימה לא נמצאה');
  }

  await prisma.timeBlock.delete({ where: { id: blockId } });
  const dateStr = toJerusalemDateString(block.startsAt);
  await invalidateSlotCache(businessId, dateStr);
}

export async function getTimeBlocks(
  businessId: string,
  userId: string,
  userRole: string,
  date?: string,
) {
  await assertAnyBusinessPermission(userId, userRole, businessId, CALENDAR_ACCESS_PERMISSIONS);

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
