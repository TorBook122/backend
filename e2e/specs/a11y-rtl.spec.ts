import { AxeBuilder } from '@axe-core/playwright';
import { test, expect, hydrateAuthSession } from '../fixtures/business.fixture.js';
import { LoginPage } from '../pages/login.page.js';
import { BookingPage } from '../pages/booking.page.js';
import { DashboardPage } from '../pages/dashboard.page.js';

async function expectNoCriticalViolations(page: import('@playwright/test').Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  const critical = results.violations.filter((violation) => violation.impact === 'critical');
  expect(critical).toEqual([]);
}

test.describe('accessibility and RTL', () => {
  test('root document uses RTL direction', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'he');
  });

  test('login form exposes Hebrew labels', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await expect(page.getByText('אימייל או טלפון')).toBeVisible();
    await expect(page.getByText('סיסמה')).toBeVisible();
    await expect(page.getByPlaceholder('youremail@example.com')).toBeVisible();
  });

  test('axe reports no critical issues on login, booking, and dashboard', async ({
    page,
    seedBusiness,
  }) => {
    const { owner, business, bookableDate } = await seedBusiness();

    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await expectNoCriticalViolations(page);

    await hydrateAuthSession(page, owner.accessToken);
    const bookingPage = new BookingPage(page);
    await bookingPage.goto(business.slug);
    await bookingPage.selectService('תספורת');
    await bookingPage.pickDate(bookableDate);
    await expectNoCriticalViolations(page);

    const dashboardPage = new DashboardPage(page);
    await dashboardPage.goto();
    await expectNoCriticalViolations(page);
  });

  test('booking flow supports keyboard navigation', async ({ page, seedBusiness }) => {
    const { owner, business, bookableDate } = await seedBusiness();

    await hydrateAuthSession(page, owner.accessToken);
    const bookingPage = new BookingPage(page);
    await bookingPage.goto(business.slug);

    const serviceButton = page.getByRole('button', { name: /תספורת/ });
    await serviceButton.focus();
    await expect(serviceButton).toBeFocused();
    await page.keyboard.press('Enter');

    const dateInput = page.locator('input[type="date"]');
    await expect(dateInput).toBeVisible();
    await dateInput.focus();
    await expect(dateInput).toBeFocused();
    await dateInput.fill(bookableDate);

    const slot = page
      .getByRole('listbox', { name: 'שעות פנויות' })
      .getByRole('option')
      .first();
    await expect(slot).toBeVisible({ timeout: 15_000 });
    await slot.focus();
    await page.keyboard.press('Enter');

    const confirmButton = page.getByRole('button', { name: 'אישור הזמנה' });
    await confirmButton.focus();
    await expect(confirmButton).toBeFocused();
  });
});
