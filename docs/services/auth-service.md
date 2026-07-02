# @torbook/auth-service

## Role

Authentication and user profile routes: JWT access/refresh tokens, login/register, password hashing. Refresh tokens are stored in Redis. App factory: [`packages/auth-service/src/app.ts`](../../packages/auth-service/src/app.ts).

Runs as an **internal HTTP module** on loopback inside the unified process (port 3002 in dev/Docker).

## Ports

| Setting | Value |
|---------|-------|
| Port | 3002 (internal) |
| Health check | `/health` |

## Environment variables

| Variable | Required | Notes |
|----------|----------|-------|
| `INTERNAL_SERVICE_SECRET` | yes | |
| `REDIS_URL` | yes | refresh token storage |
| `JWT_ACCESS_SECRET` | yes | `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | yes | `openssl rand -hex 32` |
| `DB_SERVICE_URL` | yes | loopback → `@torbook/db` |
| `SHARED_SERVICE_URL` | yes | loopback → `@torbook/shared` |
| `PORT` | no | defaults to 3002 |

## Dependencies

**Calls:** `@torbook/db`, `@torbook/shared`, Redis

**Called by:** `@torbook/gateway` (proxy)

## Code conventions

- Do not expose this service publicly — all client traffic goes through the gateway.
- Token logic in `packages/auth-service/src/lib/`; route handlers stay thin.
