import { Router } from 'express';
import { prisma } from '../client.js';

const router = Router();

router.post('/', async (req, res) => {
  const { action, userId, ipAddress, metadata } = req.body as {
    action?: string;
    userId?: string | null;
    ipAddress?: string | null;
    metadata?: unknown;
  };

  if (!action) {
    res.status(400).json({ success: false, error: 'action is required' });
    return;
  }

  const log = await prisma.auditLog.create({
    data: {
      action,
      userId: userId ?? null,
      ipAddress: ipAddress ?? null,
      metadata: metadata as never,
    },
  });
  res.status(201).json({ success: true, data: log });
});

export default router;
