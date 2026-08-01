import { Redis } from 'ioredis';

function resolveRedisUrl(): string {
  return process.env.REDIS_URL ?? 'redis://localhost:6379';
}

async function deleteByPatterns(redis: Redis, patterns: string[]): Promise<void> {
  for (const pattern of patterns) {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== '0');
  }
}

/** Clears auth/booking rate-limit keys so e2e registration is not blocked by prior runs. */
export async function clearRateLimitKeys(): Promise<void> {
  const redis = new Redis(resolveRedisUrl(), {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

  try {
    await redis.connect();
    await deleteByPatterns(redis, [
      'login_fail:*',
      'login_fail_acct:*',
      'register_attempt:*',
      'pwd_reset_req:*',
      'pwd_reset_fail:*',
      'ratelimit:*',
    ]);
  } finally {
    await redis.quit().catch(() => undefined);
  }
}
