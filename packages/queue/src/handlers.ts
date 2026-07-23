import type { QueueJob } from '@torbook/shared';
import { sendPushToUser } from './lib/notifications/index.js';
import { sendBookingConfirmationWhatsApp } from './lib/notifications/whatsapp.js';

export async function handlePushNotification(job: QueueJob): Promise<void> {
  await sendPushToUser(job.userId, {
    title: job.title,
    body: job.body,
    data: job.data,
  });
}

export async function handleBookingConfirmation(job: QueueJob): Promise<void> {
  await sendBookingConfirmationWhatsApp(job);
}
