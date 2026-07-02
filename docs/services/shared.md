# torbook-shared (@torbook/shared)

## Role

PII encryption, hashing, and normalization module. Also exports shared library code (types, HTTP client, internal auth middleware) used by all other packages. Server entry: [`packages/shared/src/server.ts`](../../packages/shared/src/server.ts).

Runs as an **internal HTTP module** on loopback inside the unified process (port 3011 in dev/Docker).

## Ports

| Setting | Value |
|---------|-------|
| Port | 3011 (internal loopback) |
| Health check | `/health` |

## Environment variables

| Variable | Required | Notes |
|----------|----------|-------|
| `INTERNAL_SERVICE_SECRET` | yes | |
| `AES_ENCRYPTION_KEY` | yes | 64 hex chars (32 bytes) |
| `PORT` | no | set by monolith on loopback |

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

**Calls:** none (stateless crypto module)

**Called by:** `@torbook/auth-service`, `@torbook/booking-service`, `@torbook/db` (via HTTP client)

Also imported as a library by every package for shared types and `@torbook/shared/server/internal-auth`.

## Code conventions / change guidelines

- Server endpoint changes affect **all modules** that call shared via HTTP.
- Library exports (types, utils, middleware) are consumed at build time — changes require rebuilding dependent packages.
- Never log plaintext PII. Encryption uses AES-256-GCM via `AES_ENCRYPTION_KEY`.
- Internal auth middleware lives at `@torbook/shared/server/internal-auth` — keep `INTERNAL_SERVICE_SECRET` validation consistent.
