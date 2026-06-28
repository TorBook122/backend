# TorBook Backend — Agent Guide

## Overview

pnpm monorepo (Node 20) with six packages under `packages/`. Only **`@torbook/api`** is public-facing; all other services are private and require internal authentication.

| Package | Render service | Port |
|---------|----------------|------|
| `@torbook/api` | `torbook-api` | 3001 |
| `@torbook/shared` | `torbook-shared` | 3002 |
| `@torbook/db` | `torbook-db` | 3003 |
| `@torbook/auth` | `torbook-auth` | 3004 |
| `@torbook/notifications` | `torbook-notifications` | 3005 |
| `@torbook/queue` | `torbook-queue-enqueue` / `torbook-queue-worker` | 3006 / — |

## Read first

- **Deployment & architecture:** [`docs/DEPLOY.md`](docs/DEPLOY.md)
- **Per-service details:** [`docs/services/`](docs/services/)
- **Render config (authoritative):** [`render.yaml`](render.yaml)
- **Local wiring (authoritative):** [`docker-compose.yml`](docker-compose.yml)
- **Env placeholders:** [`.env.example`](.env.example)

## Commands

Run from the `backend/` directory:

```bash
pnpm install          # install all workspace dependencies
pnpm dev              # host dev — api only (needs other services running)
pnpm build            # build all packages
pnpm typecheck        # typecheck all packages
pnpm test             # run all package tests
pnpm db:migrate       # run Prisma migrations locally
pnpm docker:infra     # start postgres (5433) + redis (6379) only
pnpm docker:up        # full stack via docker compose (profile app)
```

## Critical rules

1. **`INTERNAL_SERVICE_SECRET` must be identical** on every service. Internal calls use the `X-Internal-Key` header via `@torbook/shared/server/internal-auth`.
2. **The API cannot run alone.** Login, register, and most routes call private services (`shared`, `db`, `auth`, etc.). See [`docs/DEPLOY.md`](docs/DEPLOY.md).
3. **Schema changes only in `packages/db`.** Run migrations with `pnpm db:migrate` locally; production runs `prisma migrate deploy` on `torbook-db` startup.
4. **Never commit `.env`.** Reference [`.env.example`](.env.example) placeholders only.
5. **Only `torbook-api` is public.** Do not expose other services to the internet.

## Docs map

| Package | Service doc | Render service |
|---------|-------------|----------------|
| `@torbook/api` | [`docs/services/api.md`](docs/services/api.md) | `torbook-api` |
| `@torbook/shared` | [`docs/services/shared.md`](docs/services/shared.md) | `torbook-shared` |
| `@torbook/db` | [`docs/services/db.md`](docs/services/db.md) | `torbook-db` |
| `@torbook/auth` | [`docs/services/auth.md`](docs/services/auth.md) | `torbook-auth` |
| `@torbook/notifications` | [`docs/services/notifications.md`](docs/services/notifications.md) | `torbook-notifications` |
| `@torbook/queue` | [`docs/services/queue.md`](docs/services/queue.md) | `torbook-queue-enqueue`, `torbook-queue-worker` |
