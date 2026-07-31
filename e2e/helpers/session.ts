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
      sameSite: 'Lax',
    },
  ]);
}

/** Loads a protected page so the client hydrates in-memory auth from the cookie. */
export async function hydrateAuthSession(page: Page, accessToken: string): Promise<void> {
  await setAccessTokenCookie(page.context(), accessToken);
  await page.goto('/my-appointments');
  await page.waitForURL('**/my-appointments');
}

export async function getAccessTokenCookie(page: Page): Promise<string | undefined> {
  const cookies = await page.context().cookies('http://localhost:3000');
  return cookies.find((cookie) => cookie.name === 'torbook_access')?.value;
}
