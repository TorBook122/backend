import { beforeEach, describe, expect, it } from 'vitest';
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from './jwt.js';

beforeEach(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-xx';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-x';
});

describe('jwt', () => {
  it('signs and verifies access tokens', () => {
    const token = signAccessToken('user-1', 'CUSTOMER', null);
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe('user-1');
    expect(payload.role).toBe('CUSTOMER');
    expect(payload.onboardingCompletedAt).toBeNull();
    expect(payload.type).toBe('access');
  });

  it('signs and verifies refresh tokens', () => {
    const token = signRefreshToken('user-1', 'jti-1', true);
    const payload = verifyRefreshToken(token);
    expect(payload.sub).toBe('user-1');
    expect(payload.jti).toBe('jti-1');
    expect(payload.type).toBe('refresh');
  });
});
