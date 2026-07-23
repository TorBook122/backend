import { prisma } from '@torbook/db';
import { signAccessToken } from '../lib/auth/jwt.js';
import { hashPassword, verifyPassword } from '../lib/auth/password.js';
import {
  API_ERROR_CODES,
  AppointmentStatus,
  encryptPii,
  tryDecryptPii,
  hashPii,
  normalizeEmail,
  normalizePhone,
  type AuthTokens,
  type AuthUser,
} from '@torbook/shared';
import { AppError } from '../utils/app-error.js';
import type { ChangePasswordBody, UpdateProfileBody } from '../validators/user.validator.js';

function toAuthUser(user: {
  id: string;
  name: string;
  role: string;
  onboardingCompletedAt: Date | null;
  phoneHash: string | null;
  phoneEnc: string | null;
  emailEnc: string | null;
  avatarUrl: string | null;
  passwordHash: string | null;
}): AuthUser {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    onboardingCompletedAt: user.onboardingCompletedAt?.toISOString() ?? null,
    hasPhone: !!user.phoneHash,
    phone: tryDecryptPii(user.phoneEnc),
    email: tryDecryptPii(user.emailEnc),
    avatarUrl: user.avatarUrl,
    hasPassword: !!user.passwordHash,
  };
}

export async function getProfile(userId: string): Promise<AuthUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'משתמש לא נמצא');
  }

  return toAuthUser(user);
}

export async function completePhone(userId: string, phone: string): Promise<AuthTokens> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'משתמש לא נמצא');
  }

  if (user.phoneHash) {
    throw new AppError(409, API_ERROR_CODES.CONFLICT, 'מספר טלפון כבר קיים בחשבון');
  }

  const phoneHash = hashPii(normalizePhone(phone));
  const existingPhone = await prisma.user.findUnique({ where: { phoneHash } });
  if (existingPhone) {
    throw new AppError(409, API_ERROR_CODES.DUPLICATE_PHONE, 'מספר טלפון כבר רשום. נסה מספר אחר.');
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      phoneEnc: encryptPii(normalizePhone(phone)),
      phoneHash,
    },
  });

  const accessToken = signAccessToken(
    updated.id,
    updated.role,
    updated.onboardingCompletedAt?.toISOString() ?? null,
    !!updated.phoneHash,
  );

  return { accessToken, user: toAuthUser(updated) };
}

export async function updateProfile(
  userId: string,
  input: UpdateProfileBody,
): Promise<AuthUser | AuthTokens> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'משתמש לא נמצא');
  }

  const data: {
    name?: string;
    emailEnc?: string | null;
    emailHash?: string | null;
    phoneEnc?: string;
    phoneHash?: string;
    avatarUrl?: string | null;
  } = {};

  if (input.name !== undefined) {
    data.name = input.name;
  }

  if (input.email !== undefined) {
    const normalizedEmail = normalizeEmail(input.email);
    const emailHash = hashPii(normalizedEmail);
    if (emailHash !== user.emailHash) {
      const existingEmail = await prisma.user.findUnique({ where: { emailHash } });
      if (existingEmail) {
        throw new AppError(409, API_ERROR_CODES.DUPLICATE_EMAIL, 'אימייל כבר רשום. נסה אימייל אחר.');
      }
      data.emailEnc = encryptPii(normalizedEmail);
      data.emailHash = emailHash;
    }
  }

  if (input.phone !== undefined) {
    const normalizedPhone = normalizePhone(input.phone);
    const phoneHash = hashPii(normalizedPhone);
    if (phoneHash !== user.phoneHash) {
      const existingPhone = await prisma.user.findUnique({ where: { phoneHash } });
      if (existingPhone) {
        throw new AppError(409, API_ERROR_CODES.DUPLICATE_PHONE, 'מספר טלפון כבר רשום. נסה מספר אחר.');
      }
      data.phoneEnc = encryptPii(normalizedPhone);
      data.phoneHash = phoneHash;
    }
  }

  if (input.avatarUrl !== undefined) {
    data.avatarUrl = input.avatarUrl;
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data,
  });

  if (input.phone !== undefined) {
    const accessToken = signAccessToken(
      updated.id,
      updated.role,
      updated.onboardingCompletedAt?.toISOString() ?? null,
      !!updated.phoneHash,
    );
    return { accessToken, user: toAuthUser(updated) };
  }

  return toAuthUser(updated);
}

export async function changePassword(userId: string, input: ChangePasswordBody): Promise<{ changed: true }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'משתמש לא נמצא');
  }

  const passwordHash = await hashPassword(input.password);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  return { changed: true };
}

async function verifyUserPassword(userId: string, password: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'משתמש לא נמצא');
  }

  if (!user.passwordHash) {
    throw new AppError(401, API_ERROR_CODES.WRONG_PASSWORD, 'סיסמה שגויה');
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
    await tx.businessLike.deleteMany({ where: { userId } });
    await tx.businessComment.deleteMany({ where: { userId } });

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
