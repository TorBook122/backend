import type { BrowserContext, Page } from '@playwright/test';

export async function setAccessTokenCookie(
  context: BrowserContext,
  accessToken: string,
): Promise<void> {
  await context.addCookies([
    {
      name: 'torbook_access',
      value: accessToken,
      url: 'http://localhost:3000',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

/** Dismisses the missing-contact modal if it appears after auth hydration. */
export async function dismissMissingContactModal(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'הודעה' });
  try {
    await dialog.waitFor({ state: 'visible', timeout: 2_000 });
  } catch {
    return;
  }

  const later = dialog.getByRole('button', { name: 'אחר כך' });
  if (await later.isVisible().catch(() => false)) {
    await later.click();
  } else {
    await dialog.getByRole('button', { name: 'סגירה' }).click();
  }
  await dialog.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => undefined);
}

/** Loads a protected page so the client hydrates session state from the HttpOnly cookie. */
export async function hydrateAuthSession(page: Page, accessToken: string): Promise<void> {
  await setAccessTokenCookie(page.context(), accessToken);
  await page.goto('/my-appointments');
  await page.waitForURL('**/my-appointments');
  await dismissMissingContactModal(page);
}

export async function getAccessTokenCookie(page: Page): Promise<string | undefined> {
  const cookies = await page.context().cookies('http://localhost:3000');
  return cookies.find((cookie) => cookie.name === 'torbook_access')?.value;
}
