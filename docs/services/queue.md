# torbook-queue (@torbook/queue)

## Role

Async background jobs via AWS SQS. One package, two Render deployments:

- **Enqueue service** — HTTP endpoint to submit jobs
- **Worker** — background process that polls SQS and executes jobs

Job types and queue logic: [`packages/queue/src/lib/queue.ts`](../../packages/queue/src/lib/queue.ts).

## Ports and Render config

### Enqueue service

| Setting | Value |
|---------|-------|
| Port | 3006 |
| Render service | `torbook-queue-enqueue` |
| Type | pserv (private) |
| Plan | starter |
| Health check | `/health` |
| Start command | `node packages/queue/dist/index.js` |

### Worker

| Setting | Value |
|---------|-------|
| Render service | `torbook-queue-worker` |
| Type | worker (no HTTP) |
| Plan | starter |
| Start command | `node packages/queue/dist/worker.js` |

Both use `packages/queue/Dockerfile`.

## Environment variables

### torbook-queue-enqueue

| Variable | Required | Source |
|----------|----------|--------|
| `INTERNAL_SERVICE_SECRET` | yes | manual (`sync: false`) |
| `AWS_REGION` | yes | manual |
| `AWS_SQS_QUEUE_URL` | yes | manual — empty enables log-only mode |
| `PORT` | no | defaults to 3006 |

### torbook-queue-worker

| Variable | Required | Source |
|----------|----------|--------|
| `INTERNAL_SERVICE_SECRET` | yes | manual (`sync: false`) |
| `AWS_REGION` | yes | manual |
| `AWS_SQS_QUEUE_URL` | yes | manual — empty enables log-only mode |
| `DB_SERVICE_URL` | yes | auto (`fromService: torbook-db`) |
| `NOTIFICATIONS_SERVICE_URL` | yes | auto (`fromService: torbook-notifications`) |

See [`.env.example`](../../.env.example) for local placeholders.

## Internal endpoints (summary)

Enqueue service only — worker has no HTTP.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/jobs` | Enqueue a job (returns 202) |

### Job types

| Type | Description |
|------|-------------|
| `REMINDER` | Send appointment reminder push notification |
| `CANCELLATION` | Send appointment cancellation push notification |

Job payload: `{ type, appointmentId, scheduledAt }`. SQS delay is calculated from `scheduledAt`.

## Dependencies

**Enqueue calls:** AWS SQS

**Worker calls:** AWS SQS, `torbook-db`, `torbook-notifications`

**Called by:** `torbook-api` (via enqueue service)

## Local development

Both services start with `pnpm docker:up`. Set `AWS_SQS_QUEUE_URL` to empty or a placeholder account ID (`000000000000`) for **log-only mode**:

- Enqueue logs jobs to stdout instead of sending to SQS
- Worker does not start polling in log-only mode

## Code conventions / change guidelines

- New job types are defined in `QueueJobType` in `packages/queue/src/lib/queue.ts`.
- Add a handler in `packages/queue/src/handlers.ts` and wire it in `processJob`.
- Handlers call db and notifications via HTTP client — no direct database access.
- SQS message delay is capped at 900 seconds (15 minutes) by AWS.
- Keep enqueue idempotent where possible; the worker should handle duplicate delivery gracefully.
