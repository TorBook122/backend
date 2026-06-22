import { internalPost } from '@torbook/shared/server/http-client';
import {
  getAppointmentForCancellation,
  getAppointmentForReminder,
} from './clients/db.client.js';

export type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

function getNotificationsUrl(): string {
  const url = process.env.NOTIFICATIONS_SERVICE_URL?.trim();
  if (!url) {
    throw new Error('NOTIFICATIONS_SERVICE_URL is required');
  }
  return url;
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  await internalPost(getNotificationsUrl(), '/push', { userId, ...payload });
}

export async function handleReminder(appointmentId: string): Promise<void> {
  const appointment = await getAppointmentForReminder(appointmentId) as {
    id: string;
    status: string;
    startsAt: string;
    customerId: string;
    service: { name: string };
    business: { name: string; slug: string };
  } | null;

  if (!appointment || appointment.status !== 'CONFIRMED') return;
  if (new Date(appointment.startsAt) <= new Date()) return;

  await sendPushToUser(appointment.customerId, {
    title: 'תזכורת לתור',
    body: `יש לך תור ל${appointment.service.name} ב${appointment.business.name} בעוד שעה`,
    data: {
      type: 'REMINDER',
      appointmentId: appointment.id,
      businessSlug: appointment.business.slug,
    },
  });
}

export async function handleCancellation(appointmentId: string): Promise<void> {
  const appointment = await getAppointmentForCancellation(appointmentId) as {
    id: string;
    status: string;
    customerId: string;
    service: { name: string };
    business: { name: string; slug: string; ownerId: string };
    customer: { name: string };
  } | null;

  if (!appointment) return;

  if (appointment.status === 'PENDING_OWNER_DECISION') {
    await sendPushToUser(appointment.business.ownerId, {
      title: 'בקשת ביטול מאוחר',
      body: `${appointment.customer.name} ביקש/ה לבטל תור ל${appointment.service.name}`,
      data: {
        type: 'LATE_CANCELLATION',
        appointmentId: appointment.id,
      },
    });
  } else if (appointment.status === 'CANCELLED_BY_BUSINESS') {
    await sendPushToUser(appointment.customerId, {
      title: 'התור בוטל',
      body: `התור שלך ל${appointment.service.name} ב${appointment.business.name} בוטל`,
      data: {
        type: 'CANCELLED_BY_BUSINESS',
        appointmentId: appointment.id,
        businessSlug: appointment.business.slug,
      },
    });
  }
}
