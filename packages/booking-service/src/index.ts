import { createApp } from './app.js';

const app = createApp();
const port = Number(process.env.PORT ?? 3003);

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`TorBook Booking Service listening on port ${port}`);
  });
}

export default app;
