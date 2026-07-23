import { Router } from 'express';
import { prisma } from '../client.js';

const employeeInclude = {
  user: {
    select: {
      passwordHash: true,
    },
  },
  role: {
    select: {
      id: true,
      name: true,
      permissions: true,
    },
  },
} as const;

const router = Router();

router.get('/user/:userId', async (req, res) => {
  const employee = await prisma.employee.findFirst({
    where: { userId: req.params.userId },
    include: {
      business: { select: { id: true, name: true } },
      ...employeeInclude,
    },
  });
  if (!employee) {
    res.status(404).json({ success: false, error: 'Employee not found' });
    return;
  }
  res.json({ success: true, data: employee });
});

router.get('/business/:businessId', async (req, res) => {
  const employees = await prisma.employee.findMany({
    where: { businessId: req.params.businessId },
    orderBy: { createdAt: 'asc' },
    include: employeeInclude,
  });
  res.json({ success: true, data: employees });
});

router.get('/business/:businessId/count', async (req, res) => {
  const count = await prisma.employee.count({
    where: { businessId: req.params.businessId },
  });
  res.json({ success: true, data: { count } });
});

router.get('/:id', async (req, res) => {
  const employee = await prisma.employee.findUnique({
    where: { id: req.params.id },
    include: { business: true, ...employeeInclude },
  });
  if (!employee) {
    res.status(404).json({ success: false, error: 'Employee not found' });
    return;
  }
  res.json({ success: true, data: employee });
});

router.post('/business/:businessId', async (req, res) => {
  const employee = await prisma.employee.create({
    data: { businessId: req.params.businessId, ...req.body },
    include: employeeInclude,
  });
  res.status(201).json({ success: true, data: employee });
});

router.patch('/:id', async (req, res) => {
  const employee = await prisma.employee.update({
    where: { id: req.params.id },
    data: req.body,
    include: employeeInclude,
  });
  res.json({ success: true, data: employee });
});

router.delete('/:id', async (req, res) => {
  await prisma.employee.delete({ where: { id: req.params.id } });
  res.json({ success: true, data: { deleted: true } });
});

export default router;
