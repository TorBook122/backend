import express, { type Express } from 'express';
import { requireInternalKey } from '@torbook/shared/server/internal-auth';
import { enqueueJob, type QueueJob } from './lib/queue.js';

const app: Express = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' } });
});

const internal = express.Router();
internal.use(requireInternalKey);

internal.post('/jobs', async (req, res) => {
  const job = req.body as QueueJob;
  if (!job?.type || !job?.appointmentId || !job?.scheduledAt) {
    res.status(400).json({ success: false, error: 'type, appointmentId, and scheduledAt are required' });
    return;
  }

  await enqueueJob(job);
  res.status(202).json({ success: true, data: { enqueued: true } });
});

app.use(internal);

const port = Number(process.env.PORT ?? 3006);

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`TorBook queue-enqueue service listening on port ${port}`);
  });
}

export { enqueueJob, processJob, startWorker, type QueueJob, type QueueJobType } from './lib/queue.js';
export default app;
