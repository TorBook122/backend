import type { NextFunction, Request, Response } from 'express';
import { timingSafeEqualStrings } from '../utils/timing-safe.js';

export function requireInternalKey(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.INTERNAL_SERVICE_SECRET;
  if (!secret) {
    res.status(500).json({ success: false, error: 'INTERNAL_SERVICE_SECRET not configured' });
    return;
  }

  const key = req.headers['x-internal-key'];
  if (typeof key !== 'string' || !timingSafeEqualStrings(key, secret)) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  next();
}
