export type QueueJobType = 'REMINDER' | 'CANCELLATION';

export type QueueJob = {
  type: QueueJobType;
  userId: string;
  title: string;
  body: string;
  data: Record<string, string>;
  scheduledAt: string;
};
