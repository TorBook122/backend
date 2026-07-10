import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Express } from 'express';
import dbApp from '@torbook/db/server';
import { createApp as createAuthApp } from '../../../../auth-service/src/app.js';
import { createApp as createBookingApp } from '../../../../booking-service/src/app.js';
import { disconnectRedis as disconnectAuthRedis, getRedis as getAuthRedis } from '../../../../auth-service/src/lib/redis.js';
import { disconnectRedis as disconnectBookingRedis, getRedis as getBookingRedis } from '../../../../booking-service/src/lib/redis.js';
import { createApiApp as createQueueApp } from '../../../../queue/src/api.js';
import { createApp as createGatewayApp } from '../../app.js';

export type TestStack = {
  gateway: Express;
  dbServer: Server;
  authServer: Server;
  bookingServer: Server;
  queueServer: Server;
  dbPort: number;
  authPort: number;
  bookingPort: number;
  queuePort: number;
};

export async function startTestStack(): Promise<TestStack> {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-xx';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-x';
  process.env.INTERNAL_SERVICE_SECRET = 'test-internal-service-secret';
  process.env.AES_ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000';
  process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
  process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
  process.env.NODE_ENV = 'test';

  await Promise.all([getAuthRedis().connect(), getBookingRedis().connect()]);

  const dbServer = dbApp.listen(0);
  const dbPort = (dbServer.address() as AddressInfo).port;
  process.env.DB_SERVICE_URL = `http://127.0.0.1:${dbPort}`;

  const authServer = createAuthApp().listen(0);
  const bookingServer = createBookingApp().listen(0);
  const queueServer = createQueueApp().listen(0);

  const authPort = (authServer.address() as AddressInfo).port;
  const bookingPort = (bookingServer.address() as AddressInfo).port;
  const queuePort = (queueServer.address() as AddressInfo).port;

  process.env.AUTH_SERVICE_URL = `http://127.0.0.1:${authPort}`;
  process.env.BOOKING_SERVICE_URL = `http://127.0.0.1:${bookingPort}`;
  process.env.QUEUE_SERVICE_URL = `http://127.0.0.1:${queuePort}`;

  const gateway = createGatewayApp();

  return {
    gateway,
    dbServer,
    authServer,
    bookingServer,
    queueServer,
    dbPort,
    authPort,
    bookingPort,
    queuePort,
  };
}

export async function stopTestStack(stack: TestStack): Promise<void> {
  await Promise.all([
    new Promise<void>((resolve, reject) => {
      stack.dbServer.close((err) => (err ? reject(err) : resolve()));
    }),
    new Promise<void>((resolve, reject) => {
      stack.authServer.close((err) => (err ? reject(err) : resolve()));
    }),
    new Promise<void>((resolve, reject) => {
      stack.bookingServer.close((err) => (err ? reject(err) : resolve()));
    }),
    new Promise<void>((resolve, reject) => {
      stack.queueServer.close((err) => (err ? reject(err) : resolve()));
    }),
  ]);
  await Promise.all([disconnectAuthRedis(), disconnectBookingRedis()]);
}

export async function clearAuthRedisKeys(): Promise<void> {
  const redis = getAuthRedis();
  const loginKeys = await redis.keys('login_fail:*');
  const refreshKeys = await redis.keys('refresh:*');
  if (loginKeys.length) await redis.del(...loginKeys);
  if (refreshKeys.length) await redis.del(...refreshKeys);
}

export async function clearBookingRedisKeys(): Promise<void> {
  const redis = getBookingRedis();
  const slotKeys = await redis.keys('slots:*');
  if (slotKeys.length) await redis.del(...slotKeys);
}
