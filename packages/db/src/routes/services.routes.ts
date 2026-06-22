import { Router } from 'express';
import { prisma } from '../client.js';

const router = Router();

router.get('/:id', async (req, res) => {
  const service = await prisma.service.findUnique({
    where: { id: req.params.id },
    include: { business: true },
  });
  if (!service) {
    res.status(404).json({ success: false, error: 'Service not found' });
    return;
  }
  res.json({ success: true, data: service });
});

router.get('/business/:businessId/visible/:serviceId', async (req, res) => {
  const service = await prisma.service.findFirst({
    where: {
      id: req.params.serviceId,
      businessId: req.params.businessId,
      isVisible: true,
    },
  });
  res.json({ success: true, data: service });
});

router.get('/business/:businessId', async (req, res) => {
  const services = await prisma.service.findMany({
    where: { businessId: req.params.businessId },
    orderBy: { name: 'asc' },
  });
  res.json({ success: true, data: services });
});

router.post('/business/:businessId', async (req, res) => {
  const service = await prisma.service.create({
    data: { businessId: req.params.businessId, ...req.body },
  });
  res.status(201).json({ success: true, data: service });
});

router.patch('/:id', async (req, res) => {
  const service = await prisma.service.update({
    where: { id: req.params.id },
    data: req.body,
  });
  res.json({ success: true, data: service });
});

router.delete('/:id', async (req, res) => {
  const serviceId = req.params.id;
  const futureAppt = await prisma.appointment.findFirst({
    where: {
      serviceId,
      status: 'CONFIRMED',
      startsAt: { gt: new Date() },
    },
  });

  if (futureAppt) {
    await prisma.service.update({ where: { id: serviceId }, data: { isVisible: false } });
    res.status(409).json({
      success: false,
      error: 'Service has future appointments — hidden instead',
      code: 'SERVICE_HAS_APPOINTMENTS',
    });
    return;
  }

  await prisma.service.delete({ where: { id: serviceId } });
  res.json({ success: true, data: { deleted: true } });
});

router.get('/:id/future-appointment', async (req, res) => {
  const appt = await prisma.appointment.findFirst({
    where: {
      serviceId: req.params.id,
      status: 'CONFIRMED',
      startsAt: { gt: new Date() },
    },
  });
  res.json({ success: true, data: appt });
});

export default router;
