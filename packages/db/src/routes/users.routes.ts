import { Router } from 'express';
import { prisma } from '../client.js';

const router = Router();

router.get('/:id', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) {
    res.status(404).json({ success: false, error: 'User not found' });
    return;
  }
  res.json({ success: true, data: user });
});

router.get('/lookup/by-phone-hash/:phoneHash', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { phoneHash: req.params.phoneHash } });
  res.json({ success: true, data: user });
});

router.get('/lookup/by-email-hash/:emailHash', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { emailHash: req.params.emailHash } });
  res.json({ success: true, data: user });
});

router.post('/lookup', async (req, res) => {
  const { isEmail, hash } = req.body as { isEmail?: boolean; hash?: string };
  if (typeof isEmail !== 'boolean' || typeof hash !== 'string') {
    res.status(400).json({ success: false, error: 'isEmail and hash are required' });
    return;
  }

  const user = await prisma.user.findFirst({
    where: isEmail ? { emailHash: hash } : { phoneHash: hash },
  });
  res.json({ success: true, data: user });
});

router.post('/', async (req, res) => {
  const user = await prisma.user.create({ data: req.body });
  res.status(201).json({ success: true, data: user });
});

router.patch('/:id', async (req, res) => {
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: req.body,
  });
  res.json({ success: true, data: user });
});

router.get('/', async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      emailEnc: true,
      role: true,
      createdAt: true,
      deletedAt: true,
    },
  });
  res.json({ success: true, data: users });
});

router.post('/:id/soft-delete', async (req, res) => {
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { deletedAt: new Date() },
  });
  res.json({ success: true, data: user });
});

router.post('/:id/gdpr-delete', async (req, res) => {
  const userId = req.params.id;
  await prisma.$transaction(async (tx) => {
    await tx.fcmToken.deleteMany({ where: { userId } });
    await tx.favorite.deleteMany({ where: { userId } });
    await tx.user.update({
      where: { id: userId },
      data: {
        name: 'משתמש שנמחק',
        emailEnc: null,
        emailHash: null,
        phoneEnc: 'deleted',
        phoneHash: `deleted-${userId}`,
        passwordHash: 'deleted',
        deletedAt: new Date(),
      },
    });
  });
  res.json({ success: true, data: { gdprDeleted: true } });
});

router.post('/:id/complete-onboarding', async (req, res) => {
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { onboardingCompletedAt: new Date() },
  });
  res.json({ success: true, data: user });
});

export default router;
