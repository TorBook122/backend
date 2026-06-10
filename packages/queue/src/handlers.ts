import { prisma } from '@torbook/db';
import { sendPushToUser } from '@torbook/notifications';

export async function handleReminder(appointmentId: string): Promise<void> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      service: true,
      business: true,
      customer: true,
    },
  });

  if (!appointment || appointment.status !== 'CONFIRMED') return;
  if (appointment.startsAt <= new Date()) return;

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
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      service: true,
      business: { include: { owner: true } },
      customer: true,
    },
  });

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
