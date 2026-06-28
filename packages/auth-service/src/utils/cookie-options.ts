export function crossSiteCookieOptions() {
  const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:3000';
  const isLocalOrigin =
    corsOrigin.includes('localhost') || corsOrigin.includes('127.0.0.1');

  if (isLocalOrigin) {
    return { sameSite: 'lax' as const, secure: false };
  }

  return { sameSite: 'none' as const, secure: true };
}
