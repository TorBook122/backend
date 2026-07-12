import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@torbook/db';
import { AuthProvider, encryptPii, hashPii, normalizeEmail, normalizePhone } from '@torbook/shared';
import { verifyAccessToken } from '../../../auth-service/src/lib/auth/jwt.js';
import {
  clearAuthRedisKeys,
  startTestStack,
  stopTestStack,
  type TestStack,
} from './helpers/test-servers.js';
import type { IntegrationTestAgent } from './helpers/test-agent.js';

const verifyGoogleIdToken = vi.fn();

vi.mock('../../../auth-service/src/lib/google-auth.js', () => ({
  verifyGoogleIdToken: (...args: unknown[]) => verifyGoogleIdToken(...args),
}));

let stack: TestStack;
let app: Express;

const GOOGLE_SUB = 'google-user-123';
const GOOGLE_EMAIL = 'google.user@example.com';

beforeAll(async () => {
  stack = await startTestStack();
  app = stack.gateway;
});

beforeEach(async () => {
  verifyGoogleIdToken.mockReset();
  await prisma.auditLog.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.favorite.deleteMany();
  await prisma.fcmToken.deleteMany();
  await prisma.timeBlock.deleteMany();
  await prisma.breakBlock.deleteMany();
  await prisma.availability.deleteMany();
  await prisma.service.deleteMany();
  await prisma.business.deleteMany();
  await prisma.user.deleteMany();
  await clearAuthRedisKeys();
});

afterAll(async () => {
  await prisma.$disconnect();
  await stopTestStack(stack);
});

async function withCsrf(
  agent: IntegrationTestAgent,
  fn: (token: string) => request.Test,
) {
  const csrfRes = await agent.get('/api/v1/csrf');
  const token = csrfRes.body.data.csrfToken as string;
  return fn(token);
}

function mockGoogleUser(overrides?: Partial<{
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
}>) {
  verifyGoogleIdToken.mockResolvedValue({
    sub: overrides?.sub ?? GOOGLE_SUB,
    email: overrides?.email ?? GOOGLE_EMAIL,
    email_verified: overrides?.email_verified ?? true,
    name: overrides?.name ?? 'Google User',
  });
}

describe('google auth integration (via gateway)', () => {
  it('creates a new Google user with role and returns hasPhone false', async () => {
    mockGoogleUser();
    const agent = request.agent(app);

    const res = await withCsrf(agent, (token) =>
      agent
        .post('/api/v1/auth/google')
        .set('X-CSRF-Token', token)
        .send({ idToken: 'valid-google-token', role: 'CUSTOMER' }),
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.hasPhone).toBe(false);

    const payload = verifyAccessToken(res.body.data.accessToken);
    expect(payload.hasPhone).toBe(false);
    expect(payload.role).toBe('CUSTOMER');

    const user = await prisma.user.findUnique({ where: { googleId: GOOGLE_SUB } });
    expect(user?.provider).toBe(AuthProvider.GOOGLE);
    expect(user?.phoneHash).toBeNull();
    expect(user?.passwordHash).toBeNull();
  });

  it('logs in an existing Google user by googleId', async () => {
    mockGoogleUser();
    const agent = request.agent(app);

    const signupRes = await withCsrf(agent, (token) =>
      agent
        .post('/api/v1/auth/google')
        .set('X-CSRF-Token', token)
        .send({ idToken: 'valid-google-token', role: 'CUSTOMER' }),
    );
    expect(signupRes.status).toBe(200);

    const accessToken = signupRes.body.data.accessToken as string;
    const phoneRes = await withCsrf(agent, (token) =>
      agent
        .patch('/api/v1/users/me/phone')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-CSRF-Token', token)
        .send({ phone: '0521234567' }),
    );
    expect(phoneRes.status).toBe(200);

    mockGoogleUser();
    const res = await withCsrf(agent, (token) =>
      agent
        .post('/api/v1/auth/google')
        .set('X-CSRF-Token', token)
        .send({ idToken: 'valid-google-token' }),
    );

    expect(res.status).toBe(200);
    expect(res.body.data.user.hasPhone).toBe(true);
    const payload = verifyAccessToken(res.body.data.accessToken);
    expect(payload.hasPhone).toBe(true);
  });

  it('returns ACCOUNT_EXISTS_LOCAL when email matches a password account', async () => {
    const { hashPii, normalizeEmail } = await import('@torbook/shared');
    const emailHash = hashPii(normalizeEmail(GOOGLE_EMAIL));

    await prisma.user.create({
      data: {
        name: 'Local User',
        emailEnc: encryptPii(normalizeEmail(GOOGLE_EMAIL)),
        emailHash,
        phoneEnc: encryptPii(normalizePhone('0529999999')),
        phoneHash: hashPii(normalizePhone('0529999999')),
        passwordHash: 'hashed',
        provider: AuthProvider.LOCAL,
        role: 'CUSTOMER',
      },
    });

    mockGoogleUser();
    const agent = request.agent(app);
    const res = await withCsrf(agent, (token) =>
      agent
        .post('/api/v1/auth/google')
        .set('X-CSRF-Token', token)
        .send({ idToken: 'valid-google-token', role: 'CUSTOMER' }),
    );

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ACCOUNT_EXISTS_LOCAL');
  });

  it('returns GOOGLE_ACCOUNT_NOT_FOUND when new user signs in without role', async () => {
    mockGoogleUser({ sub: 'brand-new-google-id' });
    const agent = request.agent(app);

    const res = await withCsrf(agent, (token) =>
      agent
        .post('/api/v1/auth/google')
        .set('X-CSRF-Token', token)
        .send({ idToken: 'valid-google-token' }),
    );

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('GOOGLE_ACCOUNT_NOT_FOUND');
  });

  it('completes phone for a Google user via PATCH /users/me/phone', async () => {
    mockGoogleUser();
    const agent = request.agent(app);

    const googleRes = await withCsrf(agent, (token) =>
      agent
        .post('/api/v1/auth/google')
        .set('X-CSRF-Token', token)
        .send({ idToken: 'valid-google-token', role: 'BUSINESS_OWNER' }),
    );

    expect(googleRes.status).toBe(200);
    const accessToken = googleRes.body.data.accessToken as string;

    const phoneRes = await withCsrf(agent, (token) =>
      agent
        .patch('/api/v1/users/me/phone')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-CSRF-Token', token)
        .send({ phone: '0521234567' }),
    );

    expect(phoneRes.status).toBe(200);
    expect(phoneRes.body.data.user.hasPhone).toBe(true);

    const payload = verifyAccessToken(phoneRes.body.data.accessToken);
    expect(payload.hasPhone).toBe(true);
    expect(payload.role).toBe('BUSINESS_OWNER');
  });

  it('returns 401 for invalid Google ID token', async () => {
    verifyGoogleIdToken.mockImplementation(() =>
      Promise.reject(new Error('invalid token')),
    );
    const agent = request.agent(app);

    const res = await withCsrf(agent, (token) =>
      agent
        .post('/api/v1/auth/google')
        .set('X-CSRF-Token', token)
        .send({ idToken: 'invalid-google-token', role: 'CUSTOMER' }),
    );

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('refresh and logout still work after Google sign-in', async () => {
    mockGoogleUser();
    const agent = request.agent(app);

    const googleRes = await withCsrf(agent, (token) =>
      agent
        .post('/api/v1/auth/google')
        .set('X-CSRF-Token', token)
        .send({ idToken: 'valid-google-token', role: 'CUSTOMER' }),
    );

    expect(googleRes.status).toBe(200);

    const refreshRes = await withCsrf(agent, (token) =>
      agent.post('/api/v1/auth/refresh').set('X-CSRF-Token', token),
    );

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.data.accessToken).toBeTruthy();

    const logoutRes = await withCsrf(agent, (token) =>
      agent.post('/api/v1/auth/logout').set('X-CSRF-Token', token),
    );

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.data.loggedOut).toBe(true);
  });
});
