import type { Request, Response } from 'express';
import { API_ERROR_CODES } from '@torbook/shared';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  createEmployee,
  deleteEmployee,
  listEmployees,
  updateEmployee,
} from '../services/employee.service.js';
import { AppError } from '../utils/app-error.js';
import { param } from '../utils/param.js';
import { createEmployeeSchema, updateEmployeeSchema } from '../validators/employee.validator.js';

function getUserId(req: Request): string {
  return (req as AuthenticatedRequest).userId;
}

export async function list(req: Request, res: Response) {
  const employees = await listEmployees(param(req.params.id), getUserId(req));
  res.json({ success: true, data: employees });
}

export async function create(req: Request, res: Response) {
  const parsed = createEmployeeSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, parsed.error.errors[0]?.message ?? 'נתונים לא תקינים');
  }
  const employee = await createEmployee(param(req.params.id), getUserId(req), parsed.data);
  res.status(201).json({ success: true, data: employee });
}

export async function patch(req: Request, res: Response) {
  const parsed = updateEmployeeSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, parsed.error.errors[0]?.message ?? 'נתונים לא תקינים');
  }
  const employee = await updateEmployee(param(req.params.id), getUserId(req), parsed.data);
  res.json({ success: true, data: employee });
}

export async function remove(req: Request, res: Response) {
  await deleteEmployee(param(req.params.id), getUserId(req));
  res.json({ success: true, data: { deleted: true } });
}
