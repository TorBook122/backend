import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  if (process.env.CI) {
    return 'postgresql://postgres:postgres@localhost:5432/torbook_test';
  }
  return 'postgresql://torbook:torbook_dev@localhost:5433/torbook';
}

export default async function globalSetup(): Promise<void> {
  const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../backend');

  execSync('pnpm --filter @torbook/db exec tsx scripts/repair-migrations.ts', {
    cwd: backendRoot,
    env: {
      ...process.env,
      DATABASE_URL: resolveDatabaseUrl(),
    },
    stdio: 'inherit',
  });

  execSync('pnpm --filter @torbook/db exec prisma migrate deploy', {
    cwd: backendRoot,
    env: {
      ...process.env,
      DATABASE_URL: resolveDatabaseUrl(),
    },
    stdio: 'inherit',
  });
}
