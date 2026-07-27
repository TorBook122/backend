import { createHash, randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { prisma } from '@torbook/db';
import {
  getRefreshTtlSeconds,
  hashPassword,
  signAccessToken,
  signRefreshToken,
  verifyPassword,
  verifyRefreshToken,
} from '../lib/auth/index.js';
import {
  API_ERROR_CODES,
  AuthProvider,
  PASSWORD_RESET_MAX_ATTEMPTS,
  PASSWORD_RESET_TTL_SECONDS,
  REFRESH_COOKIE_NAME,
  encryptPii,
  tryDecryptPii,
  hashPii,
  normalizeEmail,
  normalizePhone,
  UserRole,
  type AuthTokens,
  type AuthUser,
} from '@torbook/shared';
import { getRedis } from '../lib/redis.js';
import { AppError } from '../utils/app-error.js';
import { crossSiteCookieOptions } from '../utils/cookie-options.js';
import { verifyGoogleIdToken } from '../lib/google-auth.js';
import { sendPasswordResetCode } from '../lib/email/resend.js';
import type { ActivateEmployeeBody, ForgotPasswordBody, LoginBody, RegisterBody, GoogleAuthBody, ResetPasswordBody } from '../validators/auth.validator.js';

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

const refreshCookieOptions = {
  ...crossSiteCookieOptions(),
  path: '/api/v1/auth',
};

function setRefreshCookie(res: Response, token: string, rememberMe: boolean) {
  const maxAge = getRefreshTtlSeconds(rememberMe) * 1000;
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    ...refreshCookieOptions,
    maxAge,
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions);
}

async function storeRefreshToken(userId: string, jti: string, rememberMe: boolean) {
  const ttl = getRefreshTtlSeconds(rememberMe);
  await getRedis().set(`refresh:${jti}`, userId, 'EX', ttl);
}

async function revokeRefreshToken(jti: string) {
  await getRedis().del(`refresh:${jti}`);
}

async function isRefreshTokenValid(jti: string, userId: string): Promise<boolean> {
  const stored = await getRedis().get(`refresh:${jti}`);
  return stored === userId;
}

export async function registerUser(input: RegisterBody, res: Response): Promise<AuthTokens> {
  const phoneHash = hashPii(normalizePhone(input.phone));
  const emailHash = input.email ? hashPii(normalizeEmail(input.email)) : null;

  const existingPhone = await prisma.user.findUnique({ where: { phoneHash } });
  if (existingPhone) {
    throw new AppError(409, API_ERROR_CODES.DUPLICATE_PHONE, 'מספר טלפון כבר רשום. נסה להתחבר.');
  }

  if (emailHash) {
    const existingEmail = await prisma.user.findUnique({ where: { emailHash } });
    if (existingEmail) {
      throw new AppError(409, API_ERROR_CODES.DUPLICATE_EMAIL, 'אימייל כבר רשום. נסה להתחבר.');
    }
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      name: input.name,
      phoneEnc: encryptPii(normalizePhone(input.phone)),
      phoneHash,
      emailEnc: input.email ? encryptPii(normalizeEmail(input.email)) : null,
      emailHash,
      passwordHash,
      role: input.role,
    },
  });

  return issueAuthTokens(user, res);
}

async function issueAuthTokens(
  user: {
    id: string;
    name: string;
    role: string;
    onboardingCompletedAt: Date | null;
    phoneHash: string | null;
    phoneEnc: string | null;
    emailEnc: string | null;
    avatarUrl: string | null;
    passwordHash: string | null;
  },
  res: Response,
  rememberMe = false,
): Promise<AuthTokens> {
  const accessToken = signAccessToken(
    user.id,
    user.role,
    user.onboardingCompletedAt?.toISOString() ?? null,
    !!user.phoneHash,
  );
  const jti = randomUUID();
  const refreshToken = signRefreshToken(user.id, jti, rememberMe);
  await storeRefreshToken(user.id, jti, rememberMe);
  setRefreshCookie(res, refreshToken, rememberMe);
  return { accessToken, user: toAuthUser(user) };
}

export async function loginUser(input: LoginBody, res: Response): Promise<AuthTokens> {
  const isEmail = input.identifier.includes('@');
  const lookupHash = isEmail
    ? hashPii(normalizeEmail(input.identifier))
    : hashPii(normalizePhone(input.identifier));

  const user = await prisma.user.findFirst({
    where: isEmail ? { emailHash: lookupHash } : { phoneHash: lookupHash },
  });

  if (!user || user.deletedAt) {
    throw new AppError(401, API_ERROR_CODES.INVALID_CREDENTIALS, 'אימייל או סיסמה שגויים');
  }

  if (!user.passwordHash) {
    throw new AppError(401, API_ERROR_CODES.INVALID_CREDENTIALS, 'אימייל או סיסמה שגויים');
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    throw new AppError(401, API_ERROR_CODES.INVALID_CREDENTIALS, 'אימייל או סיסמה שגויים');
  }

  return issueAuthTokens(user, res, input.rememberMe);
}

export async function refreshSession(refreshToken: string, res: Response): Promise<AuthTokens> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError(401, API_ERROR_CODES.UNAUTHORIZED, 'סשן פג תוקף');
  }

  const valid = await isRefreshTokenValid(payload.jti, payload.sub);
  if (!valid) {
    throw new AppError(401, API_ERROR_CODES.UNAUTHORIZED, 'סשן פג תוקף');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.deletedAt) {
    throw new AppError(401, API_ERROR_CODES.UNAUTHORIZED, 'משתמש לא נמצא');
  }

  await revokeRefreshToken(payload.jti);

  return issueAuthTokens(user, res);
}

export async function googleAuthUser(input: GoogleAuthBody, res: Response): Promise<AuthTokens> {
  let googlePayload;
  try {
    googlePayload = await verifyGoogleIdToken(input.idToken);
  } catch {
    throw new AppError(401, API_ERROR_CODES.UNAUTHORIZED, 'אימות Google נכשל');
  }

  if (!googlePayload?.sub) {
    throw new AppError(401, API_ERROR_CODES.UNAUTHORIZED, 'אימות Google נכשל');
  }

  const existingByGoogle = await prisma.user.findUnique({
    where: { googleId: googlePayload.sub },
  });
  if (existingByGoogle && !existingByGoogle.deletedAt) {
    return issueAuthTokens(existingByGoogle, res);
  }

  if (googlePayload.email && googlePayload.email_verified) {
    const emailHash = hashPii(normalizeEmail(googlePayload.email));
    const existingByEmail = await prisma.user.findUnique({ where: { emailHash } });
    if (existingByEmail && !existingByEmail.deletedAt) {
      if (existingByEmail.provider === AuthProvider.LOCAL) {
        throw new AppError(
          409,
          API_ERROR_CODES.ACCOUNT_EXISTS_LOCAL,
          'חשבון עם אימייל זה קיים כבר — התחבר עם סיסמה',
        );
      }
      return issueAuthTokens(existingByEmail, res);
    }
  }

  if (!input.role) {
    throw new AppError(
      404,
      API_ERROR_CODES.GOOGLE_ACCOUNT_NOT_FOUND,
      'לא נמצא חשבון — הירשם כדי ליצור חשבון חדש',
    );
  }

  const email = googlePayload.email;
  const emailHash = email && googlePayload.email_verified
    ? hashPii(normalizeEmail(email))
    : null;

  const user = await prisma.user.create({
    data: {
      name: googlePayload.name ?? email?.split('@')[0] ?? 'משתמש',
      emailEnc: email ? encryptPii(normalizeEmail(email)) : null,
      emailHash,
      phoneEnc: null,
      phoneHash: null,
      passwordHash: null,
      provider: AuthProvider.GOOGLE,
      googleId: googlePayload.sub,
      role: input.role,
    },
  });

  return issueAuthTokens(user, res);
}

export async function logoutUser(refreshToken: string | undefined, res: Response): Promise<void> {
  if (refreshToken) {
    try {
      const payload = verifyRefreshToken(refreshToken);
      await revokeRefreshToken(payload.jti);
    } catch {
      // ignore invalid tokens on logout
    }
  }
  clearRefreshCookie(res);
}

function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function hashResetCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function generateResetCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function pwdResetKey(emailHash: string): string {
  return `pwd_reset:${emailHash}`;
}

function pwdResetAttemptsKey(emailHash: string): string {
  return `pwd_reset_attempts:${emailHash}`;
}

async function findEmployeeByInviteToken(token: string) {
  const tokenHash = hashInviteToken(token);
  return prisma.employee.findFirst({
    where: { inviteTokenHash: tokenHash },
    include: { user: true },
  });
}

function assertInviteEmployee(employee: Awaited<ReturnType<typeof findEmployeeByInviteToken>>) {
  if (!employee?.user || employee.user.deletedAt) {
    throw new AppError(400, API_ERROR_CODES.INVITE_INVALID, 'קישור הזמנה לא תקין');
  }
  if (employee.user.role !== UserRole.EMPLOYEE) {
    throw new AppError(400, API_ERROR_CODES.INVITE_INVALID, 'קישור הזמנה לא תקין');
  }
  if (employee.user.passwordHash) {
    throw new AppError(409, API_ERROR_CODES.ACCOUNT_ALREADY_ACTIVE, 'החשבון כבר הופעל');
  }
  if (!employee.inviteExpiresAt || employee.inviteExpiresAt < new Date()) {
    throw new AppError(410, API_ERROR_CODES.INVITE_EXPIRED, 'קישור ההזמנה פג תוקף');
  }
  return employee;
}

export async function validateEmployeeInvite(
  token: string,
): Promise<{ valid: true; name: string; email: string | null }> {
  if (!token.trim()) {
    throw new AppError(400, API_ERROR_CODES.INVITE_INVALID, 'קישור הזמנה לא תקין');
  }

  const employee = assertInviteEmployee(await findEmployeeByInviteToken(token));
  return {
    valid: true,
    name: employee.user!.name,
    email: employee.user!.emailEnc ? tryDecryptPii(employee.user!.emailEnc) : null,
  };
}

export async function activateEmployee(input: ActivateEmployeeBody, res: Response): Promise<AuthTokens> {
  const employee = assertInviteEmployee(await findEmployeeByInviteToken(input.token));
  const user = employee.user!;
  const passwordHash = await hashPassword(input.password);

  const updatedUser = await prisma.$transaction(async (tx) => {
    const nextUser = await tx.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
    await tx.employee.update({
      where: { id: employee.id },
      data: {
        inviteTokenHash: null,
        inviteExpiresAt: null,
      },
    });
    return nextUser;
  });

  return issueAuthTokens(updatedUser, res);
}

export async function forgotPassword(input: ForgotPasswordBody): Promise<void> {
  const emailHash = hashPii(normalizeEmail(input.email));
  const user = await prisma.user.findUnique({ where: { emailHash } });

  if (!user || user.deletedAt) {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'לא נמצא משתמש עם אימייל זה');
  }

  const emailPlain = tryDecryptPii(user.emailEnc);
  if (!emailPlain) {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'לא נמצא משתמש עם אימייל זה');
  }

  const code = generateResetCode();
  const codeHash = hashResetCode(code);
  const redis = getRedis();

  await redis.set(pwdResetKey(emailHash), codeHash, 'EX', PASSWORD_RESET_TTL_SECONDS);
  await redis.del(pwdResetAttemptsKey(emailHash));

  await sendPasswordResetCode(emailPlain, code);
}

export async function resetPassword(input: ResetPasswordBody): Promise<void> {
  const emailHash = hashPii(normalizeEmail(input.email));
  const redis = getRedis();
  const storedHash = await redis.get(pwdResetKey(emailHash));

  if (!storedHash) {
    throw new AppError(400, API_ERROR_CODES.INVALID_RESET_CODE, 'קוד לא תקין או שפג תוקפו');
  }

  const inputHash = hashResetCode(input.code);
  if (inputHash !== storedHash) {
    const attempts = await redis.incr(pwdResetAttemptsKey(emailHash));
    if (attempts === 1) {
      await redis.expire(pwdResetAttemptsKey(emailHash), PASSWORD_RESET_TTL_SECONDS);
    }
    if (attempts >= PASSWORD_RESET_MAX_ATTEMPTS) {
      await redis.del(pwdResetKey(emailHash), pwdResetAttemptsKey(emailHash));
      throw new AppError(
        400,
        API_ERROR_CODES.INVALID_RESET_CODE,
        'יותר מדי ניסיונות שגויים. בקשו קוד חדש.',
      );
    }
    throw new AppError(400, API_ERROR_CODES.INVALID_RESET_CODE, 'קוד שגוי');
  }

  const user = await prisma.user.findUnique({ where: { emailHash } });
  if (!user || user.deletedAt) {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'לא נמצא משתמש עם אימייל זה');
  }

  const passwordHash = await hashPassword(input.password);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  await redis.del(pwdResetKey(emailHash), pwdResetAttemptsKey(emailHash));
}

