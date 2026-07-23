import express, { type Express } from 'express';
import announcementRoutes from './routes/announcement.routes.js';
import appointmentRoutes from './routes/appointment.routes.js';
import businessRoutes from './routes/business.routes.js';
import employeeRoutes from './routes/employee.routes.js';
import internalRoutes from './routes/internal.routes.js';
import serviceRoutes from './routes/service.routes.js';
import { errorHandler } from './middleware/error-handler.js';
import { sanitize } from './middleware/sanitize.js';

export function createApp(): Express {
  const app = express();

  app.use(express.json({ limit: '512kb' }));
  app.use(sanitize);

  app.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok' } });
  });

  app.use('/internal/v1', internalRoutes);
  app.use('/api/v1/announcements', announcementRoutes);
  app.use('/api/v1/businesses', businessRoutes);
  app.use('/api/v1/services', serviceRoutes);
  app.use('/api/v1/employees', employeeRoutes);
  app.use('/api/v1/appointments', appointmentRoutes);

  app.use(errorHandler);

  return app;
}
