import { Router } from 'express';
import { prisma } from '../client.js';

const router = Router();

router.get('/user/:userId', async (req, res) => {
  const favorites = await prisma.favorite.findMany({
    where: { userId: req.params.userId },
    include: { business: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ success: true, data: favorites });
});

router.get('/user/:userId/business/:businessId/exists', async (req, res) => {
  const fav = await prisma.favorite.findUnique({
    where: {
      userId_businessId: { userId: req.params.userId, businessId: req.params.businessId },
    },
  });
  res.json({ success: true, data: { exists: !!fav } });
});

router.post('/upsert', async (req, res) => {
  const { userId, businessId } = req.body as { userId?: string; businessId?: string };
  if (!userId || !businessId) {
    res.status(400).json({ success: false, error: 'userId and businessId are required' });
    return;
  }

  const favorite = await prisma.favorite.upsert({
    where: { userId_businessId: { userId, businessId } },
    create: { userId, businessId },
    update: {},
    include: { business: true },
  });
  res.status(201).json({ success: true, data: favorite });
});

router.delete('/user/:userId/business/:businessId', async (req, res) => {
  await prisma.favorite.deleteMany({
    where: { userId: req.params.userId, businessId: req.params.businessId },
  });
  res.json({ success: true, data: { removed: true } });
});

export default router;
