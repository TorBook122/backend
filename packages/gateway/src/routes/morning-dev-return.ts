/**
 * Dev-only Morning checkout return bounce.
 * Morning WAF rejects localhost successUrl; after payment the browser hits this public
 * HTTPS endpoint, which redirects only to http(s)://localhost or 127.0.0.1.
 */
function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64').toString('utf8');
}

function resolveAllowedDevReturn(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;

  let decoded = raw.trim();
  try {
    decoded = decodeBase64Url(decoded);
  } catch {
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      return null;
    }
  }

  try {
    const url = new URL(decoded);
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return null;
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function morningDevReturnHtml(target: string | null): { status: number; body: string } {
  if (!target) {
    return {
      status: 400,
      body: `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"/><title>שגיאה</title></head><body><p>יעד חזרה לא תקין (מותר רק localhost בפיתוח).</p></body></html>`,
    };
  }

  const safe = escapeHtmlAttr(target);
  const jsSafe = JSON.stringify(target);
  return {
    status: 200,
    body: `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8"/>
  <meta http-equiv="refresh" content="0;url=${safe}"/>
  <title>חוזרים לפיתוח מקומי</title>
</head>
<body>
  <p>מחזירים לסביבת הפיתוח המקומית…</p>
  <p><a href="${safe}">לחצו כאן אם לא הועברתם אוטומטית</a></p>
  <script>window.location.replace(${jsSafe});</script>
</body>
</html>`,
  };
}

export function getMorningDevReturnTarget(queryTo: unknown): string | null {
  return resolveAllowedDevReturn(queryTo);
}
