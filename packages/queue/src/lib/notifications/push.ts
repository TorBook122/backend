import { prisma } from '@torbook/db';

export type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

let firebaseInitialized = false;

export function isLogOnlyMode(): boolean {
  const json = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!json) return true;
  try {
    const parsed = JSON.parse(json) as { type?: string; project_id?: string };
    return parsed.type === 'service_account' && !parsed.project_id;
  } catch {
    return true;
  }
}

async function initFirebase(): Promise<boolean> {
  if (firebaseInitialized) return true;
  if (isLogOnlyMode()) return false;

  const { initializeApp, cert, getApps } = await import('firebase-admin/app');

  if (getApps().length === 0) {
    const serviceAccount = JSON.parse(process.env.FCM_SERVICE_ACCOUNT_JSON!) as Record<string, string>;
    initializeApp({ credential: cert(serviceAccount as Parameters<typeof cert>[0]) });
  }
  firebaseInitialized = true;
  return true;
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const tokens = await prisma.fcmToken.findMany({ where: { userId } });
  if (tokens.length === 0) return;

  if (isLogOnlyMode()) {
    // eslint-disable-next-line no-console
    console.log('[FCM log-only]', { userId, payload, tokenCount: tokens.length });
    return;
  }

  const ready = await initFirebase();
  if (!ready) return;

  const { getMessaging } = await import('firebase-admin/messaging');
  const messaging = getMessaging();

  const staleTokens: string[] = [];

  await Promise.all(
    tokens.map(async ({ token, id }) => {
      try {
        await messaging.send({
          token,
          notification: { title: payload.title, body: payload.body },
          data: payload.data,
          webpush: {
            notification: { title: payload.title, body: payload.body },
          },
        });
      } catch (error: unknown) {
        const code = (error as { code?: string }).code;
        if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
          staleTokens.push(id);
        }
        // eslint-disable-next-line no-console
        console.error('[FCM error]', code, token.slice(0, 20));
      }
    }),
  );

  if (staleTokens.length > 0) {
    await prisma.fcmToken.deleteMany({ where: { id: { in: staleTokens } } });
  }
}
