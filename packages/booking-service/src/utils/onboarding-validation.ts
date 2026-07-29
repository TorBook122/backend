import { API_ERROR_CODES, BUSINESS_CATEGORIES } from '@torbook/shared';
import type { DbBusiness } from '../clients/db.client.js';
import { AppError } from './app-error.js';

function parseTime(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function assertBusinessProfileComplete(business: DbBusiness, phone: string): void {
  if (!business.name?.trim() || business.name.trim().length < 2) {
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, 'יש למלא שם עסק');
  }
  if (
    !business.category?.trim() ||
    !(BUSINESS_CATEGORIES as readonly string[]).includes(business.category)
  ) {
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, 'יש לבחור קטגוריה');
  }
  if (!business.address?.trim()) {
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, 'יש למלא כתובת');
  }
  if (phone.trim().length < 9) {
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, 'יש למלא טלפון עסק');
  }
}

export function assertBusinessAvailabilityComplete(business: DbBusiness): void {
  const activeDays = (business.availability ?? []).filter((day) => day.isActive);
  if (activeDays.length === 0) {
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, 'יש להגדיר לפחות יום פעילות אחד');
  }
  for (const day of activeDays) {
    if (parseTime(day.endTime) <= parseTime(day.startTime)) {
      throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, 'שעת סיום חייבת להיות אחרי שעת ההתחלה');
    }
  }
}

export function assertBusinessServicesComplete(business: DbBusiness): void {
  const services = (business.services ?? []).filter((service) => service.isVisible && service.name.trim());
  if (services.length === 0) {
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, 'יש להוסיף לפחות שירות אחד');
  }
}

export function assertBusinessOnboardingComplete(business: DbBusiness, phone: string): void {
  assertBusinessProfileComplete(business, phone);
  assertBusinessAvailabilityComplete(business);
  assertBusinessServicesComplete(business);
}
