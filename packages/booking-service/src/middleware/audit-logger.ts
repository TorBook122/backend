import type { NextFunction, Request, Response } from 'express';
import { dbClient } from '../clients/db.client.js';

export function auditLogger(action: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      const success = typeof body === 'object' && body !== null && 'success' in body
        ? (body as { success: boolean }).success
        : res.statusCode < 400;

      void dbClient.auditLogs
        .create({
          action,
          userId: (req as Request & { userId?: string }).userId ?? null,
          ipAddress: req.ip,
          metadata: {
            path: req.path,
            method: req.method,
            success,
          },
        })
        .catch(() => undefined);

      return originalJson(body);
    }) as typeof res.json;

    next();
  };
}
