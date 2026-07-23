import type { QueueJob } from '@torbook/shared';

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
): Promise<void> {
  const to = `whatsapp:${toWhatsAppE164(toDigits)}`;
  const from = process.env.TWILIO_WHATSAPP_FROM!.trim();

  if (isWhatsAppLogOnlyMode()) {
    // eslint-disable-next-line no-console
    console.log('[WhatsApp log-only]', { to, body, contentVariables });
    return;
  }

  const twilio = await import('twilio');
  const client = twilio.default(
    process.env.TWILIO_ACCOUNT_SID!.trim(),
    process.env.TWILIO_AUTH_TOKEN!.trim(),
  );

  try {
    const contentSid = process.env.TWILIO_WHATSAPP_CONTENT_SID?.trim();
    if (contentSid) {
      const message = await client.messages.create({
        from,
        to,
        contentSid,
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

  await sendWhatsAppMessage(phone, job.body, job.data);
}
