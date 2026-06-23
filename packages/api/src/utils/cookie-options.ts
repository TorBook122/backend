function parseCorsOrigins(): string[] {
  return (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isLocalOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

export function crossSiteCookieOptions() {
  const origins = parseCorsOrigins();
  const needsCrossSiteCookies = origins.some((origin) => !isLocalOrigin(origin));

  if (needsCrossSiteCookies) {
    return { sameSite: 'none' as const, secure: true };
  }

  return { sameSite: 'lax' as const, secure: false };
}
