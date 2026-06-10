import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { issueCsrfToken, validateCsrf } from './middleware/csrf.js';
import { errorHandler } from './middleware/error-handler.js';
import { sanitize } from './middleware/sanitize.js';
import appointmentRoutes from './routes/appointment.routes.js';
import authRoutes from './routes/auth.routes.js';
import businessRoutes from './routes/business.routes.js';
import serviceRoutes from './routes/service.routes.js';
import userRoutes from './routes/user.routes.js';

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
      credentials: true,
    }),
  );
  app.use(express.json());
  app.use(cookieParser());
  app.use(sanitize);
  app.use(validateCsrf);

  app.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok' } });
  });

  app.get('/api/v1/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok' } });
  });

  app.get('/api/v1/csrf', issueCsrfToken);

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/businesses', businessRoutes);
  app.use('/api/v1/services', serviceRoutes);
  app.use('/api/v1/appointments', appointmentRoutes);
  app.use('/api/v1/users', userRoutes);

  app.use(errorHandler);

  return app;
}
