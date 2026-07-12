# @torbook/gateway

## Role

Public HTTP gateway for the KvaTor backend. Handles CORS, CSRF, admin panel, and reverse-proxies to `auth-service` and `booking-service`. Entry point: [`packages/gateway/src/app.ts`](../../packages/gateway/src/app.ts).

In production and Docker dev, gateway runs as a **module inside the unified Node process** (`@torbook/monolith`), not as a separate container. Production image: [`Dockerfile`](../../Dockerfile).

## Ports

| Setting | Value |
|---------|-------|
| Port | 3001 (only public port) |
| Health check | `/health` |

## Environment variables

| Variable | Required | Notes |
|----------|----------|-------|
| `INTERNAL_SERVICE_SECRET` | yes | shared across all modules |
| `REDIS_URL` | yes | admin session storage |
| `CORS_ORIGIN` | yes | comma-separated frontend origins |
| `AUTH_SERVICE_URL` | yes | loopback, e.g. `http://127.0.0.1:3002` |
| `BOOKING_SERVICE_URL` | yes | loopback, e.g. `http://127.0.0.1:3003` |
| `PORT` | no | defaults to 3001 |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | no | admin panel credentials |

See [`.env.example`](../../.env.example) for local placeholders.

## Public endpoints (summary)

| Path | Description |
|------|-------------|
| `GET /health` | Health check |
| `GET /api/v1/csrf` | Issue CSRF token |
| `/api/v1/auth/*` | Proxied to auth-service |
| `/api/v1/businesses/*`, `/api/v1/appointments/*`, etc. | Proxied to booking-service |
| `/admin` | Server-rendered admin panel (same-origin) |

## Dependencies

**Proxies to:** `@torbook/auth-service`, `@torbook/booking-service`, Redis

**Called by:** Next.js client (public internet)

## Code conventions

- No direct Prisma access — booking and auth services own business logic.
- CORS applies to `/api/v1/*` only; `/admin` is same-origin HTML.
- New public routes are added in auth-service or booking-service, then proxied from gateway.
