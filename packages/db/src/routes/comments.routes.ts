import { Router } from 'express';
import { prisma } from '../client.js';

const router = Router();

const CANCELLED_STATUSES = ['CANCELLED_BY_CLIENT', 'CANCELLED_BY_BUSINESS'] as const;

function mapComment(
  comment: {
    id: string;
    text: string;
    createdAt: Date;
    updatedAt: Date;
    userId: string;
    appointmentId: string;
    user: { name: string };
    appointment: { startsAt: Date; service: { name: string } };
  },
  viewerUserId?: string,
) {
  return {
    id: comment.id,
    text: comment.text,
    authorName: comment.user.name,
    appointmentId: comment.appointmentId,
    serviceName: comment.appointment.service.name,
    visitDate: comment.appointment.startsAt.toISOString(),
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
    ...(viewerUserId ? { isMine: comment.userId === viewerUserId } : {}),
  };
}

function commentInclude() {
  return {
    user: { select: { name: true } },
    appointment: {
      select: {
        startsAt: true,
        service: { select: { name: true } },
      },
    },
  } as const;
}

async function findCommentableAppointment(
  userId: string,
  businessId: string,
  appointmentId: string,
) {
  return prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      customerId: userId,
      businessId,
      endsAt: { lt: new Date() },
      status: { notIn: [...CANCELLED_STATUSES] },
      comment: null,
    },
    include: { service: { select: { name: true } } },
  });
}

router.get('/business/:businessId', async (req, res) => {
  const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;

  const comments = await prisma.businessComment.findMany({
    where: { businessId: req.params.businessId },
    include: commentInclude(),
    orderBy: { createdAt: 'desc' },
  });

  res.json({
    success: true,
    data: comments.map((comment) => mapComment(comment, userId)),
  });
});

router.get('/business/:businessId/count', async (req, res) => {
  const count = await prisma.businessComment.count({
    where: { businessId: req.params.businessId },
  });
  res.json({ success: true, data: { count } });
});

router.get('/commentable/user/:userId/business/:businessId', async (req, res) => {
  const appointments = await prisma.appointment.findMany({
    where: {
      customerId: req.params.userId,
      businessId: req.params.businessId,
      endsAt: { lt: new Date() },
      status: { notIn: [...CANCELLED_STATUSES] },
      comment: null,
    },
    include: { service: { select: { name: true } } },
    orderBy: { startsAt: 'desc' },
  });

  res.json({
    success: true,
    data: appointments.map((appointment) => ({
      id: appointment.id,
      serviceName: appointment.service.name,
      startsAt: appointment.startsAt.toISOString(),
      endsAt: appointment.endsAt.toISOString(),
    })),
  });
});

router.post('/create', async (req, res) => {
  const { userId, businessId, appointmentId, text } = req.body as {
    userId?: string;
    businessId?: string;
    appointmentId?: string;
    text?: string;
  };

  if (!userId || !businessId || !appointmentId || typeof text !== 'string') {
    res.status(400).json({
      success: false,
      error: 'userId, businessId, appointmentId, and text are required',
    });
    return;
  }

  const appointment = await findCommentableAppointment(userId, businessId, appointmentId);
  if (!appointment) {
    res.status(403).json({
      success: false,
      error: 'ניתן להגיב רק על תור שהתקיים ושטרם הגבת עליו',
      code: 'APPOINTMENT_REQUIRED',
    });
    return;
  }

  const comment = await prisma.businessComment.create({
    data: { userId, businessId, appointmentId, text },
    include: commentInclude(),
  });

  res.status(201).json({
    success: true,
    data: mapComment(comment, userId),
  });
});

router.put('/:commentId', async (req, res) => {
  const { userId, text } = req.body as { userId?: string; text?: string };

  if (!userId || typeof text !== 'string') {
    res.status(400).json({ success: false, error: 'userId and text are required' });
    return;
  }

  const existing = await prisma.businessComment.findUnique({
    where: { id: req.params.commentId },
  });

  if (!existing || existing.userId !== userId) {
    res.status(404).json({ success: false, error: 'תגובה לא נמצאה' });
    return;
  }

  const comment = await prisma.businessComment.update({
    where: { id: req.params.commentId },
    data: { text },
    include: commentInclude(),
  });

  res.json({
    success: true,
    data: mapComment(comment, userId),
  });
});

router.delete('/:commentId/user/:userId', async (req, res) => {
  const existing = await prisma.businessComment.findUnique({
    where: { id: req.params.commentId },
  });

  if (!existing || existing.userId !== req.params.userId) {
    res.status(404).json({ success: false, error: 'תגובה לא נמצאה' });
    return;
  }

  await prisma.businessComment.delete({ where: { id: req.params.commentId } });
  res.json({ success: true, data: { deleted: true } });
});

export default router;
