# torbook-db (@torbook/db)

## Role

Prisma data layer exposed as an internal REST API. Owns the database schema and migrations. Server entry: [`packages/db/src/server.ts`](../../packages/db/src/server.ts).

## Ports and Render config

| Setting | Value |
|---------|-------|
| Port | 3003 |
| Render service | `torbook-db` |
| Type | pserv (private) |
| Plan | starter |
| Health check | `/health` (includes DB connectivity check) |
| Dockerfile | `packages/db/Dockerfile` |
| Start command | `prisma migrate deploy && node packages/db/dist/index.js` |

## Environment variables

| Variable | Required | Source |
|----------|----------|--------|
| `INTERNAL_SERVICE_SECRET` | yes | manual (`sync: false`) |
| `DATABASE_URL` | yes | manual — PostgreSQL connection string |
| `PORT` | no | defaults to 3003 |
| `NODE_ENV` | no | `production` on Render |

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

**Calls:** PostgreSQL (via Prisma), `torbook-shared` (PII encrypt/hash for storage)

**Called by:** `torbook-api`, `torbook-notifications`, `torbook-queue-worker`

## Local development

```bash
pnpm docker:infra          # postgres on :5433
pnpm db:migrate            # apply migrations
pnpm db:seed               # optional seed data
pnpm docker:up             # includes db service on :3003 (internal)
```

Host-side Prisma CLI uses `DATABASE_URL` pointing to `localhost:5433`.

## Code conventions / change guidelines

- **All schema changes** go in [`packages/db/prisma/schema.prisma`](../../packages/db/prisma/schema.prisma).
- Create migrations locally with `pnpm db:migrate`. Never edit production databases manually.
- Production migrations run automatically on `torbook-db` container start via `prisma migrate deploy`.
- PII fields must be encrypted/hashed via `torbook-shared` before storage — do not store plaintext sensitive data.
- New resource routes go under `packages/db/src/routes/` and are mounted in `server.ts`.
