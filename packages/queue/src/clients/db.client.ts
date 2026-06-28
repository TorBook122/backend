import { internalGet } from '@torbook/shared/server/http-client';

function getBaseUrl(): string {
  const url = process.env.DB_SERVICE_URL?.trim();
  if (!url) {
    throw new Error('DB_SERVICE_URL is required');
  }
  return url;
}

export async function getAppointmentForReminder(id: string) {
  return internalGet(getBaseUrl(), `/appointments/${encodeURIComponent(id)}?include=reminder`);
}

export async function getAppointmentForCancellation(id: string) {
  return internalGet(getBaseUrl(), `/appointments/${encodeURIComponent(id)}?include=cancellation`);
}
