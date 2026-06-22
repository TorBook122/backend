import { internalPost } from '@torbook/shared/server/http-client';

export type QueueJobType = 'REMINDER' | 'CANCELLATION';

export type QueueJob = {
  type: QueueJobType;
  appointmentId: string;
  scheduledAt: string;
};

function getBaseUrl(): string {
  const url = process.env.QUEUE_SERVICE_URL?.trim();
  if (!url) {
    throw new Error('QUEUE_SERVICE_URL is required');
  }
  return url;
}

export async function enqueueJob(job: QueueJob): Promise<void> {
  await internalPost(getBaseUrl(), '/jobs', job);
}

export const queueClient = {
  enqueueJob,
};
