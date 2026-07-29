import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import {
  API_ERROR_CODES,
  LOGIN_ACCOUNT_LOCKOUT_SECONDS,
  LOGIN_ACCOUNT_MAX_ATTEMPTS,
  LOGIN_LOCKOUT_SECONDS,
  LOGIN_MAX_ATTEMPTS,
  PASSWORD_RESET_REQUEST_MAX,
  PASSWORD_RESET_REQUEST_WINDOW_SECONDS,
  REGISTER_MAX_ATTEMPTS,
  REGISTER_WINDOW_SECONDS,
} from '@torbook/shared';
import { getRedis } from '../lib/redis.js';
import { AppError } from '../utils/app-error.js';

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim() ?? req.ip;
  return req.ip ?? 'unknown';
}

/** Hash of the normalized login identifier so we never store raw emails/phones as Redis keys. */
function accountKeyFor(req: Request): string | null {
  const identifier = typeof req.body?.identifier === 'string' ? req.body.identifier.trim().toLowerCase() : '';
  if (!identifier) return null;
  return createHash('sha256').update(identifier).digest('hex');
}

export async function loginRateLimiter(req: Request, _res: Response, next: NextFunction) {
  try {
    const ip = getClientIp(req);
    const redis = getRedis();

    const ipAttempts = await redis.get(`login_fail:${ip}`);
    if (ipAttempts && Number(ipAttempts) >= LOGIN_MAX_ATTEMPTS) {
      throw new AppError(429, API_ERROR_CODES.RATE_LIMITED, 'יותר מדי ניסיונות כניסה. נסה שוב מאוחר יותר.');
    }

    // Also cap attempts per targeted account, regardless of source IP, so a distributed
    // (multi-IP) brute force against one victim's credentials is still throttled.
    const accountKey = accountKeyFor(req);
    if (accountKey) {
      const accountAttempts = await redis.get(`login_fail_acct:${accountKey}`);
      if (accountAttempts && Number(accountAttempts) >= LOGIN_ACCOUNT_MAX_ATTEMPTS) {
        throw new AppError(429, API_ERROR_CODES.RATE_LIMITED, 'יותר מדי ניסיונות כניסה. נסה שוב מאוחר יותר.');
      }
    }

    next();
  } catch (error) {
    next(error);
  }
}

export async function recordLoginFailure(req: Request): Promise<void> {
  const ip = getClientIp(req);
  const redis = getRedis();

  const ipKey = `login_fail:${ip}`;
  const ipAttempts = await redis.incr(ipKey);
  if (ipAttempts === 1) {
    await redis.expire(ipKey, LOGIN_LOCKOUT_SECONDS);
  }

  const accountKey = accountKeyFor(req);
  if (accountKey) {
    const acctRedisKey = `login_fail_acct:${accountKey}`;
    const acctAttempts = await redis.incr(acctRedisKey);
    if (acctAttempts === 1) {
      await redis.expire(acctRedisKey, LOGIN_ACCOUNT_LOCKOUT_SECONDS);
    }
  }
}

export async function clearLoginFailures(req: Request): Promise<void> {
  const ip = getClientIp(req);
  const redis = getRedis();
  const accountKey = accountKeyFor(req);
  await Promise.all([
    redis.del(`login_fail:${ip}`),
    accountKey ? redis.del(`login_fail_acct:${accountKey}`) : Promise.resolve(),
  ]);
}

export async function registerRateLimiter(req: Request, _res: Response, next: NextFunction) {
  try {
    const ip = getClientIp(req);
    const key = `register_attempt:${ip}`;
    const redis = getRedis();
    const attempts = await redis.get(key);
    if (attempts && Number(attempts) >= REGISTER_MAX_ATTEMPTS) {
      throw new AppError(429, API_ERROR_CODES.RATE_LIMITED, 'יותר מדי הרשמות. נסה שוב מאוחר יותר.');
    }
    await recordRegisterAttempt(req);
    next();
  } catch (error) {
    next(error);
  }
}

async function recordRegisterAttempt(req: Request): Promise<void> {
  const ip = getClientIp(req);
  const key = `register_attempt:${ip}`;
  const redis = getRedis();
  const attempts = await redis.incr(key);
  if (attempts === 1) {
    await redis.expire(key, REGISTER_WINDOW_SECONDS);
  }
}

export async function forgotPasswordRateLimiter(req: Request, _res: Response, next: NextFunction) {
  try {
    const ip = getClientIp(req);
    const key = `pwd_reset_req:${ip}`;
    const redis = getRedis();
    const count = await redis.get(key);
    if (count && Number(count) >= PASSWORD_RESET_REQUEST_MAX) {
      throw new AppError(429, API_ERROR_CODES.RATE_LIMITED, 'יותר מדי בקשות. נסה שוב מאוחר יותר.');
    }
    next();
  } catch (error) {
    next(error);
  }
}

export async function recordForgotPasswordRequest(req: Request): Promise<void> {
  const ip = getClientIp(req);
  const key = `pwd_reset_req:${ip}`;
  const redis = getRedis();
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, PASSWORD_RESET_REQUEST_WINDOW_SECONDS);
  }
}

export async function resetPasswordRateLimiter(req: Request, _res: Response, next: NextFunction) {
  try {
    const ip = getClientIp(req);
    const key = `pwd_reset_fail:${ip}`;
    const redis = getRedis();
    const attempts = await redis.get(key);
    if (attempts && Number(attempts) >= PASSWORD_RESET_REQUEST_MAX) {
      throw new AppError(429, API_ERROR_CODES.RATE_LIMITED, 'יותר מדי ניסיונות. נסה שוב מאוחר יותר.');
    }
    next();
  } catch (error) {
    next(error);
  }
}

export async function recordResetPasswordFailure(req: Request): Promise<void> {
  const ip = getClientIp(req);
  const key = `pwd_reset_fail:${ip}`;
  const redis = getRedis();
  const attempts = await redis.incr(key);
  if (attempts === 1) {
    await redis.expire(key, PASSWORD_RESET_REQUEST_WINDOW_SECONDS);
  }
}
