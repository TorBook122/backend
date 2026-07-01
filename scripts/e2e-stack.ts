import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Express } from 'express';

const API_PORT = Number(process.env.PORT ?? 3001);
const servers: Server[] = [];

async function listen(app: Express, port?: number): Promise<number> {
  const server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(port ?? 0, resolve);
  });
  servers.push(server);
  return port ?? (server.address() as AddressInfo).port;
}

function applyDefaults(): void {
  process.env.NODE_ENV = 'test';
  process.env.AWS_SQS_QUEUE_URL = '';
  process.env.PORT = String(API_PORT);
  process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:3000';
  process.env.INTERNAL_SERVICE_SECRET =
    process.env.INTERNAL_SERVICE_SECRET ?? 'test-internal-secret-key';
  process.env.JWT_ACCESS_SECRET =
    process.env.JWT_ACCESS_SECRET ?? 'test-access-secret-min-32-chars-xx';
  process.env.JWT_REFRESH_SECRET =
    process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret-min-32-chars-x';
  process.env.AES_ENCRYPTION_KEY =
    process.env.AES_ENCRYPTION_KEY ?? '0000000000000000000000000000000000000000000000000000000000000000';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? 'postgresql://torbook:torbook_dev@localhost:5433/torbook';
  // Always use local Redis for the in-process E2E stack (`.env` may point at Render).
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.FCM_SERVICE_ACCOUNT_JSON =
    process.env.FCM_SERVICE_ACCOUNT_JSON ?? '{"type":"service_account"}';
}

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

async function shutdown(
  disconnectAuthRedis: () => Promise<void>,
  disconnectBookingRedis: () => Promise<void>,
): Promise<void> {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
  servers.length = 0;
  await Promise.all([disconnectAuthRedis(), disconnectBookingRedis()]);
}

async function main(): Promise<void> {
  applyDefaults();

  const { default: dbApp } = await import('../packages/db/src/server.js');
  const { default: sharedApp } = await import('../packages/shared/src/server.js');
  const { createApp: createAuthApp } = await import('../packages/auth-service/src/app.js');
  const { createApp: createBookingApp } = await import('../packages/booking-service/src/app.js');
  const { createApiApp: createQueueApp } = await import('../packages/queue/src/api.js');
  const { createApp: createGatewayApp } = await import('../packages/gateway/src/app.js');
  const { getRedis: getAuthRedis, disconnectRedis: disconnectAuthRedis } = await import(
    '../packages/auth-service/src/lib/redis.js'
  );
  const { getRedis: getBookingRedis, disconnectRedis: disconnectBookingRedis } = await import(
    '../packages/booking-service/src/lib/redis.js'
  );

  const [dbPort, sharedPort] = await Promise.all([listen(dbApp), listen(sharedApp)]);
  process.env.DB_SERVICE_URL = `http://127.0.0.1:${dbPort}`;
  process.env.SHARED_SERVICE_URL = `http://127.0.0.1:${sharedPort}`;

  await Promise.all([getAuthRedis().connect(), getBookingRedis().connect()]);

  const [authPort, bookingPort, queuePort] = await Promise.all([
    listen(createAuthApp()),
    listen(createBookingApp()),
    listen(createQueueApp()),
  ]);

  process.env.AUTH_SERVICE_URL = `http://127.0.0.1:${authPort}`;
  process.env.BOOKING_SERVICE_URL = `http://127.0.0.1:${bookingPort}`;
  process.env.QUEUE_SERVICE_URL = `http://127.0.0.1:${queuePort}`;

  await listen(createGatewayApp(), API_PORT);

  // eslint-disable-next-line no-console
  console.log(`E2E stack ready — gateway on http://localhost:${API_PORT}`);
  await waitForHealth(`http://localhost:${API_PORT}/api/v1/health`);

  const onSignal = () => {
    shutdown(disconnectAuthRedis, disconnectBookingRedis)
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
  process.exit(1);
});
