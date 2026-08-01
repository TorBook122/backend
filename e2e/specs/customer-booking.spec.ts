import { test, expect, setAccessTokenCookie } from '../fixtures/business.fixture.js';
import { dismissMissingContactModal } from '../helpers/session.js';
import { BookingPage } from '../pages/booking.page.js';
import { ConfirmPage } from '../pages/confirm.page.js';
import { AppointmentsPage } from '../pages/appointments.page.js';
import { uniqueTestUser } from '../helpers/credentials.js';
import { registerCustomer as registerCustomerViaApi } from '../helpers/seed-via-api.js';

test.describe('customer booking', () => {
  test('logged-in customer completes booking to confirm page', async ({ page, seedBusiness, loginPage }) => {
    const seeded = await seedBusiness();
    const customer = await registerCustomerViaApi();

    await loginPage.goto();
    await loginPage.login(customer.email, customer.password);
    await page.waitForURL('**/my-appointments');

    const booking = new BookingPage(page);
    await booking.goto(seeded.business.slug);
    await booking.bookService(seeded.service.name, seeded.bookableDate);

    await page.waitForURL(/\/confirm\?/);
    const confirm = new ConfirmPage(page);
    await expect(confirm.successHeading()).toBeVisible({ timeout: 15_000 });
    await expect(confirm.appointmentDetails()).toHaveAttribute('dateTime', /.+/);
  });

  test('guest completes booking via inline login modal', async ({ page, seedBusiness }) => {
    const seeded = await seedBusiness();
    const customer = await registerCustomerViaApi();
    const booking = new BookingPage(page);

    await booking.goto(seeded.business.slug);
    await booking.selectService(seeded.service.name);
    await booking.pickDate(seeded.bookableDate);
    await booking.pickFirstAvailableSlot();
    await booking.confirmBooking();

    await expect(page.getByRole('dialog')).toBeVisible();
    await booking.loginInModal(customer.email, customer.password);

    const confirm = new ConfirmPage(page);
    await expect(confirm.successHeading()).toBeVisible({ timeout: 15_000 });
  });

  test('guest completes booking via inline register modal', async ({ page, seedBusiness }) => {
    const seeded = await seedBusiness();
    const credentials = uniqueTestUser('customer');
    const booking = new BookingPage(page);

    await booking.goto(seeded.business.slug);
    await booking.selectService(seeded.service.name);
    await booking.pickDate(seeded.bookableDate);
    await booking.pickFirstAvailableSlot();
    await booking.confirmBooking();

    await booking.openRegisterInModal();
    await booking.registerInModal(credentials);

    const confirm = new ConfirmPage(page);
    await expect(confirm.successHeading()).toBeVisible({ timeout: 15_000 });
  });

  test('public business page shows details and book link', async ({ page, seedBusiness }) => {
    const seeded = await seedBusiness();

    await page.goto(`/${seeded.business.slug}`);
    await expect(page.getByRole('heading', { name: seeded.business.name, level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'שעות פעילות' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'שירותים' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'הזמנת תור' })).toBeVisible();
  });

  test('book page shows empty state when business has no services', async ({ page, seedBusiness }) => {
    const seeded = await seedBusiness({ withService: false, completeOnboarding: true });
    const booking = new BookingPage(page);

    await booking.goto(seeded.business.slug);
    await expect(booking.emptyState()).toBeVisible();
  });

  test('confirm page shows appointment details', async ({ page, seedBusiness }) => {
    const seeded = await seedBusiness();
    const customer = await registerCustomerViaApi();
    await setAccessTokenCookie(page.context(), customer.accessToken);

    const booking = new BookingPage(page);
    await booking.goto(seeded.business.slug);
    const time = await booking.bookService(seeded.service.name, seeded.bookableDate);

    const confirm = new ConfirmPage(page);
    await expect(confirm.successHeading()).toBeVisible();
    await expect(confirm.appointmentDetails()).toHaveAttribute(
      'dateTime',
      `${seeded.bookableDate}T${time}`,
    );
  });

  test('confirm page links to my-appointments', async ({ page, seedBusiness }) => {
    const seeded = await seedBusiness();
    const customer = await registerCustomerViaApi();
    await setAccessTokenCookie(page.context(), customer.accessToken);

    const booking = new BookingPage(page);
    await booking.goto(seeded.business.slug);
    await booking.bookService(seeded.service.name, seeded.bookableDate);

    const confirm = new ConfirmPage(page);
    await expect(confirm.successHeading()).toBeVisible({ timeout: 15_000 });
    await confirm.goToMyAppointments();
    await page.waitForURL('**/my-appointments');
    await dismissMissingContactModal(page);

    const appointments = new AppointmentsPage(page);
    await expect(appointments.heading()).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole('article', { name: new RegExp(`תור ב${seeded.business.name}`) }),
    ).toBeVisible();
  });
});
