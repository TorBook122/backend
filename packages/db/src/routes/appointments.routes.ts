import { Router } from 'express';
import { prisma } from '../client.js';

const router = Router();

router.get('/:id', async (req, res) => {
  const include = req.query.include as string | undefined;
  const appointment = await prisma.appointment.findUnique({
    where: { id: req.params.id },
    include: include === 'reminder'
      ? { service: true, business: true, customer: true }
      : include === 'cancellation'
        ? { service: true, business: { include: { owner: true } }, customer: true }
        : include === 'full'
          ? {
              business: { select: { name: true, slug: true, ownerId: true, cancellationWindowHours: true } },
              service: { select: { name: true, durationMins: true } },
              customer: { select: { name: true } },
            }
          : undefined,
  });
  if (!appointment) {
    res.status(404).json({ success: false, error: 'Appointment not found' });
    return;
  }
  res.json({ success: true, data: appointment });
});

router.post('/book', async (req, res) => {
  const {
    customerId,
    businessId,
    serviceId,
    startsAt,
    endsAt,
    lockKey,
    status,
  } = req.body as {
    customerId: string;
    businessId: string;
    serviceId: string;
    startsAt: string;
    endsAt: string;
    lockKey: string;
    status: string;
  };

  const startDate = new Date(startsAt);
  const endDate = new Date(endsAt);
  const lock = BigInt(lockKey);

  const appointment = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lock})`;

    const conflict = await tx.appointment.findFirst({
      where: {
        businessId,
        status: { in: ['CONFIRMED', 'PENDING', 'PENDING_OWNER_DECISION'] },
        startsAt: { lt: endDate },
        endsAt: { gt: startDate },
      },
    });

    if (conflict) {
      return { conflict: true as const };
    }

    const created = await tx.appointment.create({
      data: {
        businessId,
        customerId,
        serviceId,
        startsAt: startDate,
        endsAt: endDate,
        status: status as never,
      },
      include: {
        business: { select: { name: true, slug: true } },
        service: { select: { name: true, durationMins: true } },
      },
    });

    return { conflict: false as const, appointment: created };
  });

  if (appointment.conflict) {
    res.status(409).json({
      success: false,
      error: 'Slot taken',
      code: 'SLOT_TAKEN',
    });
    return;
  }

  res.status(201).json({ success: true, data: appointment.appointment });
});

router.patch('/:id', async (req, res) => {
  const appointment = await prisma.appointment.update({
    where: { id: req.params.id },
    data: req.body,
    include: {
      business: { select: { name: true, slug: true } },
      service: { select: { name: true, durationMins: true } },
      customer: { select: { name: true } },
    },
  });
  res.json({ success: true, data: appointment });
});

router.get('/customer/:customerId', async (req, res) => {
  const appointments = await prisma.appointment.findMany({
    where: { customerId: req.params.customerId },
    include: {
      business: { select: { name: true, slug: true } },
      service: { select: { name: true, durationMins: true } },
    },
    orderBy: { startsAt: 'asc' },
  });
  res.json({ success: true, data: appointments });
});

router.get('/business/:businessId', async (req, res) => {
  const { startDate, endDate, excludeCancelled } = req.query;
  const appointments = await prisma.appointment.findMany({
    where: {
      businessId: req.params.businessId,
      ...(startDate && endDate
        ? { startsAt: { gte: new Date(startDate as string), lt: new Date(endDate as string) } }
        : {}),
      ...(excludeCancelled === 'true'
        ? { status: { notIn: ['CANCELLED_BY_CLIENT', 'CANCELLED_BY_BUSINESS'] } }
        : {}),
    },
    include: {
      business: { select: { name: true, slug: true } },
      service: { select: { name: true, durationMins: true } },
      customer: { select: { name: true } },
    },
    orderBy: { startsAt: 'asc' },
  });
  res.json({ success: true, data: appointments });
});

router.get('/business/:businessId/day', async (req, res) => {
  const { dayStart, dayEnd } = req.query;
  if (!dayStart || !dayEnd) {
    res.status(400).json({ success: false, error: 'dayStart and dayEnd are required' });
    return;
  }

  const appointments = await prisma.appointment.findMany({
    where: {
      businessId: req.params.businessId,
      status: { in: ['CONFIRMED', 'PENDING', 'PENDING_OWNER_DECISION'] },
      startsAt: { gte: new Date(dayStart as string), lt: new Date(dayEnd as string) },
    },
  });
  res.json({ success: true, data: appointments });
});

router.get('/customer/:customerId/future', async (req, res) => {
  const statuses = (req.query.statuses as string | undefined)?.split(',') ?? [];
  const appointments = await prisma.appointment.findMany({
    where: {
      customerId: req.params.customerId,
      status: { in: statuses as never[] },
      startsAt: { gt: new Date() },
    },
    include: {
      business: { select: { name: true, slug: true } },
      service: { select: { name: true } },
    },
    orderBy: { startsAt: 'asc' },
  });
  res.json({ success: true, data: appointments });
});

router.get('/time-blocks/business/:businessId', async (req, res) => {
  const { startDate, endDate } = req.query;
  const where: { businessId: string; startsAt?: { gte: Date; lt: Date } } = {
    businessId: req.params.businessId,
  };
  if (startDate && endDate) {
    where.startsAt = { gte: new Date(startDate as string), lt: new Date(endDate as string) };
  }

  const blocks = await prisma.timeBlock.findMany({ where, orderBy: { startsAt: 'asc' } });
  res.json({ success: true, data: blocks });
});

router.get('/time-blocks/business/:businessId/day', async (req, res) => {
  const { dayStart, dayEnd } = req.query;
  if (!dayStart || !dayEnd) {
    res.status(400).json({ success: false, error: 'dayStart and dayEnd are required' });
    return;
  }

  const blocks = await prisma.timeBlock.findMany({
    where: {
      businessId: req.params.businessId,
      startsAt: { lt: new Date(dayEnd as string) },
      endsAt: { gt: new Date(dayStart as string) },
    },
  });
  res.json({ success: true, data: blocks });
});

router.post('/time-blocks', async (req, res) => {
  const block = await prisma.timeBlock.create({ data: req.body });
  res.status(201).json({ success: true, data: block });
});

router.delete('/time-blocks/:id', async (req, res) => {
  const block = await prisma.timeBlock.findFirst({
    where: { id: req.params.id, businessId: req.query.businessId as string },
  });
  if (!block) {
    res.status(404).json({ success: false, error: 'Time block not found' });
    return;
  }
  await prisma.timeBlock.delete({ where: { id: req.params.id } });
  res.json({ success: true, data: block });
});

export default router;
