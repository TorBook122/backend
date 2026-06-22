import { API_ERROR_CODES } from '@torbook/shared';
import type { FavoriteDto } from '@torbook/shared';
import { dbClient } from '../clients/db.client.js';
import { AppError } from '../utils/app-error.js';

export async function addFavorite(userId: string, businessId: string): Promise<FavoriteDto> {
  try {
    await dbClient.businesses.findById(businessId);
  } catch {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'עסק לא נמצא');
  }

  const favorite = await dbClient.favorites.upsert(userId, businessId);

  return {
    id: favorite.id,
    businessId: favorite.businessId,
    name: favorite.business.name,
    slug: favorite.business.slug,
    category: favorite.business.category,
  };
}

export async function removeFavorite(userId: string, businessId: string): Promise<void> {
  await dbClient.favorites.remove(userId, businessId);
}

export async function listFavorites(userId: string): Promise<FavoriteDto[]> {
  const favorites = await dbClient.favorites.list(userId);

  return favorites.map((f) => ({
    id: f.id,
    businessId: f.businessId,
    name: f.business.name,
    slug: f.business.slug,
    category: f.business.category,
  }));
}

export async function isFavorite(userId: string, businessId: string): Promise<boolean> {
  const result = await dbClient.favorites.exists(userId, businessId);
  return result.exists;
}

export async function registerFcmToken(userId: string, token: string): Promise<void> {
  await dbClient.fcmTokens.upsert(userId, token);
}

export async function removeFcmToken(userId: string, token: string): Promise<void> {
  await dbClient.fcmTokens.remove(userId, token);
}
