import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@torbook/db';
import { signAccessToken } from '@torbook/auth';
import { AppointmentStatus } from '@torbook/shared';
import { getRedis, disconnectRedis } from '../lib/redis.js';
import { createApp } from '../app.js';

let app: Express;

beforeAll(async () => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-xx';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-x';
  process.env.AES_ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000';
  process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
  process.env.NODE_ENV = 'test';

  app = createApp();
  await getRedis().connect();
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
  const keys = await getRedis().keys('slots:*');
  if (keys.length) await getRedis().del(...keys);
});

afterAll(async () => {
  await prisma.$disconnect();
  await disconnectRedis();
});

async function withCsrf(
  agent: request.SuperAgentTest,
  fn: (token: string) => request.Test,
) {
  const csrfRes = await agent.get('/api/v1/csrf');
  const token = csrfRes.body.data.csrfToken as string;
  return fn(token);
}

async function registerUser(
  agent: request.SuperAgentTest,
  data: { name: string; phone: string; email: string; password: string; role: string },
) {
  return withCsrf(agent, (token) =>
    agent
      .post('/api/v1/auth/register')
      .set('X-CSRF-Token', token)
      .send(data),
  );
}

function authHeader(userId: string, role: string) {
  return `Bearer ${signAccessToken(userId, role)}`;
}

async function seedBusiness(ownerId: string) {
  const business = await prisma.business.create({
    data: {
      ownerId,
      name: 'מספרת בדיקה',
      slug: 'test-salon',
      phoneEnc: 'enc',
      cancellationWindowHours: 24,
    },
  });

  const service = await prisma.service.create({
    data: {
      businessId: business.id,
      name: 'תספורת',
      durationMins: 30,
      price: 5000,
    },
  });

  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
    await prisma.availability.create({
      data: {
        businessId: business.id,
        dayOfWeek,
        isActive: dayOfWeek !== 5,
        startTime: '09:00',
        endTime: '18:00',
      },
    });
  }

  return { business, service };
}

describe('Sprint 5 edge cases', () => {
  it('rejects duplicate phone on register', async () => {
    const agent = request.agent(app);
    await registerUser(agent, {
      name: 'אבי',
      phone: '0521111111',
      email: 'avi-customer@test.com',
      password: 'Password123',
      role: 'CUSTOMER',
    });

    const res = await withCsrf(agent, (token) => agent
      .post('/api/v1/auth/register')
      .set('X-CSRF-Token', token)
      .send({
        name: 'אבי2',
        phone: '0521111111',
        email: 'avi2-customer@test.com',
        password: 'Password123',
        role: 'CUSTOMER',
      }));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_PHONE');
  });

  it('rejects booking in the past', async () => {
    const agent = request.agent(app);
    const reg = await registerUser(agent, {
      name: 'לקוח',
      phone: '0522222222',
      email: 'customer-past@test.com',
      password: 'Password123',
      role: 'CUSTOMER',
    });
    const customerId = reg.body.data.user.id;

    const ownerReg = await registerUser(agent, {
      name: 'בעלים',
      phone: '0523333333',
      email: 'owner-past@test.com',
      password: 'Password123',
      role: 'BUSINESS_OWNER',
    });
    const { business, service } = await seedBusiness(ownerReg.body.data.user.id);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().slice(0, 10);

    const res = await withCsrf(agent, (token) => agent
      .post(`/api/v1/appointments/${business.slug}/book`)
      .set('X-CSRF-Token', token)
      .set('Authorization', authHeader(customerId, 'CUSTOMER'))
      .send({ serviceId: service.id, date: dateStr, time: '10:00' }));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects cancel of past appointment', async () => {
    const agent = request.agent(app);
    const reg = await registerUser(agent, {
      name: 'לקוח',
      phone: '0524444444',
      email: 'customer-cancel-past@test.com',
      password: 'Password123',
      role: 'CUSTOMER',
    });
    const customerId = reg.body.data.user.id;

    const ownerReg = await registerUser(agent, {
      name: 'בעלים',
      phone: '0525555555',
      email: 'owner-cancel-past@test.com',
      password: 'Password123',
      role: 'BUSINESS_OWNER',
    });
    const { business, service } = await seedBusiness(ownerReg.body.data.user.id);

    const past = new Date();
    past.setHours(past.getHours() - 2);
    const pastEnd = new Date(past.getTime() + 30 * 60 * 1000);

    const appointment = await prisma.appointment.create({
      data: {
        businessId: business.id,
        customerId,
        serviceId: service.id,
        startsAt: past,
        endsAt: pastEnd,
        status: AppointmentStatus.CONFIRMED,
      },
    });

    const res = await withCsrf(agent, (token) => agent
      .patch(`/api/v1/appointments/${appointment.id}/cancel`)
      .set('X-CSRF-Token', token)
      .set('Authorization', authHeader(customerId, 'CUSTOMER')));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PAST_APPOINTMENT');
  });

  it('sets PENDING_OWNER_DECISION on late cancellation', async () => {
    const agent = request.agent(app);
    const reg = await registerUser(agent, {
      name: 'לקוח',
      phone: '0526666666',
      email: 'customer-late-cancel@test.com',
      password: 'Password123',
      role: 'CUSTOMER',
    });
    const customerId = reg.body.data.user.id;

    const ownerReg = await registerUser(agent, {
      name: 'בעלים',
      phone: '0527777777',
      email: 'owner-late-cancel@test.com',
      password: 'Password123',
      role: 'BUSINESS_OWNER',
    });
    const { business, service } = await seedBusiness(ownerReg.body.data.user.id);

    const soon = new Date();
    soon.setHours(soon.getHours() + 2);
    const soonEnd = new Date(soon.getTime() + 30 * 60 * 1000);

    const appointment = await prisma.appointment.create({
      data: {
        businessId: business.id,
        customerId,
        serviceId: service.id,
        startsAt: soon,
        endsAt: soonEnd,
        status: AppointmentStatus.CONFIRMED,
      },
    });

    const res = await withCsrf(agent, (token) => agent
      .patch(`/api/v1/appointments/${appointment.id}/cancel`)
      .set('X-CSRF-Token', token)
      .set('Authorization', authHeader(customerId, 'CUSTOMER')));

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PENDING_OWNER_DECISION');
  });

  it('soft-hides service with future appointments on delete', async () => {
    const agent = request.agent(app);
    const reg = await registerUser(agent, {
      name: 'לקוח',
      phone: '0528888888',
      email: 'customer-soft-hide@test.com',
      password: 'Password123',
      role: 'CUSTOMER',
    });
    const customerId = reg.body.data.user.id;

    const ownerReg = await registerUser(agent, {
      name: 'בעלים',
      phone: '0529999999',
      email: 'owner-soft-hide@test.com',
      password: 'Password123',
      role: 'BUSINESS_OWNER',
    });
    const ownerId = ownerReg.body.data.user.id;
    const { business, service } = await seedBusiness(ownerId);

    const future = new Date();
    future.setDate(future.getDate() + 3);
    future.setHours(10, 0, 0, 0);
    const futureEnd = new Date(future.getTime() + 30 * 60 * 1000);

    await prisma.appointment.create({
      data: {
        businessId: business.id,
        customerId,
        serviceId: service.id,
        startsAt: future,
        endsAt: futureEnd,
        status: AppointmentStatus.CONFIRMED,
      },
    });

    const res = await withCsrf(agent, (token) => agent
      .delete(`/api/v1/services/${service.id}`)
      .set('X-CSRF-Token', token)
      .set('Authorization', authHeader(ownerId, 'BUSINESS_OWNER')));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SERVICE_HAS_APPOINTMENTS');

    const updated = await prisma.service.findUnique({ where: { id: service.id } });
    expect(updated?.isVisible).toBe(false);
  });

  it('blocks account delete with future appointments', async () => {
    const agent = request.agent(app);
    const reg = await registerUser(agent, {
      name: 'לקוח',
      phone: '0531111111',
      email: 'customer-block-delete@test.com',
      password: 'Password123',
      role: 'CUSTOMER',
    });
    const customerId = reg.body.data.user.id;

    const ownerReg = await registerUser(agent, {
      name: 'בעלים',
      phone: '0532222222',
      email: 'owner-block-delete@test.com',
      password: 'Password123',
      role: 'BUSINESS_OWNER',
    });
    const { business, service } = await seedBusiness(ownerReg.body.data.user.id);

    const future = new Date();
    future.setDate(future.getDate() + 5);
    future.setHours(14, 0, 0, 0);
    const futureEnd = new Date(future.getTime() + 30 * 60 * 1000);

    await prisma.appointment.create({
      data: {
        businessId: business.id,
        customerId,
        serviceId: service.id,
        startsAt: future,
        endsAt: futureEnd,
        status: AppointmentStatus.CONFIRMED,
      },
    });

    const res = await withCsrf(agent, (token) => agent
      .delete('/api/v1/users/me')
      .set('X-CSRF-Token', token)
      .set('Authorization', authHeader(customerId, 'CUSTOMER'))
      .send({ password: 'Password123' }));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('FUTURE_APPOINTMENTS_EXIST');
    expect(res.body.error.details.appointments).toHaveLength(1);
  });

  it('gdpr delete nullifies PII after password verify', async () => {
    const agent = request.agent(app);
    const reg = await registerUser(agent, {
      name: 'לקוח',
      phone: '0533333333',
      email: 'gdpr@test.com',
      password: 'Password123',
      role: 'CUSTOMER',
    });
    const customerId = reg.body.data.user.id;

    const res = await withCsrf(agent, (token) => agent
      .post('/api/v1/users/me/gdpr-delete')
      .set('X-CSRF-Token', token)
      .set('Authorization', authHeader(customerId, 'CUSTOMER'))
      .send({ password: 'Password123', confirm: true }));

    expect(res.status).toBe(200);
    expect(res.body.data.gdprDeleted).toBe(true);

    const user = await prisma.user.findUnique({ where: { id: customerId } });
    expect(user?.name).toBe('משתמש שנמחק');
    expect(user?.emailEnc).toBeNull();
    expect(user?.deletedAt).not.toBeNull();
  });

  it('warns when updating hours with future appointments', async () => {
    const agent = request.agent(app);
    const reg = await registerUser(agent, {
      name: 'לקוח',
      phone: '0534444444',
      email: 'customer-hours-warn@test.com',
      password: 'Password123',
      role: 'CUSTOMER',
    });
    const customerId = reg.body.data.user.id;

    const ownerReg = await registerUser(agent, {
      name: 'בעלים',
      phone: '0535555555',
      email: 'owner-hours-warn@test.com',
      password: 'Password123',
      role: 'BUSINESS_OWNER',
    });
    const ownerId = ownerReg.body.data.user.id;
    const { business, service } = await seedBusiness(ownerId);

    const future = new Date();
    future.setDate(future.getDate() + 2);
    future.setHours(11, 0, 0, 0);
    const futureEnd = new Date(future.getTime() + 30 * 60 * 1000);

    await prisma.appointment.create({
      data: {
        businessId: business.id,
        customerId,
        serviceId: service.id,
        startsAt: future,
        endsAt: futureEnd,
        status: AppointmentStatus.CONFIRMED,
      },
    });

    const days = Array.from({ length: 7 }, (_, dayOfWeek) => ({
      dayOfWeek,
      isActive: true,
      startTime: '08:00',
      endTime: '20:00',
    }));

    const res = await withCsrf(agent, (token) => agent
      .put(`/api/v1/businesses/${business.id}/availability`)
      .set('X-CSRF-Token', token)
      .set('Authorization', authHeader(ownerId, 'BUSINESS_OWNER'))
      .send({ days }));

    expect(res.status).toBe(200);
    expect(res.body.data.warning).toContain('תורים עתידיים');
  });

  it('creates audit logs on sensitive actions', async () => {
    const agent = request.agent(app);
    await registerUser(agent, {
      name: 'אבי',
      phone: '0536666666',
      email: 'avi-audit@test.com',
      password: 'Password123',
      role: 'CUSTOMER',
    });

    await new Promise((r) => setTimeout(r, 50));
    const logs = await prisma.auditLog.findMany({ where: { action: 'auth.register' } });
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].metadata).toMatchObject({ success: true });
  });
});
