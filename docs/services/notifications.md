# torbook-notifications (@torbook/notifications)

## Role

Firebase Cloud Messaging (FCM) push notification delivery. Looks up device tokens via `torbook-db`. Server entry: [`packages/notifications/src/server.ts`](../../packages/notifications/src/server.ts).

## Ports and Render config

| Setting | Value |
|---------|-------|
| Port | 3005 |
| Render service | `torbook-notifications` |
| Type | pserv (private) |
| Plan | starter |
| Health check | `/health` |
| Dockerfile | `packages/notifications/Dockerfile` |

## Environment variables

| Variable | Required | Source |
|----------|----------|--------|
| `INTERNAL_SERVICE_SECRET` | yes | manual (`sync: false`) |
| `FCM_SERVICE_ACCOUNT_JSON` | yes | manual — Firebase service account as JSON string |
| `DB_SERVICE_URL` | yes | auto (`fromService: torbook-db`) |
| `PORT` | no | defaults to 3005 |
| `NODE_ENV` | no | `production` on Render |

See [`.env.example`](../../.env.example) for local placeholders.

## Internal endpoints (summary)

All endpoints require `X-Internal-Key` header.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/push` | Send push notification to a user (`userId`, `title`, `body`, optional `data`) |

## Dependencies

**Calls:** `torbook-db` (FCM token lookup), Firebase FCM API

**Called by:** `torbook-api` (direct push), `torbook-queue-worker` (scheduled reminders/cancellations)

## Local development

Started on port 3005 by `pnpm docker:up`. Set `FCM_SERVICE_ACCOUNT_JSON` to `{"type":"service_account"}` for **log-only mode** — notifications are logged but not sent.

Requires `torbook-db` to be running for token lookup.

## Code conventions / change guidelines

- Push delivery logic lives in `packages/notifications/src/push.ts`.
- Dev/staging log-only mode activates when `FCM_SERVICE_ACCOUNT_JSON` is a placeholder (see `.env.example`).
- The service fetches FCM tokens from db per user — do not pass device tokens directly from callers.
- Keep notification payloads small; FCM data fields must be string key-value pairs.
