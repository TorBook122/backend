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
| `TWILIO_WHATSAPP_CONTENT_SID` | no | Approved **Utility** Content Template SID (`HX…`) for booking success. Expected body: `שלום {{first_name}}, התור שלך ל{{service}} ב{{business}} בתאריך {{date}} ובשעה {{time}} נקבע בהצלחה!` (text only — no Confirm/Reschedule buttons) |
| `TWILIO_WHATSAPP_CONTENT_SID_APPOINTMENT_CONFIRM_TO_BUSINESS` | no | New booking → business owner. Meta template: `kvator_appointment_confirm_to_business`. Body: `שלום {{name}}, {{clientName}} קבע/ה תור חדש אצלך דרך -Kvator לשירות {{service}}, בתאריך {{date}} בשעה {{time}}. לפרטים נוספים היכנס/י לאפליקציה.` |
| `TWILIO_WHATSAPP_CONTENT_SID_CLIENT_CANCEL_CUSTOMER` | no | On-time client cancel → customer. Meta template: `kvator_appointment_canclled_by_user_msg_to_user`. Body: `שלום {{name}}, ביטול תור לשירות {{service}} ב{{bussinesName}} בתאריך {{date}} ובשעה {{time}} בוטל בהצלחה!` |
| `TWILIO_WHATSAPP_CONTENT_SID_CLIENT_CANCEL_BUSINESS` | no | On-time client cancel → business owner. Meta template: `kvator_appointment_canclled_by_user_msg_to_business`. Body: `שלום {{name}}, {{clientName}} ביטל את התור שלו ל{{service}} בתאריך {{date}} ובשעה {{time}}. לפרטים נוספים היכנס/י לאפליקציה.` |
| `TWILIO_WHATSAPP_CONTENT_SID_CLIENT_CANCEL_OWNER` | no | Legacy on-time client cancel → business owner. Body: `{{customer}} ביטל תור לשירות {{service}} בתאריך {{date}} ובשעה {{time}}` |
| `TWILIO_WHATSAPP_CONTENT_SID_LATE_CANCEL_CUSTOMER` | no | Late cancel request → customer. Meta template: `kvator_late_cancel_request_to_user`. Body: `שלום {{name}}, בקשתך לביטול תור ל{{service}} ב{{business}} בתאריך {{date}} בשעה {{time}} נשלחה לבעל העסק לאישור. נעדכן אותך כשתתקבל החלטה. לפרטים נוספים היכנס/י לאפליקציה.` |
| `TWILIO_WHATSAPP_CONTENT_SID_LATE_CANCEL_BUSINESS` | no | Late cancel request → business owner. Meta template: `kvator_late_cancel_request_to_business`. Body: `שלום {{name}}, {{clientName}} ביקש/ה לבטל תור ל{{service}} בתאריך {{date}} בשעה {{time}}. אנא אשר/י או דחה/י את הבקשה באפליקציה. לפרטים נוספים היכנס/י לאפליקציה.` |
| `TWILIO_WHATSAPP_CONTENT_SID_LATE_CANCEL_APPROVED_CUSTOMER` | no | Late cancel approved → customer. Meta template: `kvator_late_cancel_approved_to_user`. Body: `שלום {{name}}, בקשתך לביטול תור ל{{service}} ב{{business}} בתאריך {{date}} בשעה {{time}} אושרה על ידי בעל העסק. התור בוטל בהצלחה. לפרטים נוספים היכנס/י לאפליקציה.` |
| `TWILIO_WHATSAPP_CONTENT_SID_LATE_CANCEL_REJECTED_CUSTOMER` | no | Late cancel rejected → customer. Meta template: `kvator_late_cancel_rejected_to_user`. Body: `שלום {{name}}, בקשתך לביטול תור ל{{service}} ב{{business}} בתאריך {{date}} בשעה {{time}} נדחתה על ידי בעל העסק. התור נשאר בתוקף. לפרטים נוספים היכנס/י לאפליקציה.` |
| `TWILIO_WHATSAPP_CONTENT_SID_BUSINESS_CANCEL_CUSTOMER` | no | Business cancel → customer. Body: `התור שלך ל{{service}} בעסק {{business}} בתאריך {{date}} ובשעה {{time}} בוטל על ידי בעל העסק. לפרטים התקשר {{business_phone}}.` |
| `TWILIO_WHATSAPP_CONTENT_SID_NEW_COMMENT` | no | New public-page comment → business owner. Body: `שלום {{name}}, התקבלה תגובה חדשה בדף העסק הציבורי שלך. היכנס https://kvator.co.il כדי לצפות בה.` |
| `TWILIO_WHATSAPP_CONTENT_SID_NEGATIVE_COMMENT` | no | Negative public-page comment → business owner (in addition to `new_comment`). Body: `שלום {{name}}, המערכת זיהתה כי התגובה האחרונה שקיבלת בתאריך {{date}} לשירות {{service}} הינה שלילית. היכנס ל{{business_url}} וצפה בפרטים.` |
| `TWILIO_WHATSAPP_CONTENT_SID_PASSWORD_RESET` | no | Password reset OTP → user phone. Body: `שלום {{name}}, קוד האימות לשינוי הסיסמה הינו {{code}}. המשך יום טוב, Kvator!` |
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
| `WHATSAPP` | Send a generic WhatsApp message (cancellations, comments, etc.). `data.phone` required; optional `data.template` maps to a Content SID env var, or pass `data.contentSid` directly. Without a SID, sends free-form `body` (log-only / sandbox). |

## Dependencies

**Enqueue calls:** AWS SQS (or stdout in log-only mode)

**Worker calls:** AWS SQS, `@torbook/db` (FCM token lookup), Firebase FCM, Twilio WhatsApp

**Called by:** `@torbook/booking-service`

## Local development

Started with `pnpm dev:all` or `pnpm docker:up`. Set `AWS_SQS_QUEUE_URL` to empty or a placeholder account ID (`000000000000`) for **log-only mode**:

- Enqueue logs jobs to stdout instead of sending to SQS
- Worker does not start polling in log-only mode
- **Due jobs** (`scheduledAt` ≈ now, e.g. `BOOKING_CONFIRMATION`, `WHATSAPP`) run **inline** on enqueue so WhatsApp still sends without real SQS
- Delayed jobs (e.g. future `REMINDER`) are logged and skipped until a real SQS queue is configured
- WhatsApp delivery itself logs to stdout when `TWILIO_*` vars are unset (same pattern as FCM log-only)

## Code conventions / change guidelines

- New job types are defined in `QueueJobType` in `@torbook/shared`.
- Add a handler in `packages/queue/src/handlers.ts` and wire it in `processJob`.
- Push delivery uses `@torbook/db` for token lookup — no separate notifications service.
- SQS message delay is capped at 900 seconds (15 minutes) by AWS.
- Keep enqueue idempotent where possible; the worker should handle duplicate delivery gracefully.
