import type { QueueJob } from '@torbook/shared';
import { sendPushToUser } from './lib/notifications/index.js';

export async function handlePushNotification(job: QueueJob): Promise<void> {
  await sendPushToUser(job.userId, {
    title: job.title,
    body: job.body,
    data: job.data,
  });
}
