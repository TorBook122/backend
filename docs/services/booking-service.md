# @torbook/booking-service

## Role

Business listings, services, appointments, favorites, and related booking flows. App factory: [`packages/booking-service/src/app.ts`](../../packages/booking-service/src/app.ts).

Runs as an **internal HTTP module** on loopback inside the unified process (port 3003 in dev/Docker).

## Ports

| Setting | Value |
|---------|-------|
| Port | 3003 (internal) |
| Health check | `/health` |

## Environment variables

| Variable | Required | Notes |
|----------|----------|-------|
| `INTERNAL_SERVICE_SECRET` | yes | |
| `REDIS_URL` | yes | slot cache |
| `DB_SERVICE_URL` | yes | loopback → `@torbook/db` |
| `SHARED_SERVICE_URL` | yes | loopback → `@torbook/shared` |
| `QUEUE_SERVICE_URL` | yes | loopback → `@torbook/queue` |
| `PORT` | no | defaults to 3003 |

## Dependencies

**Calls:** `@torbook/db`, `@torbook/shared`, `@torbook/queue`, Redis

**Called by:** `@torbook/gateway` (proxy)

## Code conventions

- No direct Prisma access — use `@torbook/db` HTTP client.
- Appointment reminders/cancellations enqueue jobs via `@torbook/queue`.
