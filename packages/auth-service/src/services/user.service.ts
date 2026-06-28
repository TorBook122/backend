import { prisma } from '@torbook/db';
import { verifyPassword } from '../lib/auth/password.js';
import { API_ERROR_CODES, AppointmentStatus, type AuthUser } from '@torbook/shared';
import { AppError } from '../utils/app-error.js';

export async function getProfile(userId: string): Promise<AuthUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'משתמש לא נמצא');
  }

  return {
    id: user.id,
    name: user.name,
    role: user.role,
    onboardingCompletedAt: user.onboardingCompletedAt?.toISOString() ?? null,
  };
}

async function verifyUserPassword(userId: string, password: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'משתמש לא נמצא');
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new AppError(401, API_ERROR_CODES.WRONG_PASSWORD, 'סיסמה שגויה');
  }

  return user;
}

export async function deleteAccount(userId: string, password: string) {
  await verifyUserPassword(userId, password);

  const futureAppointments = await prisma.appointment.findMany({
    where: {
      customerId: userId,
      status: { in: [AppointmentStatus.CONFIRMED, AppointmentStatus.PENDING_OWNER_DECISION] },
      startsAt: { gt: new Date() },
    },
    include: {
      business: { select: { name: true, slug: true } },
      service: { select: { name: true } },
    },
    orderBy: { startsAt: 'asc' },
  });

  if (futureAppointments.length > 0) {
    throw new AppError(
      409,
      API_ERROR_CODES.FUTURE_APPOINTMENTS_EXIST,
      'לא ניתן למחוק חשבון עם תורים עתידיים. בטלו את התורים תחילה.',
      {
        appointments: futureAppointments.map((a) => ({
          id: a.id,
          startsAt: a.startsAt.toISOString(),
          businessName: a.business.name,
          serviceName: a.service.name,
        })),
      },
    );
  }

  await prisma.user.update({
    where: { id: userId },
    data: { deletedAt: new Date() },
  });

  return { deleted: true };
}

export async function gdprDelete(userId: string, password: string) {
  await verifyUserPassword(userId, password);

  await prisma.$transaction(async (tx) => {
    await tx.fcmToken.deleteMany({ where: { userId } });
    await tx.favorite.deleteMany({ where: { userId } });

    await tx.user.update({
      where: { id: userId },
      data: {
        name: 'משתמש שנמחק',
        emailEnc: null,
        emailHash: null,
        phoneEnc: 'deleted',
        phoneHash: `deleted-${userId}`,
        passwordHash: 'deleted',
        deletedAt: new Date(),
      },
    });
  });

  return { gdprDeleted: true };
}
