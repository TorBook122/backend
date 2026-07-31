import pg from 'pg';

const { Client } = pg;

function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  if (process.env.CI) {
    return 'postgresql://postgres:postgres@localhost:5432/torbook_test';
  }
  return 'postgresql://torbook:torbook_dev@localhost:5433/torbook';
}

async function withClient<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function resetDatabase(): Promise<void> {
  await withClient(async (client) => {
    await client.query(`
      TRUNCATE
        "AuditLog",
        "Appointment",
        "BusinessComment",
        "BusinessLike",
        "Favorite",
        "FcmToken",
        "TimeBlock",
        "BreakBlock",
        "Availability",
        "Service",
        "Employee",
        "EmployeeRole",
        "Business",
        "User"
      RESTART IDENTITY CASCADE
    `);
  });
}

export async function disconnectDatabase(): Promise<void> {
  // No persistent client to disconnect when using pg.
}

export async function clearUserPhone(userId: string): Promise<void> {
  await withClient(async (client) => {
    await client.query(
      `UPDATE "User" SET "phoneEnc" = NULL, "phoneHash" = NULL, "updatedAt" = NOW() WHERE id = $1`,
      [userId],
    );
  });
}

export async function setBusinessPro(businessId: string): Promise<void> {
  await withClient(async (client) => {
    await client.query(`UPDATE "Business" SET "isPro" = true, "updatedAt" = NOW() WHERE id = $1`, [
      businessId,
    ]);
  });
}

export async function setBusinessCoordinates(
  businessId: string,
  latitude: number,
  longitude: number,
): Promise<void> {
  await withClient(async (client) => {
    await client.query(
      `UPDATE "Business" SET latitude = $2, longitude = $3, "updatedAt" = NOW() WHERE id = $1`,
      [businessId, latitude, longitude],
    );
  });
}
