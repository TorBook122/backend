import { validateProductionEnv } from './config/validate-env.js';
import { createApp } from './app.js';

validateProductionEnv();

const app = createApp();
const port = Number(process.env.PORT ?? 3001);

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`TorBook API listening on port ${port}`);
  });
}

export default app;
