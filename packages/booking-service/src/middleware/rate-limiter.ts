import type { NextFunction, Request, Response } from 'express';
import { API_ERROR_CODES } from '@torbook/shared';
import { getRedis } from '../lib/redis.js';
import { AppError } from '../utils/app-error.js';
import type { AuthenticatedRequest } from './auth.js';

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim() ?? req.ip ?? 'unknown';
  return req.ip ?? 'unknown';
}

type RateLimiterOptions = {
  /** Redis key namespace, e.g. 'appointment_book'. */
  keyPrefix: string;
  /** Max requests allowed within the window. */
  max: number;
  /** Window length in seconds. */
  windowSeconds: number;
};

/**
 * Simple fixed-window Redis rate limiter. Keys by authenticated user id when available
 * (falls back to IP for unauthenticated requests, e.g. the support form).
 */
export function createRateLimiter({ keyPrefix, max, windowSeconds }: RateLimiterOptions) {
  return async function rateLimiter(req: Request, _res: Response, next: NextFunction) {
    try {
      const flag = process.env.E2E_DISABLE_RATE_LIMIT;
      if (flag === '1' || flag === 'true') {
        next();
        return;
      }

      const userId = (req as AuthenticatedRequest).userId;
      const identity = userId ? `user:${userId}` : `ip:${getClientIp(req)}`;
      const key = `ratelimit:${keyPrefix}:${identity}`;
      const redis = getRedis();

      const attempts = await redis.incr(key);
      if (attempts === 1) {
        await redis.expire(key, windowSeconds);
      }

      if (attempts > max) {
        throw new AppError(429, API_ERROR_CODES.RATE_LIMITED, 'יותר מדי בקשות. נסה שוב מאוחר יותר.');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export const bookAppointmentRateLimiter = createRateLimiter({
  keyPrefix: 'appointment_book',
  max: 20,
  windowSeconds: 10 * 60,
});

export const commentRateLimiter = createRateLimiter({
  keyPrefix: 'comment',
  max: 10,
  windowSeconds: 10 * 60,
});

export const supportRequestRateLimiter = createRateLimiter({
  keyPrefix: 'support_request',
  max: 5,
  windowSeconds: 60 * 60,
});
