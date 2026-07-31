import { test, expect, setAccessTokenCookie } from '../fixtures/business.fixture.js';
import { CompleteProfilePage } from '../pages/complete-profile.page.js';
import { registerCustomerNeedingPhoneCompletion } from '../helpers/seed-via-api.js';
import { uniqueTestUser } from '../helpers/credentials.js';

test.describe('complete profile', () => {
  test('user without phone is redirected from protected routes', async ({ page }) => {
    const customer = await registerCustomerNeedingPhoneCompletion();
    await setAccessTokenCookie(page.context(), customer.accessToken);

    await page.goto('/browse');
    await expect(page).toHaveURL(/\/complete-profile/);
    await expect(page.getByRole('heading', { name: 'השלמת פרופיל' })).toBeVisible();
  });

  test('completing phone redirects to my-appointments', async ({ page }) => {
    const customer = await registerCustomerNeedingPhoneCompletion();
    const phone = uniqueTestUser('customer').phone;
    await setAccessTokenCookie(page.context(), customer.accessToken);

    const completeProfilePage = new CompleteProfilePage(page);
    await completeProfilePage.goto();
    await completeProfilePage.submitPhone(phone);

    await expect(page).toHaveURL(/\/my-appointments/);
    await expect(page.getByRole('heading', { name: 'התורים שלי' })).toBeVisible();
  });

  test('guest cannot access complete-profile page', async ({ page }) => {
    await page.goto('/complete-profile');
    await expect(page).toHaveURL(/\/login/);
  });
});
