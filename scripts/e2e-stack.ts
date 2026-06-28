import { createServer } from 'node:http';
import { startTestServices, stopTestServices } from '../packages/api/src/test-helpers/test-services.js';
import { createApp } from '../packages/api/src/app.js';
import { disconnectRedis, getRedis } from '../packages/api/src/lib/redis.js';

const API_PORT = Number(process.env.PORT ?? 3001);

async function waitForHealth(url: string, maxAttempts = 60): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // retry until the stack is ready
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });
  }
  throw new Error(`Health check failed: ${url}`);
}

async function shutdown(apiServer: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    apiServer.close((error) => (error ? reject(error) : resolve()));
  });
  await disconnectRedis();
  await stopTestServices();
}

async function main(): Promise<void> {
  process.env.NODE_ENV = process.env.NODE_ENV ?? 'development';
  process.env.AWS_SQS_QUEUE_URL = process.env.AWS_SQS_QUEUE_URL ?? '';
  process.env.PORT = String(API_PORT);
  process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:3000';

  await startTestServices();

  const app = createApp();
  await getRedis().connect();

  const apiServer = createServer(app);
  await new Promise<void>((resolve) => {
    apiServer.listen(API_PORT, resolve);
  });

  // eslint-disable-next-line no-console
  console.log(`E2E stack ready — API on http://localhost:${API_PORT}`);
  await waitForHealth(`http://localhost:${API_PORT}/api/v1/health`);

  const onSignal = () => {
    shutdown(apiServer)
      .then(() => process.exit(0))
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error(error);
        process.exit(1);
      });
  };

  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  await new Promise(() => {});
}

main().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  await stopTestServices().catch(() => {});
  process.exit(1);
});
