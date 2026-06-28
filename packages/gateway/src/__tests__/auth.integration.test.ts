import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@torbook/db';
import {
  clearAuthRedisKeys,
  startTestStack,
  stopTestStack,
  type TestStack,
} from './helpers/test-servers.js';

let stack: TestStack;
let app: Express;

beforeAll(async () => {
  stack = await startTestStack();
  app = stack.gateway;
});

beforeEach(async () => {
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
  agent: request.SuperAgentTest,
  fn: (token: string) => request.Test,
) {
  const csrfRes = await agent.get('/api/v1/csrf');
  const token = csrfRes.body.data.csrfToken as string;
  return fn(token);
}

describe('auth integration (via gateway)', () => {
  it('registers, logs in, refreshes, and logs out', async () => {
    const agent = request.agent(app);

    const registerRes = await withCsrf(agent, (token) =>
      agent
        .post('/api/v1/auth/register')
        .set('X-CSRF-Token', token)
        .send({
          name: 'מיכל כהן',
          phone: '0521234567',
          email: 'michal@example.com',
          password: 'Password123',
          role: 'BUSINESS_OWNER',
        }),
    );

    expect(registerRes.status).toBe(201);
    expect(registerRes.body.success).toBe(true);
    expect(registerRes.body.data.accessToken).toBeTruthy();

    const loginRes = await withCsrf(agent, (token) =>
      agent
        .post('/api/v1/auth/login')
        .set('X-CSRF-Token', token)
        .send({
          identifier: 'michal@example.com',
          password: 'Password123',
          rememberMe: false,
        }),
    );

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.user.role).toBe('BUSINESS_OWNER');

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

  it('returns 400 for invalid register payload', async () => {
    const agent = request.agent(app);

    const res = await withCsrf(agent, (token) =>
      agent
        .post('/api/v1/auth/register')
        .set('X-CSRF-Token', token)
        .send({ name: 'x', phone: '1', password: 'short', role: 'CUSTOMER' }),
    );

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 for wrong password', async () => {
    const agent = request.agent(app);

    await withCsrf(agent, (token) =>
      agent
        .post('/api/v1/auth/register')
        .set('X-CSRF-Token', token)
        .send({
          name: 'יוסי',
          phone: '0541111111',
          email: 'yossi@example.com',
          password: 'Password123',
          role: 'CUSTOMER',
        }),
    );

    const res = await withCsrf(agent, (token) =>
      agent
        .post('/api/v1/auth/login')
        .set('X-CSRF-Token', token)
        .send({ identifier: '0541111111', password: 'wrong-password' }),
    );

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rate limits login after repeated failures', async () => {
    const agent = request.agent(app);

    await withCsrf(agent, (token) =>
      agent
        .post('/api/v1/auth/register')
        .set('X-CSRF-Token', token)
        .send({
          name: 'דני',
          phone: '0542222222',
          email: 'danny@example.com',
          password: 'Password123',
          role: 'CUSTOMER',
        }),
    );

    for (let i = 0; i < 5; i += 1) {
      await withCsrf(agent, (token) =>
        agent
          .post('/api/v1/auth/login')
          .set('X-CSRF-Token', token)
          .send({ identifier: '0542222222', password: 'bad' }),
      );
    }

    const res = await withCsrf(agent, (token) =>
      agent
        .post('/api/v1/auth/login')
        .set('X-CSRF-Token', token)
        .send({ identifier: '0542222222', password: 'bad' }),
    );

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });
});
