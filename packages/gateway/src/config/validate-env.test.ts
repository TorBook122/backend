import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateProductionEnv } from './validate-env.js';

describe('validateProductionEnv', () => {
  const originalEnv = process.env;

  const validProductionEnv: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    SHARED_SERVICE_URL: 'http://torbook-shared:3011',
    DB_SERVICE_URL: 'http://torbook-db:3010',
    AUTH_SERVICE_URL: 'http://torbook-auth:3002',
    BOOKING_SERVICE_URL: 'http://torbook-booking:3003',
    QUEUE_SERVICE_URL: 'http://torbook-queue:3004',
    INTERNAL_SERVICE_SECRET: 'a'.repeat(32),
    REDIS_URL: 'redis://redis:6379',
    CORS_ORIGIN: 'https://app.example.com',
    ADMIN_USERNAME: 'ops-admin',
    ADMIN_PASSWORD: 'b'.repeat(32),
    JWT_ACCESS_SECRET: 'c'.repeat(32),
    JWT_REFRESH_SECRET: 'd'.repeat(32),
    AES_ENCRYPTION_KEY: 'e'.repeat(64),
    PII_HASH_SECRET: 'f'.repeat(32),
    GOOGLE_CLIENT_ID: '123456789.apps.googleusercontent.com',
  };

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('does nothing outside production', () => {
    process.env = { ...originalEnv, NODE_ENV: 'development' };
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    validateProductionEnv();

    expect(exit).not.toHaveBeenCalled();
  });

  it('exits when required vars are missing in production', () => {
    process.env = { NODE_ENV: 'production' };
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    validateProductionEnv();

    expect(error).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('passes with strong production secrets', () => {
    process.env = { ...validProductionEnv };
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    validateProductionEnv();

    expect(exit).not.toHaveBeenCalled();
  });

  it('exits when placeholder secrets are used in production', () => {
    process.env = {
      ...validProductionEnv,
      INTERNAL_SERVICE_SECRET: 'dev-internal-secret',
    };
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    validateProductionEnv();

    expect(exit).toHaveBeenCalledWith(1);
  });

  it('exits when JWT access and refresh secrets are identical', () => {
    process.env = {
      ...validProductionEnv,
      JWT_ACCESS_SECRET: 'same-secret-value-32-chars-min!!',
      JWT_REFRESH_SECRET: 'same-secret-value-32-chars-min!!',
    };
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    validateProductionEnv();

    expect(exit).toHaveBeenCalledWith(1);
  });

  it('exits when CORS_ORIGIN is localhost-only in production', () => {
    process.env = {
      ...validProductionEnv,
      CORS_ORIGIN: 'http://localhost:3000',
    };
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    validateProductionEnv();

    expect(exit).toHaveBeenCalledWith(1);
  });

  it('exits when CORS_ORIGIN is wildcard in production', () => {
    process.env = {
      ...validProductionEnv,
      CORS_ORIGIN: '*',
    };
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    validateProductionEnv();

    expect(exit).toHaveBeenCalledWith(1);
  });
});
