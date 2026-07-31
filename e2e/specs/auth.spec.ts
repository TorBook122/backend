import { test, expect, getAccessTokenCookie } from '../fixtures/auth.fixture.js';
import { uniqueTestUser } from '../helpers/credentials.js';
import { registerCustomer as registerCustomerViaApi } from '../helpers/seed-via-api.js';

test.describe('auth', () => {
  test('register customer redirects to my-appointments', async ({ registerPage, page }) => {
    const credentials = uniqueTestUser('customer');
    await registerPage.goto();
    await registerPage.registerCustomer(credentials);

    await expect(page).toHaveURL(/\/my-appointments/);
    await expect(page.getByRole('heading', { name: 'התורים שלי' })).toBeVisible();
  });

  test('register owner redirects to setup step 1', async ({ registerPage, page }) => {
    const credentials = uniqueTestUser('owner');
    await registerPage.goto();
    await registerPage.registerOwner(credentials);

    await expect(page).toHaveURL(/\/setup\/step-1/);
    await expect(page.getByRole('heading', { name: 'פרטי העסק' })).toBeVisible();
  });

  test('login success sets access cookie', async ({ page, loginPage }) => {
    const credentials = uniqueTestUser('customer');
    await registerCustomerViaApi(credentials);

    await loginPage.goto();
    await loginPage.login(credentials.email, credentials.password);
    await page.waitForURL('**/my-appointments');

    const token = await getAccessTokenCookie(page);
    expect(token).toBeTruthy();
  });

  test('wrong password shows UI error', async ({ page, loginPage }) => {
    const credentials = uniqueTestUser('customer');
    await registerCustomerViaApi(credentials);

    await loginPage.goto();
    await loginPage.login(credentials.email, 'WrongPass1');

    await expect(page.getByText('אימייל או סיסמה שגויים')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('logout clears session and redirects to login', async ({ page, loginPage }) => {
    const credentials = uniqueTestUser('customer');
    await registerCustomerViaApi(credentials);

    await loginPage.goto();
    await loginPage.login(credentials.email, credentials.password);
    await page.waitForURL('**/my-appointments');

    await page.getByRole('button', { name: 'יציאה מהמערכת' }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });

    const token = await getAccessTokenCookie(page);
    expect(token).toBeFalsy();
  });

  test('duplicate phone shows UI error on register', async ({ registerPage, page }) => {
    const credentials = uniqueTestUser('customer');
    await registerCustomerViaApi(credentials);

    await registerPage.goto();
    await registerPage.registerCustomer({
      ...credentials,
      email: `other-${Date.now()}@e2e.test`,
    });

    await expect(page.getByText('מספר טלפון כבר רשום. נסה להתחבר.')).toBeVisible();
  });

  test('logged-in user can access protected route after login', async ({ page, loginPage }) => {
    const credentials = uniqueTestUser('customer');
    await registerCustomerViaApi(credentials);

    await loginPage.goto();
    await loginPage.login(credentials.email, credentials.password);
    await page.waitForURL('**/my-appointments');

    await page.goto('/browse');
    await expect(page).toHaveURL(/\/browse/);
    await expect(page.getByRole('heading', { name: 'חיפוש עסקים' })).toBeVisible();
  });
});
