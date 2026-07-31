import { test, expect } from '../fixtures/base.fixture.js';

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
    await page.goto('/login');
    await page.getByPlaceholder('youremail@example.com').fill('nobody@e2e.test');
    await page.locator('input[type="password"]').first().fill('WrongPass1');
    await page.getByRole('button', { name: 'כניסה', exact: true }).click();

    await expect(page.getByText('אימייל או סיסמה שגויים')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});
