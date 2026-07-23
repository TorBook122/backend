import type { Request, Response } from 'express';
import { API_ERROR_CODES } from '@torbook/shared';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  createEmployeeRole,
  deleteEmployeeRole,
  listEmployeeRoles,
  updateEmployeeRole,
} from '../services/employee-role.service.js';
import { AppError } from '../utils/app-error.js';
import { param } from '../utils/param.js';
import {
  createEmployeeRoleSchema,
  updateEmployeeRoleSchema,
} from '../validators/employee-role.validator.js';

function getUserId(req: Request): string {
  return (req as AuthenticatedRequest).userId;
}

export async function list(req: Request, res: Response) {
  const roles = await listEmployeeRoles(param(req.params.id), getUserId(req));
  res.json({ success: true, data: roles });
}

export async function create(req: Request, res: Response) {
  const parsed = createEmployeeRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, parsed.error.errors[0]?.message ?? 'נתונים לא תקינים');
  }
  const role = await createEmployeeRole(param(req.params.id), getUserId(req), parsed.data);
  res.status(201).json({ success: true, data: role });
}

export async function patch(req: Request, res: Response) {
  const parsed = updateEmployeeRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, parsed.error.errors[0]?.message ?? 'נתונים לא תקינים');
  }
  const role = await updateEmployeeRole(param(req.params.id), getUserId(req), parsed.data);
  res.json({ success: true, data: role });
}

export async function remove(req: Request, res: Response) {
  await deleteEmployeeRole(param(req.params.id), getUserId(req));
  res.json({ success: true, data: { deleted: true } });
}
