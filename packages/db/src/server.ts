import express, { type Express } from 'express';
import { requireInternalKey } from '@torbook/shared/server/internal-auth';
import { prisma } from './client.js';
import usersRoutes from './routes/users.routes.js';
import businessesRoutes from './routes/businesses.routes.js';
import servicesRoutes from './routes/services.routes.js';
import appointmentsRoutes from './routes/appointments.routes.js';
import favoritesRoutes from './routes/favorites.routes.js';
import likesRoutes from './routes/likes.routes.js';
import commentsRoutes from './routes/comments.routes.js';
import fcmTokensRoutes from './routes/fcm-tokens.routes.js';
import auditLogsRoutes from './routes/audit-logs.routes.js';

const app: Express = express();
app.use(express.json());

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ success: true, data: { status: 'ok' } });
  } catch {
    res.status(503).json({ success: false, error: 'Database unavailable' });
  }
});

const internal = express.Router();
internal.use(requireInternalKey);

internal.use('/users', usersRoutes);
internal.use('/businesses', businessesRoutes);
internal.use('/services', servicesRoutes);
internal.use('/appointments', appointmentsRoutes);
internal.use('/favorites', favoritesRoutes);
internal.use('/likes', likesRoutes);
internal.use('/comments', commentsRoutes);
internal.use('/fcm-tokens', fcmTokensRoutes);
internal.use('/audit-logs', auditLogsRoutes);

app.use(internal);

const port = Number(process.env.DB_SERVICE_PORT ?? 3010);

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`KvaTor db service listening on port ${port}`);
  });
}

export default app;
