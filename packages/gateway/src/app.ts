import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';
import { issueCsrfToken, validateCsrf } from './middleware/csrf.js';
import { errorHandler } from './middleware/error-handler.js';
import { proxyAuth } from './middleware/proxy-auth.js';
import adminRoutes from './routes/admin.routes.js';

function serviceProxy(target: string) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    on: {
      proxyReq: fixRequestBody,
    },
  });
}

export function createApp(): Express {
  const app = express();

  const authServiceUrl = process.env.AUTH_SERVICE_URL ?? 'http://localhost:3002';
  const bookingServiceUrl = process.env.BOOKING_SERVICE_URL ?? 'http://localhost:3003';

  app.use(helmet());
  app.use(cookieParser());
  app.use('/admin', adminRoutes);

  const corsOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || corsOrigins.includes(origin)) {
          callback(null, origin ?? corsOrigins[0]);
          return;
        }
        callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    }),
  );

  app.use(express.json());
  app.use(validateCsrf);

  app.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok' } });
  });

  app.get('/api/v1/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok' } });
  });

  app.get('/api/v1/csrf', issueCsrfToken);

  app.use('/api/v1/auth', serviceProxy(authServiceUrl));
  app.use('/api/v1/users', proxyAuth, serviceProxy(authServiceUrl));
  app.use('/api/v1/businesses', proxyAuth, serviceProxy(bookingServiceUrl));
  app.use('/api/v1/services', proxyAuth, serviceProxy(bookingServiceUrl));
  app.use('/api/v1/appointments', proxyAuth, serviceProxy(bookingServiceUrl));

  app.use(errorHandler);

  return app;
}
