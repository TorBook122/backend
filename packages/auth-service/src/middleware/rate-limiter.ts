import type { NextFunction, Request, Response } from 'express';
import {
  API_ERROR_CODES,
  LOGIN_LOCKOUT_SECONDS,
  LOGIN_MAX_ATTEMPTS,
  PASSWORD_RESET_REQUEST_MAX,
  PASSWORD_RESET_REQUEST_WINDOW_SECONDS,
} from '@torbook/shared';
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
