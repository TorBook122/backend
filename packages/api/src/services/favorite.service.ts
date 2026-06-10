import { prisma } from '@torbook/db';
import { API_ERROR_CODES } from '@torbook/shared';
import type { FavoriteDto } from '@torbook/shared';
import { AppError } from '../utils/app-error.js';

export async function addFavorite(userId: string, businessId: string): Promise<FavoriteDto> {
  const business = await prisma.business.findFirst({ where: { id: businessId, deletedAt: null } });
  if (!business) {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'עסק לא נמצא');
  }

  const favorite = await prisma.favorite.upsert({
    where: { userId_businessId: { userId, businessId } },
    create: { userId, businessId },
    update: {},
    include: { business: true },
  });

  return {
    id: favorite.id,
    businessId: favorite.businessId,
    name: favorite.business.name,
    slug: favorite.business.slug,
    category: favorite.business.category,
  };
}

export async function removeFavorite(userId: string, businessId: string): Promise<void> {
  await prisma.favorite.deleteMany({ where: { userId, businessId } });
}

export async function listFavorites(userId: string): Promise<FavoriteDto[]> {
  const favorites = await prisma.favorite.findMany({
    where: { userId },
    include: { business: true },
    orderBy: { createdAt: 'desc' },
  });

  return favorites.map((f) => ({
    id: f.id,
    businessId: f.businessId,
    name: f.business.name,
    slug: f.business.slug,
    category: f.business.category,
  }));
}

export async function isFavorite(userId: string, businessId: string): Promise<boolean> {
  const fav = await prisma.favorite.findUnique({
    where: { userId_businessId: { userId, businessId } },
  });
  return !!fav;
}

export async function registerFcmToken(userId: string, token: string): Promise<void> {
  await prisma.fcmToken.upsert({
    where: { token },
    create: { userId, token },
    update: { userId },
  });
}

export async function removeFcmToken(userId: string, token: string): Promise<void> {
  await prisma.fcmToken.deleteMany({ where: { userId, token } });
}
