import { Redis as IORedis } from 'ioredis';

let redis: IORedis | null = null;

export function getRedis(): IORedis {
  if (!redis) {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    redis = new IORedis(url, { maxRetriesPerRequest: 3, lazyConnect: true });
  }
  return redis;
}

export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
