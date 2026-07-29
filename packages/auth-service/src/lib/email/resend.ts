export function isResendLogOnlyMode(): boolean {
  return !process.env.RESEND_API_KEY?.trim();
}

/**
 * Log-only mode exists purely so local development doesn't require a real email provider.
 * It must never silently activate in production — printing a live password reset/change
 * code to application logs (which are typically readable by more people, and retained
 * longer, than the database) would be a credential leak.
 */
function assertLogOnlyModeAllowed(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'RESEND_API_KEY is required in production — refusing to log a plaintext verification code',
    );
  }
}

export async function sendPasswordResetCode(to: string, code: string): Promise<void> {
  const subject = 'איפוס סיסמה ב-KvaTor';
  const text = `קוד איפוס הסיסמה שלך ב-KvaTor: ${code}`;

  if (isResendLogOnlyMode()) {
    assertLogOnlyModeAllowed();
    // eslint-disable-next-line no-console
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
    assertLogOnlyModeAllowed();
    // eslint-disable-next-line no-console
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
