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

export function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

/** Next future occurrence of `hour:00` in the host local timezone (within 7 days). */
export function todayAtHour(hour: number): Date {
  const date = new Date();
  date.setSeconds(0, 0);
  date.setHours(hour, 0, 0, 0);
  if (date <= new Date()) {
    date.setDate(date.getDate() + 1);
    date.setHours(hour, 0, 0, 0);
  }
  return date;
}

/** Format a Date as UTC wall-clock for Prisma `timestamp without time zone` columns. */
function toUtcTimestamp(date: Date): string {
  return date.toISOString().replace('T', ' ').replace('Z', '');
}

export async function createConfirmedAppointment(params: {
  businessId: string;
  customerId: string;
  serviceId: string;
  startsAt?: Date;
  durationMins?: number;
}) {
  const durationMins = params.durationMins ?? 30;
  const startsAt = params.startsAt ?? new Date(Date.now() + 2 * 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + durationMins * 60 * 1000);

  const client = new Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();

  try {
    // Avoid Date objects — node-pg converts them with the host local timezone, which
    // makes past appointments look like they are still in the future vs NOW() (UTC).
    const result = await client.query<{ id: string }>(
      `
        INSERT INTO "Appointment" (
          id,
          "businessId",
          "customerId",
          "serviceId",
          "startsAt",
          "endsAt",
          status,
          "createdAt",
          "updatedAt"
        )
        VALUES (
          gen_random_uuid(),
          $1,
          $2,
          $3,
          $4::timestamp,
          $5::timestamp,
          'CONFIRMED',
          NOW(),
          NOW()
        )
        RETURNING id
      `,
      [
        params.businessId,
        params.customerId,
        params.serviceId,
        toUtcTimestamp(startsAt),
        toUtcTimestamp(endsAt),
      ],
    );

    return result.rows[0];
  } finally {
    await client.end();
  }
}
