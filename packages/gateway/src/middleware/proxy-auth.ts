import type { NextFunction, Request, Response } from 'express';
import { API_ERROR_CODES } from '@torbook/shared';

type ValidateResponse = {
  success: boolean;
  data?: {
    userId: string;
    role: string;
    onboardingCompletedAt: string | null;
  };
};

export async function proxyAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = header.slice(7);
  const authServiceUrl = process.env.AUTH_SERVICE_URL ?? 'http://localhost:3002';
  const internalSecret = process.env.INTERNAL_SERVICE_SECRET;

  if (!internalSecret) {
    res.status(500).json({
      success: false,
      error: { code: API_ERROR_CODES.INTERNAL_ERROR, message: 'Internal service secret not configured' },
    });
    return;
  }

  try {
    const response = await fetch(`${authServiceUrl}/internal/v1/token/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': internalSecret,
      },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      res.status(401).json({
        success: false,
        error: { code: API_ERROR_CODES.UNAUTHORIZED, message: 'סשן פג תוקף' },
      });
      return;
    }

    const body = (await response.json()) as ValidateResponse;
    if (!body.success || !body.data) {
      res.status(401).json({
        success: false,
        error: { code: API_ERROR_CODES.UNAUTHORIZED, message: 'סשן פג תוקף' },
      });
      return;
    }

    req.headers['x-internal-secret'] = internalSecret;
    req.headers['x-user-id'] = body.data.userId;
    req.headers['x-user-role'] = body.data.role;
    if (body.data.onboardingCompletedAt) {
      req.headers['x-user-onboarding'] = body.data.onboardingCompletedAt;
    } else {
      delete req.headers['x-user-onboarding'];
    }

    next();
  } catch {
    res.status(502).json({
      success: false,
      error: { code: API_ERROR_CODES.INTERNAL_ERROR, message: 'Auth service unavailable' },
    });
  }
}
