import { prisma } from '../src/client.js';

async function repairMigrations(): Promise<void> {
  const appliedCoordinates = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "_prisma_migrations"
    WHERE migration_name = '20260713100000_add_business_coordinates'
      AND finished_at IS NOT NULL
  `;

  if (appliedCoordinates[0]?.count !== 1n) {
    return;
  }

  await prisma.$executeRaw`
    DELETE FROM "_prisma_migrations"
    WHERE migration_name = '20260712150000_add_business_coordinates'
      AND finished_at IS NULL
  `;
}

await repairMigrations()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
