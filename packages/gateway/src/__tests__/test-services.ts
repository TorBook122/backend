import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import dbApp from '@torbook/db/server';
import authApp from '@torbook/auth/server';
import sharedApp from '@torbook/shared/server';
import queueApp from '@torbook/queue';

const servers: Server[] = [];
let started = false;

async function listen(app: Parameters<typeof createServer>[0]['requestListener']): Promise<number> {
  const server = createServer(app!);
  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });
  servers.push(server);
  return (server.address() as AddressInfo).port;
}

export async function startTestServices(): Promise<void> {
  if (started) return;

  process.env.INTERNAL_SERVICE_SECRET = process.env.INTERNAL_SERVICE_SECRET ?? 'test-internal-secret-key';
  process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret-min-32-chars-xx';
  process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret-min-32-chars-x';
  process.env.AES_ENCRYPTION_KEY =
    process.env.AES_ENCRYPTION_KEY ?? '0000000000000000000000000000000000000000000000000000000000000000';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? 'postgresql://torbook:torbook_dev@localhost:5433/torbook';
  process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
  process.env.AWS_SQS_QUEUE_URL = '';

  const [dbPort, authPort, sharedPort, queuePort] = await Promise.all([
    listen(dbApp),
    listen(authApp),
    listen(sharedApp),
    listen(queueApp),
  ]);

  process.env.DB_SERVICE_URL = `http://127.0.0.1:${dbPort}`;
  process.env.AUTH_SERVICE_URL = `http://127.0.0.1:${authPort}`;
  process.env.SHARED_SERVICE_URL = `http://127.0.0.1:${sharedPort}`;
  process.env.QUEUE_SERVICE_URL = `http://127.0.0.1:${queuePort}`;

  started = true;
}

export async function stopTestServices(): Promise<void> {
  if (!started) return;

  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((err) => (err ? reject(err) : resolve()));
        }),
    ),
  );
  servers.length = 0;
  started = false;
}
