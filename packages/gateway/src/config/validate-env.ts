const REQUIRED_IN_PRODUCTION = [
  'SHARED_SERVICE_URL',
  'DB_SERVICE_URL',
  'AUTH_SERVICE_URL',
  'BOOKING_SERVICE_URL',
  'QUEUE_SERVICE_URL',
  'INTERNAL_SERVICE_SECRET',
  'REDIS_URL',
  'CORS_ORIGIN',
  'ADMIN_USERNAME',
  'ADMIN_PASSWORD',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'AES_ENCRYPTION_KEY',
  'PII_HASH_SECRET',
  'GOOGLE_CLIENT_ID',
] as const;

/** Known placeholder / dev defaults that must never ship to production. */
const FORBIDDEN_VALUES: Partial<Record<(typeof REQUIRED_IN_PRODUCTION)[number], string[]>> = {
  INTERNAL_SERVICE_SECRET: ['dev-internal-secret'],
  JWT_ACCESS_SECRET: ['change-me-access-secret-min-32-chars'],
  JWT_REFRESH_SECRET: ['change-me-refresh-secret-min-32-chars'],
  AES_ENCRYPTION_KEY: ['0000000000000000000000000000000000000000000000000000000000000000'],
  ADMIN_USERNAME: ['admin'],
  ADMIN_PASSWORD: ['admin'],
};

function isForbiddenValue(key: (typeof REQUIRED_IN_PRODUCTION)[number], value: string): boolean {
  const forbidden = FORBIDDEN_VALUES[key];
  if (forbidden?.includes(value)) {
    return true;
  }

  if (key === 'AES_ENCRYPTION_KEY') {
    return value.length !== 64 || !/^[0-9a-f]+$/i.test(value);
  }

  if (key.endsWith('_SECRET') || key === 'ADMIN_PASSWORD') {
    return Buffer.byteLength(value, 'utf8') < 32;
  }

  if (key === 'GOOGLE_CLIENT_ID') {
    return !value.endsWith('.apps.googleusercontent.com');
  }

  return false;
}

function isLocalOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function isInvalidProductionCorsOrigin(corsOrigin: string): boolean {
  const trimmed = corsOrigin.trim();
  if (!trimmed || trimmed === '*') {
    return true;
  }

  const origins = trimmed
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    return true;
  }

  return origins.every(isLocalOrigin);
}

export function validateProductionEnv(): void {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  const missing = REQUIRED_IN_PRODUCTION.filter((key) => !process.env[key]?.trim());
  const weak = REQUIRED_IN_PRODUCTION.filter((key) => {
    const value = process.env[key]?.trim();
    return value ? isForbiddenValue(key, value) : false;
  });

  const policyViolations: string[] = [];

  const accessSecret = process.env.JWT_ACCESS_SECRET?.trim();
  const refreshSecret = process.env.JWT_REFRESH_SECRET?.trim();
  if (accessSecret && refreshSecret && accessSecret === refreshSecret) {
    policyViolations.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ');
  }

  const corsOrigin = process.env.CORS_ORIGIN ?? '';
  if (isInvalidProductionCorsOrigin(corsOrigin)) {
    policyViolations.push(
      'CORS_ORIGIN must be non-empty, not "*", and include at least one non-localhost origin',
    );
  }

  if (missing.length === 0 && weak.length === 0 && policyViolations.length === 0) {
    return;
  }

  const lines = ['Production environment validation failed:'];
  if (missing.length > 0) {
    lines.push(`  Missing: ${missing.join(', ')}`);
  }
  if (weak.length > 0) {
    lines.push(`  Weak or placeholder values: ${weak.join(', ')}`);
  }
  if (policyViolations.length > 0) {
    lines.push(`  Policy violations: ${policyViolations.join('; ')}`);
  }
  lines.push(
    '',
    'Generate secrets with: openssl rand -hex 32',
    'AES_ENCRYPTION_KEY must be a 64-character hex string (32 bytes).',
    'Deploy the full backend stack and set all vars in Railway Dashboard.',
  );

  // eslint-disable-next-line no-console
  console.error(lines.join('\n'));
  process.exit(1);
}
