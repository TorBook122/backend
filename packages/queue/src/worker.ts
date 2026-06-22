import { startWorker } from './lib/queue.js';

startWorker().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Queue worker failed', err);
  process.exit(1);
});
