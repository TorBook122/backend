const REQUIRED_IN_PRODUCTION = [
  'SHARED_SERVICE_URL',
  'DB_SERVICE_URL',
  'AUTH_SERVICE_URL',
  'INTERNAL_SERVICE_SECRET',
  'REDIS_URL',
  'CORS_ORIGIN',
] as const;

export function validateProductionEnv(): void {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  const missing = REQUIRED_IN_PRODUCTION.filter((key) => !process.env[key]?.trim());
  if (missing.length === 0) {
    return;
  }

  // eslint-disable-next-line no-console
  console.error(
    [
      'Missing required environment variables:',
      missing.join(', '),
      '',
      'KvaTor API depends on private microservices (shared, db, auth).',
      'Deploy the full backend/render.yaml Blueprint, or set these vars manually in Render Dashboard.',
      'Service URLs from Render hostport must include the service address, e.g. http://torbook-shared:3002',
    ].join('\n'),
  );
  process.exit(1);
}
