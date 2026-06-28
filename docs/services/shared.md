# torbook-shared (@torbook/shared)

## Role

PII encryption, hashing, and normalization microservice. Also exports shared library code (types, HTTP client, internal auth middleware) used by all other packages. Server entry: [`packages/shared/src/server.ts`](../../packages/shared/src/server.ts).

## Ports and Render config

| Setting | Value |
|---------|-------|
| Port | 3002 |
| Render service | `torbook-shared` |
| Type | pserv (private) |
| Plan | starter |
| Health check | `/health` |
| Dockerfile | `packages/shared/Dockerfile` |

## Environment variables

| Variable | Required | Source |
|----------|----------|--------|
| `INTERNAL_SERVICE_SECRET` | yes | manual (`sync: false`) |
| `AES_ENCRYPTION_KEY` | yes | manual — 64 hex chars (32 bytes) |
| `PORT` | no | defaults to 3002 |
| `NODE_ENV` | no | `production` on Render |

See [`.env.example`](../../.env.example) for local placeholders.

## Internal endpoints (summary)

All endpoints require `X-Internal-Key` header.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/crypto/encrypt` | Encrypt PII plaintext |
| `POST` | `/crypto/decrypt` | Decrypt PII ciphertext |
| `POST` | `/crypto/hash` | One-way hash for lookup |
| `POST` | `/normalize/phone` | Normalize phone number |
| `POST` | `/normalize/email` | Normalize email address |

## Dependencies

**Calls:** none (stateless crypto service)

**Called by:** `torbook-api`, `torbook-db` (via HTTP client)

Also imported as a library by every package for shared types and `@torbook/shared/server/internal-auth`.

## Local development

Started automatically by `pnpm docker:up` on port 3002 (internal only). For host dev, run the package dev script after `pnpm docker:infra`.

## Code conventions / change guidelines

- Server endpoint changes affect **all services** that call shared via HTTP.
- Library exports (types, utils, middleware) are consumed at build time — changes require rebuilding dependent packages.
- Never log plaintext PII. Encryption uses AES-256-GCM via `AES_ENCRYPTION_KEY`.
- Internal auth middleware lives at `@torbook/shared/server/internal-auth` — keep `INTERNAL_SERVICE_SECRET` validation consistent.
