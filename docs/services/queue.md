# @torbook/queue

## Role

Async background jobs via AWS SQS. One package, two roles inside the unified process:

- **Enqueue API** — HTTP endpoint on loopback to submit jobs
- **Worker** — background process that polls SQS and sends FCM push notifications or WhatsApp messages

Job types and handlers: [`packages/queue/src/handlers.ts`](../../packages/queue/src/handlers.ts). FCM delivery lives in [`packages/queue/src/lib/notifications/`](../../packages/queue/src/lib/notifications/); WhatsApp delivery in [`packages/queue/src/lib/notifications/whatsapp.ts`](../../packages/queue/src/lib/notifications/whatsapp.ts).

## Ports

| Component | Port | Health check |
|-----------|------|--------------|
| Enqueue API | 3004 (internal loopback) | `GET /health` |
| SQS worker | — (no HTTP) | — |

## Environment variables

All variables are set on the unified `torbook` service (Render) or `.env` locally:

| Variable | Required | Notes |
|----------|----------|-------|
| `INTERNAL_SERVICE_SECRET` | yes | |
| `AWS_REGION` | yes | |
| `AWS_SQS_QUEUE_URL` | yes | empty or placeholder enables log-only mode |
| `FCM_SERVICE_ACCOUNT_JSON` | yes | Firebase service account JSON string |
| `TWILIO_ACCOUNT_SID` | no | Twilio account SID; empty enables WhatsApp log-only mode |
| `TWILIO_AUTH_TOKEN` | no | Twilio auth token |
| `TWILIO_WHATSAPP_FROM` | no | Sender, e.g. `whatsapp:+14155238886` (sandbox) or production number |
| `TWILIO_WHATSAPP_CONTENT_SID` | no | Optional approved template SID (`HX…`) for messages outside the 24h window |
| `DB_SERVICE_URL` | auto | set by monolith on loopback |

See [`.env.example`](../../.env.example) for local placeholders.

## Internal endpoints (summary)

Enqueue API only — worker has no HTTP.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/internal/v1/jobs` | Enqueue a job (returns 202) |

### Job types

| Type | Description |
|------|-------------|
| `REMINDER` | Send appointment reminder push notification |
| `CANCELLATION` | Send appointment cancellation push notification |
| `BOOKING_CONFIRMATION` | Send WhatsApp booking confirmation to the customer |

## Dependencies

**Enqueue calls:** AWS SQS (or stdout in log-only mode)

**Worker calls:** AWS SQS, `@torbook/db` (FCM token lookup), Firebase FCM, Twilio WhatsApp

**Called by:** `@torbook/booking-service`

## Local development

Started with `pnpm dev:all` or `pnpm docker:up`. Set `AWS_SQS_QUEUE_URL` to empty or a placeholder account ID (`000000000000`) for **log-only mode**:

- Enqueue logs jobs to stdout instead of sending to SQS
- Worker does not start polling in log-only mode
- **Due jobs** (`scheduledAt` ≈ now, e.g. `BOOKING_CONFIRMATION`) run **inline** on enqueue so WhatsApp still sends without real SQS
- Delayed jobs (e.g. future `REMINDER`) are logged and skipped until a real SQS queue is configured
- WhatsApp delivery itself logs to stdout when `TWILIO_*` vars are unset (same pattern as FCM log-only)

## Code conventions / change guidelines

- New job types are defined in `QueueJobType` in `@torbook/shared`.
- Add a handler in `packages/queue/src/handlers.ts` and wire it in `processJob`.
- Push delivery uses `@torbook/db` for token lookup — no separate notifications service.
- SQS message delay is capped at 900 seconds (15 minutes) by AWS.
- Keep enqueue idempotent where possible; the worker should handle duplicate delivery gracefully.
