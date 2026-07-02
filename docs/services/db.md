# torbook-db (@torbook/db)

## Role

Prisma data layer exposed as an internal REST API. Owns the database schema and migrations. Server entry: [`packages/db/src/server.ts`](../../packages/db/src/server.ts).

Runs as an **internal HTTP module** on loopback inside the unified process (port 3010 in dev/Docker).

## Ports

| Setting | Value |
|---------|-------|
| Port | 3010 (internal loopback) |
| Health check | `/health` (includes DB connectivity check) |

## Environment variables

| Variable | Required | Notes |
|----------|----------|-------|
| `INTERNAL_SERVICE_SECRET` | yes | |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `PORT` | no | set by monolith on loopback |

See [`.env.example`](../../.env.example) for local placeholders.

## Internal endpoints (summary)

All routes require `X-Internal-Key` header.

| Prefix | Description |
|--------|-------------|
| `/users` | User CRUD and lookup |
| `/businesses` | Business CRUD |
| `/services` | Service listings per business |
| `/appointments` | Appointment CRUD and queries |
| `/favorites` | User favorites |
| `/fcm-tokens` | FCM device token storage |
| `/audit-logs` | Audit log entries |

## Dependencies

**Calls:** PostgreSQL (via Prisma), `@torbook/shared` (PII encrypt/hash for storage)

**Called by:** `@torbook/auth-service`, `@torbook/booking-service`, `@torbook/queue` worker

## Local development

```bash
pnpm docker:infra          # postgres on :5433
pnpm db:migrate            # apply migrations
pnpm db:seed               # optional seed data
pnpm dev:all               # includes db module on loopback :3010
```

Host-side Prisma CLI uses `DATABASE_URL` pointing to `localhost:5433`.

## Code conventions / change guidelines

- **All schema changes** go in [`packages/db/prisma/schema.prisma`](../../packages/db/prisma/schema.prisma).
- Create migrations locally with `pnpm db:migrate`. Never edit production databases manually.
- Production migrations run via `prisma migrate deploy` before the monolith starts (see [`Dockerfile`](../../Dockerfile)).
- PII fields must be encrypted/hashed via `@torbook/shared` before storage — do not store plaintext sensitive data.
- New resource routes go under `packages/db/src/routes/` and are mounted in `server.ts`.
