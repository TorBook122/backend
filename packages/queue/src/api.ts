import express, { type Express } from 'express';
import { API_ERROR_CODES, type QueueJob } from '@torbook/shared';
import { enqueueJob } from './index.js';

function requireInternalSecret(req: express.Request): void {
  const secret = req.headers['x-internal-secret'];
  const expected = process.env.INTERNAL_SERVICE_SECRET;
  if (!expected || secret !== expected) {
    const error = new Error('Unauthorized') as Error & { status: number; code: string };
    error.status = 401;
    error.code = API_ERROR_CODES.UNAUTHORIZED;
    throw error;
  }
}

function isQueueJob(body: unknown): body is QueueJob {
  if (!body || typeof body !== 'object') return false;
  const job = body as Record<string, unknown>;
  return (
    (job.type === 'REMINDER' || job.type === 'CANCELLATION') &&
    typeof job.userId === 'string' &&
    typeof job.title === 'string' &&
    typeof job.body === 'string' &&
    typeof job.data === 'object' &&
    job.data !== null &&
    typeof job.scheduledAt === 'string'
  );
}

export function createApiApp(): Express {
  const app = express();

  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok' } });
  });

  app.post('/internal/v1/jobs', async (req, res) => {
    try {
      requireInternalSecret(req);

      if (!isQueueJob(req.body)) {
        res.status(400).json({
          success: false,
          error: { code: API_ERROR_CODES.VALIDATION_ERROR, message: 'Invalid job payload' },
        });
        return;
      }

      await enqueueJob(req.body);
      res.status(202).json({ success: true, data: { enqueued: true } });
    } catch (error: unknown) {
      const err = error as { status?: number; code?: string; message?: string };
      if (err.status === 401) {
        res.status(401).json({
          success: false,
          error: { code: API_ERROR_CODES.UNAUTHORIZED, message: 'Unauthorized' },
        });
        return;
      }
      // eslint-disable-next-line no-console
      console.error('[queue api] enqueue failed', error);
      res.status(500).json({
        success: false,
        error: { code: API_ERROR_CODES.INTERNAL_ERROR, message: 'Failed to enqueue job' },
      });
    }
  });

  return app;
}
