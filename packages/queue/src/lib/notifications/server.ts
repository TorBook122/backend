import express, { type Express } from 'express';
import { requireInternalKey } from '@torbook/shared/server/internal-auth';
import { sendPushToUser, type PushPayload } from './push.js';

const app: Express = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' } });
});

const internal = express.Router();
internal.use(requireInternalKey);

internal.post('/push', async (req, res) => {
  const { userId, title, body, data } = req.body as {
    userId?: unknown;
    title?: unknown;
    body?: unknown;
    data?: Record<string, string>;
  };

  if (typeof userId !== 'string' || typeof title !== 'string' || typeof body !== 'string') {
    res.status(400).json({ success: false, error: 'userId, title, and body are required' });
    return;
  }

  const payload: PushPayload = { title, body, ...(data ? { data } : {}) };
  await sendPushToUser(userId, payload);
  res.json({ success: true, data: { sent: true } });
});

app.use(internal);

const port = Number(process.env.PORT ?? 3005);

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`TorBook notifications service listening on port ${port}`);
  });
}

export default app;
