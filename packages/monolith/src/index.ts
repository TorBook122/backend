import { createServer, type RequestListener, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp as createAuthApp } from '../../auth-service/dist/app.js';
import { createApp as createBookingApp } from '../../booking-service/dist/app.js';
import { createApp as createGatewayApp } from '../../gateway/dist/app.js';
import { validateProductionEnv } from '../../gateway/dist/config/validate-env.js';
import { createApiApp as createQueueApp } from '../../queue/dist/api.js';
import { startWorker } from '../../queue/dist/index.js';

const servers: Server[] = [];

type HttpApp = RequestListener;

async function listen(app: HttpApp): Promise<number> {
  const server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  servers.push(server);
  return (server.address() as AddressInfo).port;
}

async function listenOnPort(app: HttpApp, port: number): Promise<void> {
  const server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(port, '0.0.0.0', resolve);
  });
  servers.push(server);
}

async function loadDbAndSharedApps(): Promise<{ dbApp: HttpApp; sharedApp: HttpApp }> {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';

  const [dbModule, sharedModule] = await Promise.all([
    import('../../db/dist/server.js'),
    import('../../shared/dist/server.js'),
  ]);

  if (previousNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = previousNodeEnv;
  }

  return { dbApp: dbModule.default, sharedApp: sharedModule.default };
}

async function shutdown(): Promise<void> {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
}

async function main(): Promise<void> {
  const publicPort = Number(process.env.PORT ?? 3001);

  const { dbApp, sharedApp } = await loadDbAndSharedApps();

  const [dbPort, sharedPort] = await Promise.all([listen(dbApp), listen(sharedApp)]);

  process.env.DB_SERVICE_URL = `http://127.0.0.1:${dbPort}`;
  process.env.SHARED_SERVICE_URL = `http://127.0.0.1:${sharedPort}`;

  const [authPort, bookingPort, queuePort] = await Promise.all([
    listen(createAuthApp()),
    listen(createBookingApp()),
    listen(createQueueApp()),
  ]);

  process.env.AUTH_SERVICE_URL = `http://127.0.0.1:${authPort}`;
  process.env.BOOKING_SERVICE_URL = `http://127.0.0.1:${bookingPort}`;
  process.env.QUEUE_SERVICE_URL = `http://127.0.0.1:${queuePort}`;

  startWorker().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('[monolith] queue worker failed', error);
    process.exit(1);
  });

  validateProductionEnv();

  await listenOnPort(createGatewayApp(), publicPort);

  // eslint-disable-next-line no-console
  console.log(`KvaTor monolith ready — gateway on port ${publicPort}`);
  // eslint-disable-next-line no-console
  console.log(
    [
      `  db=${dbPort}`,
      `  shared=${sharedPort}`,
      `  auth=${authPort}`,
      `  booking=${bookingPort}`,
      `  queue=${queuePort}`,
    ].join(' '),
  );

  const onSignal = () => {
    shutdown()
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

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
