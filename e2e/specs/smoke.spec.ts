import { test, expect } from '../fixtures/base.fixture.js';
import { LoginPage } from '../pages/login.page.js';

test.describe('smoke', () => {
  test('landing page shows login and register links', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('link', { name: 'כניסה' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'הרשמה' })).toBeVisible();
  });

  test('api proxy health responds ok', async ({ request }) => {
    const response = await request.get('/api/v1/health');
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test('wrong password on login shows error without crashing', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('nobody@e2e.test', 'WrongPass1');

    await expect(page.getByText('אימייל או סיסמה שגויים')).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });
});
