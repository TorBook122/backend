import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';
import { issueCsrfToken, validateCsrf } from './middleware/csrf.js';
import { errorHandler } from './middleware/error-handler.js';
import { proxyAuth } from './middleware/proxy-auth.js';
import adminRoutes from './routes/admin.routes.js';

function serviceProxy(target: string, apiPrefix: string) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite: (path) => `${apiPrefix}${path}`,
    on: {
      proxyReq: fixRequestBody,
    },
  });
}

// Trust-boundary headers that only the gateway is allowed to set (after validating the
// caller's JWT). A client could otherwise set these directly and have them forwarded
// verbatim to internal services, so they must be stripped on every inbound request
// before any auth/proxy logic runs.
const SPOOFABLE_TRUST_HEADERS = ['x-internal-secret', 'x-user-id', 'x-user-role', 'x-user-onboarding'];

function stripSpoofedTrustHeaders(req: express.Request, _res: express.Response, next: express.NextFunction) {
  for (const header of SPOOFABLE_TRUST_HEADERS) {
    delete req.headers[header];
  }
  // Overwrite (never append to) X-Forwarded-For with the gateway's own resolution of the
  // client IP. Internal services are on a trusted loopback hop and read this header
  // directly for rate limiting — without this, a client could prepend an arbitrary
  // spoofed IP to bypass IP-based rate limits / lockouts.
  req.headers['x-forwarded-for'] = req.ip;
  next();
}

export function createApp(): Express {
  const app = express();

  const authServiceUrl = process.env.AUTH_SERVICE_URL ?? 'http://localhost:3002';
  const bookingServiceUrl = process.env.BOOKING_SERVICE_URL ?? 'http://localhost:3003';

  // Render (and similar PaaS) sit in front of the gateway as a single reverse-proxy hop;
  // trust exactly that hop's X-Forwarded-For entry when resolving req.ip so it can't be
  // spoofed by a client-supplied header with extra prepended entries.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cookieParser());
  app.use(stripSpoofedTrustHeaders);
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

  app.use(express.json({ limit: '512kb' }));
  app.use(validateCsrf);

  app.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok' } });
  });

  app.get('/api/v1/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok' } });
  });

  app.get('/api/v1/csrf', issueCsrfToken);

  app.use('/api/v1/auth', serviceProxy(authServiceUrl, '/api/v1/auth'));
  app.use('/api/v1/users', proxyAuth, serviceProxy(authServiceUrl, '/api/v1/users'));
  app.use('/api/v1/announcements', proxyAuth, serviceProxy(bookingServiceUrl, '/api/v1/announcements'));
  app.use('/api/v1/businesses', proxyAuth, serviceProxy(bookingServiceUrl, '/api/v1/businesses'));
  app.use('/api/v1/services', proxyAuth, serviceProxy(bookingServiceUrl, '/api/v1/services'));
  app.use('/api/v1/employees', proxyAuth, serviceProxy(bookingServiceUrl, '/api/v1/employees'));
  app.use('/api/v1/employee-roles', proxyAuth, serviceProxy(bookingServiceUrl, '/api/v1/employee-roles'));
  app.use('/api/v1/appointments', proxyAuth, serviceProxy(bookingServiceUrl, '/api/v1/appointments'));
  app.use('/api/v1/support', proxyAuth, serviceProxy(bookingServiceUrl, '/api/v1/support'));

  app.use(errorHandler);

  return app;
}
