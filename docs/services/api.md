# torbook-api (@torbook/api)

## Role

Public HTTP gateway for the TorBook backend. Handles CORS, CSRF, rate limiting, and orchestrates calls to internal services. Entry point: [`packages/api/src/app.ts`](../../packages/api/src/app.ts).

## Ports and Render config

| Setting | Value |
|---------|-------|
| Port | 3001 |
| Render service | `torbook-api` |
| Type | web (public) |
| Plan | free |
| Health check | `/health` |
| Dockerfile | `packages/api/Dockerfile` |

## Environment variables

| Variable | Required | Source |
|----------|----------|--------|
| `INTERNAL_SERVICE_SECRET` | yes | manual (`sync: false`) |
| `REDIS_URL` | yes | manual — rate limiting |
| `CORS_ORIGIN` | yes | manual — comma-separated frontend origins |
| `SHARED_SERVICE_URL` | yes | auto (`fromService: torbook-shared`) |
| `DB_SERVICE_URL` | yes | auto (`fromService: torbook-db`) |
| `AUTH_SERVICE_URL` | yes | auto (`fromService: torbook-auth`) |
| `QUEUE_SERVICE_URL` | yes | auto (`fromService: torbook-queue-enqueue`) |
| `PORT` | no | defaults to 3001 |
| `NODE_ENV` | no | `production` on Render |

See [`.env.example`](../../.env.example) for local placeholders.

## Internal endpoints (summary)

Public routes only — this service does not expose internal endpoints.

| Path | Description |
|------|-------------|
| `GET /health` | Health check |
| `GET /api/v1/health` | API health check |
| `GET /api/v1/csrf` | Issue CSRF token |
| `/api/v1/auth/*` | Authentication flows |
| `/api/v1/businesses/*` | Business CRUD |
| `/api/v1/services/*` | Service listings |
| `/api/v1/appointments/*` | Appointment management |
| `/api/v1/users/*` | User profile |
| `/admin` | Server-rendered admin panel (same-origin, no CORS) |

## Dependencies

**Calls:** `torbook-shared`, `torbook-db`, `torbook-auth`, `torbook-queue-enqueue`, Redis

**Called by:** Next.js client (public internet)

Uses `@torbook/shared/server/http-client` to proxy requests to internal services with the `X-Internal-Key` header.

## Local development

```bash
pnpm docker:infra   # postgres + redis
pnpm docker:up      # full stack including api on :3001
# or
pnpm dev            # api only — other services must be running
```

## Code conventions / change guidelines

- **No direct Prisma access.** All database operations go through `torbook-db` via the HTTP client.
- **No business logic in route handlers** that belongs in internal services — keep orchestration thin.
- New public routes go under `/api/v1/`. Admin routes go under `/admin`.
- CORS applies to `/api/v1/*` only; `/admin` is same-origin HTML.
