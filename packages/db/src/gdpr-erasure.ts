import { Prisma } from '@prisma/client';
import { AppointmentStatus, AuthProvider } from '@torbook/shared';

const DELETED_USER_NAME = 'משתמש שנמחק';
const DELETED_SUPPORT_NAME = 'משתמש שנמחק';
const DELETED_SUPPORT_EMAIL = 'deleted@deleted.local';
const DELETED_SUPPORT_MESSAGE = '[deleted]';

export async function performGdprErasure(userId: string, tx: Prisma.TransactionClient): Promise<void> {
  await tx.fcmToken.deleteMany({ where: { userId } });
  await tx.favorite.deleteMany({ where: { userId } });
  await tx.businessLike.deleteMany({ where: { userId } });
  await tx.businessComment.deleteMany({ where: { userId } });

  await tx.appointment.updateMany({
    where: {
      customerId: userId,
      status: { in: [AppointmentStatus.CONFIRMED, AppointmentStatus.PENDING_OWNER_DECISION] },
      startsAt: { gt: new Date() },
    },
    data: { status: AppointmentStatus.CANCELLED_BY_CLIENT },
  });

  await tx.auditLog.updateMany({
    where: { userId },
    data: {
      userId: null,
      ipAddress: null,
      metadata: Prisma.DbNull,
    },
  });

  await tx.supportRequest.updateMany({
    where: { userId },
    data: {
      fullName: DELETED_SUPPORT_NAME,
      email: DELETED_SUPPORT_EMAIL,
      message: DELETED_SUPPORT_MESSAGE,
      userId: null,
    },
  });

  await tx.employee.updateMany({
    where: { userId },
    data: { userId: null },
  });

  await tx.user.update({
    where: { id: userId },
    data: {
      name: DELETED_USER_NAME,
      emailEnc: null,
      emailHash: null,
      phoneEnc: null,
      phoneHash: null,
      passwordHash: null,
      googleId: null,
      avatarUrl: null,
      provider: AuthProvider.LOCAL,
      deletedAt: new Date(),
    },
  });
}
