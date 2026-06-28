import { Router } from 'express';
import { prisma } from '../client.js';

const router = Router();

router.get('/', async (req, res) => {
  const userId = req.query.userId as string | undefined;
  if (!userId) {
    res.status(400).json({ success: false, error: 'userId is required' });
    return;
  }

  const tokens = await prisma.fcmToken.findMany({ where: { userId } });
  res.json({ success: true, data: tokens });
});

router.post('/upsert', async (req, res) => {
  const { userId, token } = req.body as { userId?: string; token?: string };
  if (!userId || !token) {
    res.status(400).json({ success: false, error: 'userId and token are required' });
    return;
  }

  await prisma.fcmToken.upsert({
    where: { token },
    create: { userId, token },
    update: { userId },
  });
  res.json({ success: true, data: { registered: true } });
});

router.delete('/user/:userId', async (req, res) => {
  const token = req.query.token as string | undefined;
  if (token) {
    await prisma.fcmToken.deleteMany({ where: { userId: req.params.userId, token } });
  } else {
    await prisma.fcmToken.deleteMany({ where: { userId: req.params.userId } });
  }
  res.json({ success: true, data: { removed: true } });
});

router.delete('/stale', async (req, res) => {
  const { ids } = req.body as { ids?: string[] };
  if (!Array.isArray(ids) || ids.length === 0) {
    res.json({ success: true, data: { deleted: 0 } });
    return;
  }

  const result = await prisma.fcmToken.deleteMany({ where: { id: { in: ids } } });
  res.json({ success: true, data: { deleted: result.count } });
});

export default router;
