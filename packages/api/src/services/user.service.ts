import { API_ERROR_CODES, AppointmentStatus, type AuthUser } from '@torbook/shared';
import { authClient } from '../clients/auth.client.js';
import { dbClient } from '../clients/db.client.js';
import { AppError } from '../utils/app-error.js';

export async function getProfile(userId: string): Promise<AuthUser> {
  const user = await dbClient.users.findById(userId);
  if (!user || user.deletedAt) {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'משתמש לא נמצא');
  }

  return {
    id: user.id,
    name: user.name,
    role: user.role,
    onboardingCompletedAt: user.onboardingCompletedAt
      ? new Date(user.onboardingCompletedAt).toISOString()
      : null,
  };
}

async function verifyUserPassword(userId: string, password: string) {
  const user = await dbClient.users.findById(userId);
  if (!user || user.deletedAt) {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'משתמש לא נמצא');
  }

  const valid = await authClient.verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new AppError(401, API_ERROR_CODES.WRONG_PASSWORD, 'סיסמה שגויה');
  }

  return user;
}

export async function deleteAccount(userId: string, password: string) {
  await verifyUserPassword(userId, password);

  const futureAppointments = await dbClient.appointments.findFutureByCustomer(userId, [
    AppointmentStatus.CONFIRMED,
    AppointmentStatus.PENDING_OWNER_DECISION,
  ]);

  if (futureAppointments.length > 0) {
    throw new AppError(
      409,
      API_ERROR_CODES.FUTURE_APPOINTMENTS_EXIST,
      'לא ניתן למחוק חשבון עם תורים עתידיים. בטלו את התורים תחילה.',
      {
        appointments: futureAppointments.map((a) => ({
          id: a.id,
          startsAt: a.startsAt,
          businessName: a.business!.name,
          serviceName: a.service!.name,
        })),
      },
    );
  }

  await dbClient.users.softDelete(userId);

  return { deleted: true };
}

export async function gdprDelete(userId: string, password: string) {
  await verifyUserPassword(userId, password);
  await dbClient.users.gdprDelete(userId);
  return { gdprDeleted: true };
}
