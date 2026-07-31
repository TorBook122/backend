import { test, expect, setAccessTokenCookie } from '../fixtures/business.fixture.js';
import { registerCustomer, registerOwner, registerCustomerNeedingPhoneCompletion } from '../helpers/seed-via-api.js';
import { seedProBusinessWithEmployee } from '../helpers/employee-factory.js';

test.describe('middleware routing', () => {
  test('guest visiting dashboard redirects to login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?from=%2Fdashboard/);
  });

  test('guest visiting my-appointments redirects to login', async ({ page }) => {
    await page.goto('/my-appointments');
    await expect(page).toHaveURL(/\/login\?from=%2Fmy-appointments/);
  });

  test('guest visiting map redirects to login', async ({ page }) => {
    await page.goto('/map');
    await expect(page).toHaveURL(/\/login\?from=%2Fmap/);
  });

  test('guest can access public rankings page', async ({ page }) => {
    await page.goto('/rankings');
    await expect(page).toHaveURL(/\/rankings/);
    await expect(page.getByRole('heading', { name: 'דירוגים' })).toBeVisible();
  });

  test('user without phone is redirected to complete-profile', async ({ page }) => {
    const customer = await registerCustomerNeedingPhoneCompletion();
    await setAccessTokenCookie(page.context(), customer.accessToken);

    await page.goto('/favorites');
    await expect(page).toHaveURL(/\/complete-profile/);
  });

  test('customer is blocked from dashboard', async ({ page }) => {
    const customer = await registerCustomer();
    await setAccessTokenCookie(page.context(), customer.accessToken);

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/my-appointments/);
  });

  test('customer is blocked from calendar', async ({ page }) => {
    const customer = await registerCustomer();
    await setAccessTokenCookie(page.context(), customer.accessToken);

    await page.goto('/calendar');
    await expect(page).toHaveURL(/\/my-appointments/);
  });

  test('employee is blocked from employees page', async ({ page }) => {
    const seeded = await seedProBusinessWithEmployee(['VIEW_APPOINTMENTS']);
    await setAccessTokenCookie(page.context(), seeded.employee.accessToken);

    await page.goto('/employees');
    await expect(page).toHaveURL(/\/browse/);
  });

  test('employee can access calendar route', async ({ page }) => {
    const seeded = await seedProBusinessWithEmployee(['VIEW_APPOINTMENTS']);
    await setAccessTokenCookie(page.context(), seeded.employee.accessToken);

    await page.goto('/calendar');
    await expect(page).toHaveURL(/\/calendar/);
    await expect(page.getByRole('heading', { name: 'יומן' })).toBeVisible();
  });

  test('customer is blocked from settings', async ({ page }) => {
    const customer = await registerCustomer();
    await setAccessTokenCookie(page.context(), customer.accessToken);

    await page.goto('/settings');
    await expect(page).toHaveURL(/\/my-appointments/);
  });

  test('owner with incomplete onboarding is redirected from dashboard to setup', async ({
    page,
  }) => {
    const owner = await registerOwner();
    await setAccessTokenCookie(page.context(), owner.accessToken);

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/setup\/step-1/);
  });

  test('owner with completed onboarding skips setup routes', async ({ page, seedBusiness }) => {
    const seeded = await seedBusiness({ completeOnboarding: true });
    await setAccessTokenCookie(page.context(), seeded.owner.accessToken);

    await page.goto('/setup/step-1');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('logged-in user visiting login is redirected away', async ({ page, seedBusiness }) => {
    const seeded = await seedBusiness({ completeOnboarding: true });
    await setAccessTokenCookie(page.context(), seeded.owner.accessToken);

    await page.goto('/login');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('guest can access public book page', async ({ page, seedBusiness }) => {
    const seeded = await seedBusiness();
    await page.goto(`/${seeded.business.slug}/book`);

    await expect(page.getByRole('heading', { name: /הזמנת תור/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'בחירת שירות' })).toBeVisible();
  });
});
