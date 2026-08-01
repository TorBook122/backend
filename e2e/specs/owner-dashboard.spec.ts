import { test, expect, hydrateAuthSession } from '../fixtures/business.fixture.js';
import { DashboardPage } from '../pages/dashboard.page.js';
import { CalendarPage } from '../pages/calendar.page.js';
import { SettingsPage } from '../pages/settings.page.js';
import { createConfirmedAppointment, hoursFromNow } from '../helpers/appointment-factory.js';
import { bookAppointmentViaApi, registerCustomer } from '../helpers/seed-via-api.js';

test.describe('owner dashboard', () => {
  test('dashboard loads for owner with business', async ({ page, seedBusiness }) => {
    const { owner } = await seedBusiness();

    await hydrateAuthSession(page, owner.accessToken);
    const dashboardPage = new DashboardPage(page);
    await dashboardPage.goto();

    await expect(dashboardPage.heading()).toBeVisible();
    await expect(dashboardPage.calendarLink()).toBeVisible();
    await expect(dashboardPage.statCard('סה״כ תורים בכל הזמנים')).toBeVisible();
    await expect(dashboardPage.statCard('סה״כ תורים היום')).toBeVisible();
    await expect(dashboardPage.statCard('התור הקרוב')).toBeVisible();
    await expect(dashboardPage.statCard('שעות עבודה היום')).toBeVisible();
  });

  test('dashboard stat cards show today appointment', async ({ page, seedBusiness }) => {
    const { owner, business, service } = await seedBusiness();
    const customer = await registerCustomer({
      name: 'לקוח לוח בקרה',
      phone: '0501234567',
      email: 'dashboard-customer@example.com',
    });

    await createConfirmedAppointment({
      businessId: business.id,
      customerId: customer.id,
      serviceId: service.id,
      startsAt: hoursFromNow(2),
    });

    await hydrateAuthSession(page, owner.accessToken);
    const dashboardPage = new DashboardPage(page);
    await dashboardPage.goto();

    await expect(dashboardPage.statCard('סה״כ תורים בכל הזמנים')).toBeVisible();
    await expect(dashboardPage.statCard('התור הקרוב')).toBeVisible();
    await expect(page.getByText('לקוח לוח בקרה').first()).toBeVisible();
    await expect(page.getByText('0501234567')).toBeVisible();
    await expect(page.getByText('dashboard-customer@example.com')).toBeVisible();
    await expect(dashboardPage.todaySection()).toBeVisible();
    await expect(page.getByText(service.name).first()).toBeVisible();
  });

  test('calendar shows today appointment', async ({ page, seedBusiness }) => {
    const { owner, business, service, bookableDate } = await seedBusiness();
    const customer = await registerCustomer({ name: 'לקוח יומן' });

    // Book through the API so startsAt matches Jerusalem timezone handling in the calendar.
    await bookAppointmentViaApi(customer, business.slug, service.id, bookableDate);

    await hydrateAuthSession(page, owner.accessToken);
    const calendarPage = new CalendarPage(page);
    await calendarPage.goto();
    await expect(calendarPage.heading()).toBeVisible();

    // Advance weeks until the booked appointment is visible (bookableDate may be next week).
    const customerLabel = page.getByText('לקוח יומן');
    for (let i = 0; i < 6; i += 1) {
      if (await customerLabel.isVisible().catch(() => false)) break;
      await calendarPage.nextWeekButton().click();
      await calendarPage.waitForLoaded();
    }

    await expect(customerLabel).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(service.name).first()).toBeVisible();
  });

  test('owner can block an hour on the calendar', async ({ page, seedBusiness }) => {
    const { owner } = await seedBusiness();

    await hydrateAuthSession(page, owner.accessToken);
    const calendarPage = new CalendarPage(page);
    await calendarPage.goto();

    const emptyCell = page.locator('button[title="לחצו לפעולות"]').first();
    await emptyCell.click();
    await page.getByRole('menuitem', { name: 'חסימת שעה ידנית' }).click();

    await expect(calendarPage.heading()).toBeVisible();
  });

  test('settings shows helper when all days are inactive', async ({ page, seedBusiness }) => {
    const { owner } = await seedBusiness();

    await hydrateAuthSession(page, owner.accessToken);
    const settingsPage = new SettingsPage(page);
    await settingsPage.goto();
    await settingsPage.waitForLoaded();

    await settingsPage.deactivateAllDays();
    await expect(settingsPage.breaksHelperText()).toBeVisible();
  });
});
