# TorBook Backend — Agent Guide

## Overview

pnpm monorepo (Node 20) with six **active** packages under `packages/`. Production and local Docker run all services in a **single Node process** (`@torbook/monolith` or `pnpm dev:all`); only the gateway port is public.

| Package | Role | Loopback port (dev) |
|---------|------|---------------------|
| `@torbook/gateway` | Public HTTP gateway (CORS, CSRF, proxy) | 3001 |
| `@torbook/auth-service` | JWT, refresh tokens, auth routes | 3002 |
| `@torbook/booking-service` | Businesses, appointments, favorites | 3003 |
| `@torbook/queue` | Job enqueue API + SQS worker + FCM push | 3004 |
| `@torbook/db` | Prisma data layer (internal REST) | 3010 |
| `@torbook/shared` | PII crypto + shared library exports | 3011 |

### Legacy packages (not in build or deploy)

These directories remain in the repo from an earlier migration but are **not** part of the unified process, Docker images, or `pnpm dev:all`:

| Package | Status |
|---------|--------|
| `packages/api/` | Legacy — only `test-helpers/test-services.ts` used by e2e stack |
| `packages/auth/` | Legacy — Dockerfile only, no application code |
| `packages/notifications/` | Legacy — push logic lives in `@torbook/queue` |

Do not document or wire these as active Render services.

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
pnpm dev:all          # all 6 services on the host (needs postgres + redis)
pnpm build            # build all packages
pnpm typecheck        # typecheck all packages
pnpm test             # run all package tests
pnpm db:migrate       # run Prisma migrations locally
pnpm docker:infra     # start postgres (5433) + redis (6379) only
pnpm docker:up        # full stack via docker compose (3 running containers + migrate)
```

## Critical rules

1. **`INTERNAL_SERVICE_SECRET` must be identical** across all services. Internal calls use the `X-Internal-Key` header via `@torbook/shared/server/internal-auth`.
2. **Services communicate over HTTP on loopback** (`127.0.0.1`) inside the unified process — do not bypass with direct function calls from the gateway.
3. **Schema changes only in `packages/db`.** Run migrations with `pnpm db:migrate` locally; production runs `prisma migrate deploy` before the monolith starts.
4. **Never commit `.env`.** Reference [`.env.example`](.env.example) placeholders only.
5. **Only the gateway is public.** Do not expose other service ports to the internet.

## Docs map

| Package | Service doc |
|---------|-------------|
| `@torbook/gateway` | [`docs/services/gateway.md`](docs/services/gateway.md) |
| `@torbook/shared` | [`docs/services/shared.md`](docs/services/shared.md) |
| `@torbook/db` | [`docs/services/db.md`](docs/services/db.md) |
| `@torbook/auth-service` | [`docs/services/auth-service.md`](docs/services/auth-service.md) |
| `@torbook/booking-service` | [`docs/services/booking-service.md`](docs/services/booking-service.md) |
| `@torbook/queue` | [`docs/services/queue.md`](docs/services/queue.md) |
