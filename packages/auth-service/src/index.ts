import { createApp } from './app.js';

const app = createApp();
const port = Number(process.env.AUTH_SERVICE_PORT ?? 3002);

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`KvaTor Auth Service listening on port ${port}`);
  });
}

export default app;
