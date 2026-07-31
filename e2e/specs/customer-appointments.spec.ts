import { test, expect, hydrateAuthSession } from '../fixtures/business.fixture.js';
import { AppointmentsPage } from '../pages/appointments.page.js';
import {
  bookAppointmentViaApi,
  registerCustomer,
} from '../helpers/seed-via-api.js';
import {
  createConfirmedAppointment,
  hoursFromNow,
} from '../helpers/appointment-factory.js';

test.describe('customer appointments', () => {
  test('list shows booked appointment', async ({ page, seedBusiness }) => {
    const { business, service, bookableDate } = await seedBusiness();
    const customer = await registerCustomer();
    await bookAppointmentViaApi(customer, business.slug, service.id, bookableDate);

    await hydrateAuthSession(page, customer.accessToken);
    const appointmentsPage = new AppointmentsPage(page);
    await appointmentsPage.goto();

    await expect(appointmentsPage.heading()).toBeVisible();
    await expect(appointmentsPage.appointmentFor(business.name)).toBeVisible();
  });

  test('cancel within window removes appointment', async ({ page, seedBusiness }) => {
    const { business, service, bookableDate } = await seedBusiness();
    const customer = await registerCustomer();
    await bookAppointmentViaApi(customer, business.slug, service.id, bookableDate);

    await hydrateAuthSession(page, customer.accessToken);
    const appointmentsPage = new AppointmentsPage(page);
    await appointmentsPage.goto();

    await appointmentsPage.cancelButton(business.name).click();
    await expect(page.getByRole('status').filter({ hasText: 'התור בוטל' })).toBeVisible();
    await expect(appointmentsPage.appointmentFor(business.name)).toHaveCount(0);
  });

  test('empty state when customer has no appointments', async ({ registerCustomer, page }) => {
    await registerCustomer();

    const appointmentsPage = new AppointmentsPage(page);
    await appointmentsPage.goto();

    await expect(appointmentsPage.emptyState()).toBeVisible();
    await expect(page.getByText('עדיין לא הזמנתם תורים. חפשו עסק והזמינו תור.')).toBeVisible();
  });

  test('late cancel shows pending owner decision after reload', async ({ page, seedBusiness }) => {
    const { business, service, owner } = await seedBusiness();
    const customer = await registerCustomer();

    await createConfirmedAppointment({
      businessId: business.id,
      customerId: customer.id,
      serviceId: service.id,
      startsAt: hoursFromNow(2),
    });

    await hydrateAuthSession(page, customer.accessToken);
    const appointmentsPage = new AppointmentsPage(page);
    await appointmentsPage.goto();

    await appointmentsPage.cancelButton(business.name).click();
    await page.getByRole('button', { name: 'כן שליחה' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'בקשת הביטול נשלחה לבעל העסק' }),
    ).toBeVisible();

    await page.reload();
    await expect(appointmentsPage.appointmentFor(business.name)).toBeVisible();
    await expect(page.getByText('ממתין לאישור בעל העסק')).toBeVisible();
    expect(owner.id).toBeTruthy();
  });
});
