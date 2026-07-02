import { afterEach, describe, expect, it } from 'vitest';
import { crossSiteCookieOptions } from './cookie-options.js';

describe('crossSiteCookieOptions', () => {
  const original = process.env.CORS_ORIGIN;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.CORS_ORIGIN;
    } else {
      process.env.CORS_ORIGIN = original;
    }
  });

  it('uses lax cookies for localhost-only origins', () => {
    process.env.CORS_ORIGIN = 'http://localhost:3000,http://127.0.0.1:3000';
    expect(crossSiteCookieOptions()).toEqual({ sameSite: 'lax', secure: false });
  });

  it('uses cross-site cookies when any origin is non-local', () => {
    process.env.CORS_ORIGIN =
      'http://localhost:3000,http://127.0.0.1:3000,https://torbook122.github.io';
    expect(crossSiteCookieOptions()).toEqual({ sameSite: 'none', secure: true, partitioned: true });
  });

  it('uses cross-site cookies for production-only origins', () => {
    process.env.CORS_ORIGIN = 'https://torbook122.github.io';
    expect(crossSiteCookieOptions()).toEqual({ sameSite: 'none', secure: true, partitioned: true });
  });
});
