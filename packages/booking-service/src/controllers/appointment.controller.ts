import type { Request, Response } from 'express';
import { API_ERROR_CODES } from '@torbook/shared';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  cancelAppointment,
  createAppointment,
  createTimeBlock,
  deleteTimeBlock,
  getBusinessAppointments,
  getCustomerAppointments,
  getTimeBlocks,
} from '../services/appointment.service.js';
import { AppError } from '../utils/app-error.js';
import { param } from '../utils/param.js';
import { createAppointmentSchema } from '../validators/appointment.validator.js';
import { timeBlockSchema } from '../validators/business.validator.js';

function getUserId(req: Request): string {
  return (req as AuthenticatedRequest).userId;
}

export async function book(req: Request, res: Response) {
  const parsed = createAppointmentSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, parsed.error.errors[0]?.message ?? 'נתונים לא תקינים');
  }
  const appointment = await createAppointment(getUserId(req), param(req.params.slug), parsed.data);
  res.status(201).json({ success: true, data: appointment });
}

export async function cancel(req: Request, res: Response) {
  const appointment = await cancelAppointment(param(req.params.id), getUserId(req));
  res.json({ success: true, data: appointment });
}

export async function myAppointments(req: Request, res: Response) {
  const data = await getCustomerAppointments(getUserId(req));
  res.json({ success: true, data });
}

export async function businessAppointments(req: Request, res: Response) {
  const date = req.query.date as string | undefined;
  const view = (req.query.view as 'day' | 'week') ?? 'day';
  const appointments = await getBusinessAppointments(param(req.params.id), getUserId(req), date, view);
  res.json({ success: true, data: appointments });
}

export async function addTimeBlock(req: Request, res: Response) {
  const parsed = timeBlockSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, parsed.error.errors[0]?.message ?? 'נתונים לא תקינים');
  }
  const block = await createTimeBlock(
    param(req.params.id),
    getUserId(req),
    parsed.data.startsAt,
    parsed.data.endsAt,
    parsed.data.note,
  );
  res.status(201).json({ success: true, data: block });
}

export async function removeTimeBlock(req: Request, res: Response) {
  await deleteTimeBlock(param(req.params.id), param(req.params.blockId), getUserId(req));
  res.json({ success: true, data: { deleted: true } });
}

export async function listTimeBlocks(req: Request, res: Response) {
  const date = req.query.date as string | undefined;
  const blocks = await getTimeBlocks(param(req.params.id), getUserId(req), date);
  res.json({ success: true, data: blocks });
}
