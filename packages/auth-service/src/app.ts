import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { errorHandler } from './middleware/error-handler.js';
import { sanitize } from './middleware/sanitize.js';
import authRoutes from './routes/auth.routes.js';
import internalRoutes from './routes/internal.routes.js';
import userRoutes from './routes/user.routes.js';

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cookieParser());

  const internalCorsOrigins = process.env.INTERNAL_CORS_ORIGIN?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (internalCorsOrigins?.length) {
    app.use(
      cors({
        origin: internalCorsOrigins,
        credentials: true,
      }),
    );
  }

  app.use(express.json());
  app.use(sanitize);

  app.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok' } });
  });

  app.use('/internal/v1', internalRoutes);
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/users', userRoutes);

  app.use(errorHandler);

  return app;
}
