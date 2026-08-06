import pg from 'pg';
import { randomBytes } from 'node:crypto';

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
        "PlusPayment",
        "PlusSubscription",
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

export async function setBusinessSubscriptionTier(
  businessId: string,
  tier: 'GROWTH' | 'PLUS',
): Promise<void> {
  await withClient(async (client) => {
    await client.query(
      `UPDATE "Business" SET "subscriptionTier" = $2, "updatedAt" = NOW() WHERE id = $1`,
      [businessId, tier],
    );
  });
}

export async function getBusinessSubscriptionTier(
  businessId: string,
): Promise<'GROWTH' | 'PLUS' | null> {
  return withClient(async (client) => {
    const result = await client.query<{ subscriptionTier: 'GROWTH' | 'PLUS' | null }>(
      `SELECT "subscriptionTier" FROM "Business" WHERE id = $1`,
      [businessId],
    );
    return result.rows[0]?.subscriptionTier ?? null;
  });
}

/** @deprecated use setBusinessSubscriptionTier */
export async function setBusinessPro(businessId: string): Promise<void> {
  return setBusinessSubscriptionTier(businessId, 'PLUS');
}

/** @deprecated use getBusinessSubscriptionTier */
export async function getBusinessIsPro(businessId: string): Promise<boolean> {
  const tier = await getBusinessSubscriptionTier(businessId);
  return tier === 'PLUS';
}

export async function createPendingPlusCheckout(
  businessId: string,
  checkoutRef: string,
  priceAmountAgorot = 9900,
): Promise<{ subscriptionId: string; paymentId: string }> {
  const subscriptionId = `sub_${randomBytes(8).toString('hex')}`;
  const paymentId = `pay_${randomBytes(8).toString('hex')}`;

  return withClient(async (client) => {
    await client.query(
      `INSERT INTO "PlusSubscription" (
         id, "businessId", tier, status, "morningClientId", "priceAmount", "createdAt", "updatedAt"
       ) VALUES (
         $1, $2, 'PLUS', 'PENDING', 'e2e-morning-client', $3, NOW(), NOW()
       )`,
      [subscriptionId, businessId, priceAmountAgorot],
    );

    await client.query(
      `INSERT INTO "PlusPayment" (
         id, "subscriptionId", type, status, amount, "checkoutRef", "createdAt", "updatedAt"
       ) VALUES (
         $1, $2, 'INITIAL', 'PENDING', $3, $4, NOW(), NOW()
       )`,
      [paymentId, subscriptionId, priceAmountAgorot, checkoutRef],
    );

    return { subscriptionId, paymentId };
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
