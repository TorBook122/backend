import type { QueueJob } from '@torbook/shared';

const WHATSAPP_TEMPLATE_ENV_KEYS: Record<string, string> = {
  appointment_confirm_to_business: 'TWILIO_WHATSAPP_CONTENT_SID_APPOINTMENT_CONFIRM_TO_BUSINESS',
  client_cancel_business: 'TWILIO_WHATSAPP_CONTENT_SID_CLIENT_CANCEL_BUSINESS',
  client_cancel_customer: 'TWILIO_WHATSAPP_CONTENT_SID_CLIENT_CANCEL_CUSTOMER',
  client_cancel_owner: 'TWILIO_WHATSAPP_CONTENT_SID_CLIENT_CANCEL_OWNER',
  late_cancel_approved_customer: 'TWILIO_WHATSAPP_CONTENT_SID_LATE_CANCEL_APPROVED_CUSTOMER',
  late_cancel_business: 'TWILIO_WHATSAPP_CONTENT_SID_LATE_CANCEL_BUSINESS',
  late_cancel_customer: 'TWILIO_WHATSAPP_CONTENT_SID_LATE_CANCEL_CUSTOMER',
  late_cancel_rejected_customer: 'TWILIO_WHATSAPP_CONTENT_SID_LATE_CANCEL_REJECTED_CUSTOMER',
  business_cancel_customer: 'TWILIO_WHATSAPP_CONTENT_SID_BUSINESS_CANCEL_CUSTOMER',
  new_comment: 'TWILIO_WHATSAPP_CONTENT_SID_NEW_COMMENT',
  password_reset: 'TWILIO_WHATSAPP_CONTENT_SID_PASSWORD_RESET',
};

const WHATSAPP_JOB_DATA_RESERVED_KEYS = new Set([
  'phone',
  'contentSid',
  'template',
  'type',
  'appointmentId',
  'businessSlug',
]);

function resolveContentSid(contentSid?: string, template?: string): string | undefined {
  if (contentSid?.trim()) return contentSid.trim();
  if (template?.trim()) {
    const envKey = WHATSAPP_TEMPLATE_ENV_KEYS[template.trim()];
    if (envKey) return process.env[envKey]?.trim() || undefined;
  }
  return undefined;
}

export function isWhatsAppLogOnlyMode(): boolean {
  return (
    !process.env.TWILIO_ACCOUNT_SID?.trim() ||
    !process.env.TWILIO_AUTH_TOKEN?.trim() ||
    !process.env.TWILIO_WHATSAPP_FROM?.trim()
  );
}

export function toWhatsAppE164(digits: string): string {
  const normalized = digits.replace(/\D/g, '');
  if (normalized.startsWith('972')) return `+${normalized}`;
  if (normalized.startsWith('0')) return `+972${normalized.slice(1)}`;
  return `+${normalized}`;
}

export async function sendWhatsAppMessage(
  toDigits: string,
  body: string,
  contentVariables?: Record<string, string>,
  contentSid?: string,
): Promise<void> {
  const to = `whatsapp:${toWhatsAppE164(toDigits)}`;
  const from = process.env.TWILIO_WHATSAPP_FROM!.trim();

  if (isWhatsAppLogOnlyMode()) {
    // eslint-disable-next-line no-console
    console.log('[WhatsApp log-only]', { to, body, contentVariables, contentSid });
    return;
  }

  const twilio = await import('twilio');
  const client = twilio.default(
    process.env.TWILIO_ACCOUNT_SID!.trim(),
    process.env.TWILIO_AUTH_TOKEN!.trim(),
  );

  try {
    const sid = contentSid?.trim();
    if (sid) {
      const message = await client.messages.create({
        from,
        to,
        contentSid: sid,
        contentVariables: JSON.stringify(contentVariables ?? {}),
      });
      // eslint-disable-next-line no-console
      console.log('[WhatsApp] sent', { sid: message.sid, status: message.status, to });
      return;
    }

    const message = await client.messages.create({ from, to, body });
    // eslint-disable-next-line no-console
    console.log('[WhatsApp] sent', { sid: message.sid, status: message.status, to });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[WhatsApp] send failed', { to, from, error });
    throw error;
  }
}

export async function sendBookingConfirmationWhatsApp(job: QueueJob): Promise<void> {
  const phone = job.data.phone;
  if (!phone) {
    // eslint-disable-next-line no-console
    console.warn('[WhatsApp] missing phone in BOOKING_CONFIRMATION job data');
    return;
  }

  // Named template placeholders for booking-success Utility template.
  const contentVariables: Record<string, string> = {};
  for (const key of ['first_name', 'service', 'business', 'date', 'time'] as const) {
    const value = job.data[key];
    if (value) contentVariables[key] = value;
  }

  await sendWhatsAppMessage(
    phone,
    job.body,
    contentVariables,
    process.env.TWILIO_WHATSAPP_CONTENT_SID?.trim(),
  );
}

export async function sendGenericWhatsApp(job: QueueJob): Promise<void> {
  const phone = job.data.phone;
  if (!phone) {
    // eslint-disable-next-line no-console
    console.warn('[WhatsApp] missing phone in WHATSAPP job data');
    return;
  }

  const contentSid = resolveContentSid(job.data.contentSid, job.data.template);
  const contentVariables: Record<string, string> = {};
  for (const [key, value] of Object.entries(job.data)) {
    if (!WHATSAPP_JOB_DATA_RESERVED_KEYS.has(key) && value) {
      contentVariables[key] = value;
    }
  }

  await sendWhatsAppMessage(phone, job.body, contentVariables, contentSid);
}
