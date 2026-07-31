import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function resolveBackendRoot(e2eDir: string): string {
  const insideBackend = path.resolve(e2eDir, '..');
  if (fs.existsSync(path.join(insideBackend, 'pnpm-workspace.yaml'))) {
    return insideBackend;
  }

  return path.resolve(e2eDir, '../backend');
}

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
  const backendRoot = resolveBackendRoot(path.dirname(fileURLToPath(import.meta.url)));

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
