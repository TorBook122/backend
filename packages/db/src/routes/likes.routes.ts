import { Router } from 'express';
import { prisma } from '../client.js';

const router = Router();

router.post('/upsert', async (req, res) => {
  const { userId, businessId } = req.body as { userId?: string; businessId?: string };
  if (!userId || !businessId) {
    res.status(400).json({ success: false, error: 'userId and businessId are required' });
    return;
  }

  const like = await prisma.businessLike.upsert({
    where: { userId_businessId: { userId, businessId } },
    create: { userId, businessId },
    update: {},
  });
  res.status(201).json({ success: true, data: like });
});

router.delete('/user/:userId/business/:businessId', async (req, res) => {
  await prisma.businessLike.deleteMany({
    where: { userId: req.params.userId, businessId: req.params.businessId },
  });
  res.json({ success: true, data: { removed: true } });
});

router.get('/business/:businessId/count', async (req, res) => {
  const count = await prisma.businessLike.count({
    where: { businessId: req.params.businessId },
  });
  res.json({ success: true, data: { count } });
});

router.get('/user/:userId/business/:businessId/exists', async (req, res) => {
  const like = await prisma.businessLike.findUnique({
    where: {
      userId_businessId: { userId: req.params.userId, businessId: req.params.businessId },
    },
  });
  res.json({ success: true, data: { exists: !!like } });
});

export default router;
