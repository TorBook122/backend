import { internalGet, internalPost } from '@torbook/shared/server/http-client';

function getBaseUrl(): string {
  const url = process.env.DB_SERVICE_URL?.trim();
  if (!url) {
    throw new Error('DB_SERVICE_URL is required');
  }
  return url;
}

export type FcmTokenRecord = { id: string; userId: string; token: string };

export async function getFcmTokensByUserId(userId: string): Promise<FcmTokenRecord[]> {
  return internalGet<FcmTokenRecord[]>(getBaseUrl(), `/fcm-tokens?userId=${encodeURIComponent(userId)}`);
}

export async function deleteStaleFcmTokens(ids: string[]): Promise<void> {
  await internalPost(getBaseUrl(), '/fcm-tokens/stale', { ids });
}

export async function getAppointmentForReminder(id: string) {
  return internalGet(getBaseUrl(), `/appointments/${encodeURIComponent(id)}?include=reminder`);
}

export async function getAppointmentForCancellation(id: string) {
  return internalGet(getBaseUrl(), `/appointments/${encodeURIComponent(id)}?include=cancellation`);
}
