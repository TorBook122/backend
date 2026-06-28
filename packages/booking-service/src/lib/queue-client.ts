import type { QueueJob } from '@torbook/shared';

export async function enqueue(job: QueueJob): Promise<void> {
  const queueServiceUrl = process.env.QUEUE_SERVICE_URL ?? 'http://localhost:3004';
  const internalSecret = process.env.INTERNAL_SERVICE_SECRET;

  if (!internalSecret) {
    throw new Error('INTERNAL_SERVICE_SECRET is required');
  }

  const response = await fetch(`${queueServiceUrl}/internal/v1/jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': internalSecret,
    },
    body: JSON.stringify(job),
  });

  if (!response.ok) {
    throw new Error(`Failed to enqueue job: HTTP ${response.status}`);
  }
}

export const queueClient = { enqueue };
