import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import { Redis } from 'ioredis';
import { requireInternalKey } from '@torbook/shared/server/internal-auth';
import {
  getRefreshTtlSeconds,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from './jwt.js';
import { hashPassword, verifyPassword } from './password.js';

const app: Express = express();
app.use(express.json());

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }
  return redis;
}

async function storeRefreshToken(userId: string, jti: string, rememberMe: boolean) {
  const ttl = getRefreshTtlSeconds(rememberMe);
  await getRedis().set(`refresh:${jti}`, userId, 'EX', ttl);
}

async function revokeRefreshToken(jti: string) {
  await getRedis().del(`refresh:${jti}`);
}

async function isRefreshTokenValid(jti: string, userId: string): Promise<boolean> {
  const stored = await getRedis().get(`refresh:${jti}`);
  return stored === userId;
}

app.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' } });
});

const internal = express.Router();
internal.use(requireInternalKey);

internal.post('/tokens/access', (req, res) => {
  const { sub, role, onboardingCompletedAt, hasPhone } = req.body as {
    sub?: unknown;
    role?: unknown;
    onboardingCompletedAt?: string | null;
    hasPhone?: boolean;
  };

  if (typeof sub !== 'string' || typeof role !== 'string') {
    res.status(400).json({ success: false, error: 'sub and role are required' });
    return;
  }

  const accessToken = signAccessToken(
    sub,
    role,
    onboardingCompletedAt === undefined ? null : onboardingCompletedAt,
    hasPhone ?? true,
  );
  res.json({ success: true, data: { accessToken } });
});

internal.post('/tokens/refresh', async (req, res) => {
  const { sub, rememberMe } = req.body as { sub?: unknown; rememberMe?: boolean };
  if (typeof sub !== 'string') {
    res.status(400).json({ success: false, error: 'sub is required' });
    return;
  }

  const jti = randomUUID();
  const refreshToken = signRefreshToken(sub, jti, rememberMe ?? false);
  await storeRefreshToken(sub, jti, rememberMe ?? false);

  res.json({
    success: true,
    data: {
      refreshToken,
      jti,
      ttlSeconds: getRefreshTtlSeconds(rememberMe ?? false),
    },
  });
});

internal.post('/tokens/access/verify', (req, res) => {
  const { token } = req.body as { token?: unknown };
  if (typeof token !== 'string') {
    res.status(400).json({ success: false, error: 'token is required' });
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    res.json({ success: true, data: payload });
  } catch {
    res.status(401).json({ success: false, error: 'Invalid access token' });
  }
});

internal.post('/tokens/refresh/verify', async (req, res) => {
  const { token } = req.body as { token?: unknown };
  if (typeof token !== 'string') {
    res.status(400).json({ success: false, error: 'token is required' });
    return;
  }

  try {
    const payload = verifyRefreshToken(token);
    const valid = await isRefreshTokenValid(payload.jti, payload.sub);
    res.json({ success: true, data: { ...payload, valid } });
  } catch {
    res.status(401).json({ success: false, error: 'Invalid refresh token' });
  }
});

internal.post('/tokens/refresh/revoke', async (req, res) => {
  const { jti, token } = req.body as { jti?: unknown; token?: unknown };

  if (typeof jti === 'string') {
    await revokeRefreshToken(jti);
    res.json({ success: true, data: { revoked: true } });
    return;
  }

  if (typeof token === 'string') {
    try {
      const payload = verifyRefreshToken(token);
      await revokeRefreshToken(payload.jti);
    } catch {
      // ignore invalid tokens on revoke
    }
    res.json({ success: true, data: { revoked: true } });
    return;
  }

  res.status(400).json({ success: false, error: 'jti or token is required' });
});

internal.post('/password/hash', async (req, res) => {
  const { password } = req.body as { password?: unknown };
  if (typeof password !== 'string') {
    res.status(400).json({ success: false, error: 'password is required' });
    return;
  }

  const hash = await hashPassword(password);
  res.json({ success: true, data: { hash } });
});

internal.post('/password/verify', async (req, res) => {
  const { password, hash } = req.body as { password?: unknown; hash?: unknown };
  if (typeof password !== 'string' || typeof hash !== 'string') {
    res.status(400).json({ success: false, error: 'password and hash are required' });
    return;
  }

  const valid = await verifyPassword(password, hash);
  res.json({ success: true, data: { valid } });
});

app.use(internal);

const port = Number(process.env.PORT ?? 3004);

if (process.env.NODE_ENV !== 'test') {
  getRedis().connect().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Auth service failed to connect to Redis', err);
    process.exit(1);
  });

  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`KvaTor auth service listening on port ${port}`);
  });
}

export default app;
