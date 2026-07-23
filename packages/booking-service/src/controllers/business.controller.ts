import type { Request, Response } from 'express';
import { API_ERROR_CODES, UserRole } from '@torbook/shared';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  completeOnboarding,
  createBusiness,
  createService,
  deleteService,
  getBusinessBySlug,
  getOwnerBusiness,
  getManagedBusiness,
  listMapLocations,
  listOwnerServices,
  listPublicBusinesses,
  updateAvailability,
  updateBreaks,
  updateBusiness,
  updateService,
} from '../services/business.service.js';
import { AppError } from '../utils/app-error.js';
import { param } from '../utils/param.js';
import {
  createBusinessSchema,
  createServiceSchema,
  updateAvailabilitySchema,
  updateBreaksSchema,
  updateBusinessSchema,
  updateServiceSchema,
} from '../validators/business.validator.js';

function getUserId(req: Request): string {
  return (req as AuthenticatedRequest).userId;
}

function getUserRole(req: Request): string {
  return (req as AuthenticatedRequest).userRole;
}

export async function create(req: Request, res: Response) {
  const parsed = createBusinessSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, parsed.error.errors[0]?.message ?? 'נתונים לא תקינים');
  }
  const business = await createBusiness(getUserId(req), parsed.data);
  res.status(201).json({ success: true, data: business });
}

export async function list(req: Request, res: Response) {
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  const businesses = await listPublicBusinesses(q);
  res.json({ success: true, data: businesses });
}

export async function mapLocations(_req: Request, res: Response) {
  const businesses = await listMapLocations();
  res.json({ success: true, data: businesses });
}

export async function getMine(req: Request, res: Response) {
  const business = await getOwnerBusiness(getUserId(req));
  res.json({ success: true, data: business });
}

export async function getManaged(req: Request, res: Response) {
  const business = await getManagedBusiness(getUserId(req), getUserRole(req));
  res.json({ success: true, data: business });
}

export async function getBySlug(req: Request, res: Response) {
  const business = await getBusinessBySlug(param(req.params.slug));
  res.json({ success: true, data: business });
}

export async function update(req: Request, res: Response) {
  const parsed = updateBusinessSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, parsed.error.errors[0]?.message ?? 'נתונים לא תקינים');
  }
  const business = await updateBusiness(param(req.params.id), getUserId(req), getUserRole(req), parsed.data);
  res.json({ success: true, data: business });
}

export async function setAvailability(req: Request, res: Response) {
  const parsed = updateAvailabilitySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, parsed.error.errors[0]?.message ?? 'נתונים לא תקינים');
  }
  const result = await updateAvailability(param(req.params.id), getUserId(req), getUserRole(req), parsed.data);
  res.json({ success: true, data: result });
}

export async function setBreaks(req: Request, res: Response) {
  const parsed = updateBreaksSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, parsed.error.errors[0]?.message ?? 'נתונים לא תקינים');
  }
  const breaks = await updateBreaks(param(req.params.id), getUserId(req), getUserRole(req), parsed.data);
  res.json({ success: true, data: breaks });
}

export async function addService(req: Request, res: Response) {
  const parsed = createServiceSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, parsed.error.errors[0]?.message ?? 'נתונים לא תקינים');
  }
  const service = await createService(param(req.params.id), getUserId(req), getUserRole(req), parsed.data);
  res.status(201).json({ success: true, data: service });
}

export async function listServices(req: Request, res: Response) {
  const services = await listOwnerServices(param(req.params.id), getUserId(req), getUserRole(req));
  res.json({ success: true, data: services });
}

export async function patchService(req: Request, res: Response) {
  const parsed = updateServiceSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, parsed.error.errors[0]?.message ?? 'נתונים לא תקינים');
  }
  const service = await updateService(param(req.params.id), getUserId(req), getUserRole(req), parsed.data);
  res.json({ success: true, data: service });
}

export async function removeService(req: Request, res: Response) {
  try {
    await deleteService(param(req.params.id), getUserId(req), getUserRole(req));
    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    if (error instanceof AppError && error.code === API_ERROR_CODES.SERVICE_HAS_APPOINTMENTS) {
      res.status(409).json({
        success: false,
        error: { code: error.code, message: error.message },
      });
      return;
    }
    throw error;
  }
}

export async function finishOnboarding(req: Request, res: Response) {
  const role = (req as AuthenticatedRequest).userRole;
  if (role !== UserRole.BUSINESS_OWNER) {
    throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'רק בעלי עסק');
  }
  await completeOnboarding(getUserId(req));
  res.json({ success: true, data: { completed: true } });
}

export async function getSlots(req: Request, res: Response) {
  const { computeAvailableSlots } = await import('../services/availability.service.js');
  const { serviceId, date } = req.query;
  if (!serviceId || !date || typeof serviceId !== 'string' || typeof date !== 'string') {
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, 'serviceId ו-date נדרשים');
  }
  const slots = await computeAvailableSlots(param(req.params.slug), serviceId, date);
  res.json({ success: true, data: slots });
}
