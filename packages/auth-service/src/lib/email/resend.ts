export function isResendLogOnlyMode(): boolean {
  return !process.env.RESEND_API_KEY?.trim();
}

export async function sendPasswordResetCode(to: string, code: string): Promise<void> {
  const subject = 'איפוס סיסמה ב-KvaTor';
  const text = `קוד איפוס הסיסמה שלך ב-KvaTor: ${code}`;

  if (isResendLogOnlyMode()) {
    console.log('[Resend log-only] password reset code', { to, code });
    return;
  }

  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.RESEND_FROM_EMAIL?.trim() || 'KvaTor <noreply@kvator.co.il>';

  await resend.emails.send({
    from,
    to,
    subject,
    text,
  });
}

export async function sendPasswordChangeCode(to: string, code: string): Promise<void> {
  const subject = 'אימות עדכון סיסמה ב-KvaTor';
  const text = `קוד אימות לעדכון הסיסמה שלך ב-KvaTor: ${code}`;

  if (isResendLogOnlyMode()) {
    console.log('[Resend log-only] password change code', { to, code });
    return;
  }

  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.RESEND_FROM_EMAIL?.trim() || 'KvaTor <noreply@kvator.co.il>';

  await resend.emails.send({
    from,
    to,
    subject,
    text,
  });
}
