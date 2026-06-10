export type QueueJobType = 'REMINDER' | 'CANCELLATION';

export type QueueJob = {
  type: QueueJobType;
  appointmentId: string;
  scheduledAt: string;
};

function isLogOnlyMode(): boolean {
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
    return;
  }

  const { SQSClient, SendMessageCommand } = await import('@aws-sdk/client-sqs');
  const client = new SQSClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
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
  const { handleReminder, handleCancellation } = await import('./handlers.js');
  if (job.type === 'REMINDER') {
    await handleReminder(job.appointmentId);
  } else if (job.type === 'CANCELLATION') {
    await handleCancellation(job.appointmentId);
  }
}

export async function startWorker(): Promise<void> {
  if (isLogOnlyMode()) {
    // eslint-disable-next-line no-console
    console.log('[SQS worker] log-only mode — worker not started');
    return;
  }

  const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } = await import('@aws-sdk/client-sqs');
  const client = new SQSClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
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
