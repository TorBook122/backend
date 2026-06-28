# torbook-auth (@torbook/auth)

## Role

JWT access/refresh token management and password hashing. Refresh tokens are stored in Redis. Server entry: [`packages/auth/src/server.ts`](../../packages/auth/src/server.ts).

## Ports and Render config

| Setting | Value |
|---------|-------|
| Port | 3004 |
| Render service | `torbook-auth` |
| Type | pserv (private) |
| Plan | starter |
| Health check | `/health` |
| Dockerfile | `packages/auth/Dockerfile` |

## Environment variables

| Variable | Required | Source |
|----------|----------|--------|
| `INTERNAL_SERVICE_SECRET` | yes | manual (`sync: false`) |
| `REDIS_URL` | yes | manual — refresh token storage |
| `JWT_ACCESS_SECRET` | yes | manual — `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | yes | manual — `openssl rand -hex 32` |
| `PORT` | no | defaults to 3004 |
| `NODE_ENV` | no | `production` on Render |

See [`.env.example`](../../.env.example) for local placeholders.

## Internal endpoints (summary)

All endpoints require `X-Internal-Key` header.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/tokens/access` | Sign a JWT access token |
| `POST` | `/tokens/refresh` | Issue a refresh token (stored in Redis) |
| `POST` | `/tokens/access/verify` | Verify an access token |
| `POST` | `/tokens/refresh/verify` | Verify a refresh token and check Redis |
| `POST` | `/tokens/refresh/revoke` | Revoke a refresh token by jti or token |
| `POST` | `/password/hash` | Hash a password (bcrypt) |
| `POST` | `/password/verify` | Verify password against hash |

## Dependencies

**Calls:** Redis (refresh token storage)

**Called by:** `torbook-api` (orchestrates login, register, token refresh flows)

## Local development

Requires Redis running (`pnpm docker:infra`). Started on port 3004 by `pnpm docker:up`.

The service exits on startup if Redis is unreachable.

## Code conventions / change guidelines

- **The API orchestrates auth flows** — do not expose auth endpoints publicly. All token/password operations go through `torbook-api`.
- Refresh tokens use a unique `jti` stored in Redis with TTL based on `rememberMe`.
- JWT secrets must be at least 32 characters. Use `openssl rand -hex 32` to generate.
- Token signing/verification logic lives in `packages/auth/src/jwt.ts`; password logic in `password.ts`.
