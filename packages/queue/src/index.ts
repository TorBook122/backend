export type { QueueJob, QueueJobType } from '@torbook/shared';

import type { QueueJob } from '@torbook/shared';

function isLogOnlyMode(): boolean {
  if (process.env.AWS_ENDPOINT_URL?.trim()) return false;
  const queueUrl = process.env.AWS_SQS_QUEUE_URL?.trim();
  if (!queueUrl) return true;
  // Placeholder URL from .env.example — no real AWS queue in local dev
  if (queueUrl.includes('000000000000')) return true;
  return false;
}

export async function enqueueJob(job: QueueJob): Promise<void> {
  if (isLogOnlyMode()) {
    // eslint-disable-next-line no-console
    console.log('[SQS log-only enqueue]', job);
    // No SQS worker in local Docker — run due jobs inline so WhatsApp/FCM still fire.
    const delayMs = new Date(job.scheduledAt).getTime() - Date.now();
    if (delayMs <= 1000) {
      await processJob(job);
    } else {
      // eslint-disable-next-line no-console
      console.log('[SQS log-only] delayed job skipped (no worker)', {
        type: job.type,
        scheduledAt: job.scheduledAt,
      });
    }
    return;
  }

  const { SQSClient, SendMessageCommand } = await import('@aws-sdk/client-sqs');
  const client = new SQSClient({
    region: process.env.AWS_REGION ?? 'us-east-1',
    ...(process.env.AWS_ENDPOINT_URL
      ? { endpoint: process.env.AWS_ENDPOINT_URL }
      : {}),
  });
  const delaySeconds = Math.max(
    0,
    Math.min(900, Math.floor((new Date(job.scheduledAt).getTime() - Date.now()) / 1000)),
  );

  await client.send(
    new SendMessageCommand({
      QueueUrl: process.env.AWS_SQS_QUEUE_URL,
      MessageBody: JSON.stringify(job),
      DelaySeconds: delaySeconds,
    }),
  );
}

export async function processJob(job: QueueJob): Promise<void> {
  if (job.type === 'BOOKING_CONFIRMATION') {
    const { handleBookingConfirmation } = await import('./handlers.js');
    await handleBookingConfirmation(job);
    return;
  }

  const { handlePushNotification } = await import('./handlers.js');
  await handlePushNotification(job);
}

export async function startWorker(): Promise<void> {
  if (isLogOnlyMode()) {
    // eslint-disable-next-line no-console
    console.log('[SQS worker] log-only mode — worker not started');
    return;
  }

  const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } = await import('@aws-sdk/client-sqs');
  const client = new SQSClient({
    region: process.env.AWS_REGION ?? 'us-east-1',
    ...(process.env.AWS_ENDPOINT_URL
      ? { endpoint: process.env.AWS_ENDPOINT_URL }
      : {}),
  });
  const queueUrl = process.env.AWS_SQS_QUEUE_URL!;

  // eslint-disable-next-line no-console
  console.log('[SQS worker] started');

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const response = await client.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 20,
      }),
    );

    for (const message of response.Messages ?? []) {
      try {
        const job = JSON.parse(message.Body!) as QueueJob;
        await processJob(job);
        await client.send(
          new DeleteMessageCommand({
            QueueUrl: queueUrl,
            ReceiptHandle: message.ReceiptHandle!,
          }),
        );
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[SQS worker] job failed', error);
      }
    }
  }
}
