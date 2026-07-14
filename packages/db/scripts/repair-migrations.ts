import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../src/client.js';

const dbPackageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function runMigrateResolve(flag: '--applied' | '--rolled-back', migrationName: string): void {
  execSync(`pnpm exec prisma migrate resolve ${flag} ${migrationName}`, {
    cwd: dbPackageRoot,
    env: process.env,
    stdio: 'inherit',
  });
}

async function coordinatesColumnsExist(): Promise<boolean> {
  const columnCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Business'
      AND column_name IN ('latitude', 'longitude')
  `;

  return columnCount[0]?.count === 2n;
}

async function hasFailedMigration(migrationName: string): Promise<boolean> {
  const failed = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "_prisma_migrations"
    WHERE migration_name = ${migrationName}
      AND finished_at IS NULL
  `;

  return failed[0]?.count === 1n;
}

async function hasAppliedMigration(migrationName: string): Promise<boolean> {
  const applied = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "_prisma_migrations"
    WHERE migration_name = ${migrationName}
      AND finished_at IS NOT NULL
  `;

  return applied[0]?.count === 1n;
}

async function repairFailedCoordinatesMigration(): Promise<void> {
  const migrationName = '20260713100000_add_business_coordinates';
  if (!(await hasFailedMigration(migrationName))) {
    return;
  }

  if (await coordinatesColumnsExist()) {
    runMigrateResolve('--applied', migrationName);
    return;
  }

  runMigrateResolve('--rolled-back', migrationName);
}

async function repairDuplicateCoordinatesMigration(): Promise<void> {
  const migrationName = '20260712150000_add_business_coordinates';
  if (!(await hasFailedMigration(migrationName))) {
    return;
  }

  if (await hasAppliedMigration('20260713100000_add_business_coordinates')) {
    await prisma.$executeRaw`
      DELETE FROM "_prisma_migrations"
      WHERE migration_name = ${migrationName}
        AND finished_at IS NULL
    `;
  }
}

async function repairMigrations(): Promise<void> {
  await repairFailedCoordinatesMigration();
  await repairDuplicateCoordinatesMigration();
}

await repairMigrations()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
