import { startWorker } from '@torbook/queue';

startWorker().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Queue worker failed', err);
  process.exit(1);
});
