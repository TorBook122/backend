import { createApiApp } from './api.js';
import { startWorker } from './index.js';

const port = Number(process.env.QUEUE_SERVICE_PORT ?? 3004);

createApiApp().listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[queue] HTTP API listening on port ${port}`);
});

startWorker().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Queue worker failed', err);
  process.exit(1);
});
