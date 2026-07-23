import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../client.js';

const router = Router();

router.get('/business/:businessId', async (req, res) => {
  const roles = await prisma.employeeRole.findMany({
    where: { businessId: req.params.businessId },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ success: true, data: roles });
});

router.get('/business/:businessId/count', async (req, res) => {
  const count = await prisma.employeeRole.count({
    where: { businessId: req.params.businessId },
  });
  res.json({ success: true, data: { count } });
});

router.get('/:id', async (req, res) => {
  const role = await prisma.employeeRole.findUnique({
    where: { id: req.params.id },
    include: { business: true, _count: { select: { employees: true } } },
  });
  if (!role) {
    res.status(404).json({ success: false, error: 'Employee role not found' });
    return;
  }
  res.json({ success: true, data: role });
});

router.post('/business/:businessId', async (req, res) => {
  try {
    const role = await prisma.employeeRole.create({
      data: { businessId: req.params.businessId, ...req.body },
    });
    res.status(201).json({ success: true, data: role });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({
        success: false,
        error: 'Role name already exists for this business',
        code: 'CONFLICT',
      });
      return;
    }
    throw error;
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const role = await prisma.employeeRole.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json({ success: true, data: role });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({
        success: false,
        error: 'Role name already exists for this business',
        code: 'CONFLICT',
      });
      return;
    }
    throw error;
  }
});

router.delete('/:id', async (req, res) => {
  const assigned = await prisma.employee.count({ where: { roleId: req.params.id } });
  if (assigned > 0) {
    res.status(409).json({
      success: false,
      error: 'Cannot delete role with assigned employees',
      code: 'ROLE_HAS_EMPLOYEES',
    });
    return;
  }
  await prisma.employeeRole.delete({ where: { id: req.params.id } });
  res.json({ success: true, data: { deleted: true } });
});

export default router;
