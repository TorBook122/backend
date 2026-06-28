import type { NextFunction, Request, Response } from 'express';
import { API_ERROR_CODES, LOGIN_LOCKOUT_SECONDS, LOGIN_MAX_ATTEMPTS } from '@torbook/shared';
import { getRedis } from '../lib/redis.js';
import { AppError } from '../utils/app-error.js';

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim() ?? req.ip;
  return req.ip ?? 'unknown';
}

export async function loginRateLimiter(req: Request, _res: Response, next: NextFunction) {
  try {
    const ip = getClientIp(req);
    const key = `login_fail:${ip}`;
    const redis = getRedis();
    const attempts = await redis.get(key);
    if (attempts && Number(attempts) >= LOGIN_MAX_ATTEMPTS) {
      throw new AppError(429, API_ERROR_CODES.RATE_LIMITED, 'יותר מדי ניסיונות כניסה. נסה שוב מאוחר יותר.');
    }
    next();
  } catch (error) {
    next(error);
  }
}

export async function recordLoginFailure(req: Request): Promise<void> {
  const ip = getClientIp(req);
  const key = `login_fail:${ip}`;
  const redis = getRedis();
  const attempts = await redis.incr(key);
  if (attempts === 1) {
    await redis.expire(key, LOGIN_LOCKOUT_SECONDS);
  }
}

export async function clearLoginFailures(req: Request): Promise<void> {
  const ip = getClientIp(req);
  await getRedis().del(`login_fail:${ip}`);
}
