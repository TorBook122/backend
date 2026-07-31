import { test, expect, hydrateAuthSession } from '../fixtures/business.fixture.js';
import { CalendarPage } from '../pages/calendar.page.js';
import { AppointmentsPage } from '../pages/appointments.page.js';
import {
  cancelAppointmentViaApi,
  getMyAppointmentsViaApi,
  registerCustomer,
  type SeededOwnerBusiness,
} from '../helpers/seed-via-api.js';
import {
  createConfirmedAppointment,
  todayAtHour,
} from '../helpers/appointment-factory.js';

const PENDING_CUSTOMER_NAME = 'לקוח ביטול מאוחר';

async function seedPendingLateCancel(seedBusiness: () => Promise<SeededOwnerBusiness>) {
  const { business, service, owner } = await seedBusiness();
  const customer = await registerCustomer({ name: PENDING_CUSTOMER_NAME });
  const appointment = await createConfirmedAppointment({
    businessId: business.id,
    customerId: customer.id,
    serviceId: service.id,
    startsAt: todayAtHour(10),
  });

  const cancelled = await cancelAppointmentViaApi(customer, appointment.id);
  expect(cancelled.status).toBe('PENDING_OWNER_DECISION');

  return { business, service, owner, customer, appointmentId: appointment.id };
}

test.describe('late cancel owner decision', () => {
  test('owner approves late cancel from calendar', async ({ page, seedBusiness }) => {
    const { business, owner, customer, appointmentId } = await seedPendingLateCancel(seedBusiness);

    await hydrateAuthSession(page, owner.accessToken);
    const calendarPage = new CalendarPage(page);
    await calendarPage.goto();

    await expect(calendarPage.pendingLateCancelLabel()).toBeVisible();
    await calendarPage.openAppointmentMenu(PENDING_CUSTOMER_NAME);
    await calendarPage.approveLateCancelButton().click();

    await expect(page.getByRole('status').filter({ hasText: 'בקשת הביטול אושרה' })).toBeVisible();
    await expect(calendarPage.appointmentText(PENDING_CUSTOMER_NAME)).toHaveCount(0);

    const customerAppointments = await getMyAppointmentsViaApi(customer);
    expect(customerAppointments.upcoming.find((entry) => entry.id === appointmentId)).toBeUndefined();
  });

  test('owner rejects late cancel from calendar', async ({ page, seedBusiness }) => {
    const { business, owner, customer, appointmentId } = await seedPendingLateCancel(seedBusiness);

    await hydrateAuthSession(page, owner.accessToken);
    const calendarPage = new CalendarPage(page);
    await calendarPage.goto();

    await expect(calendarPage.pendingLateCancelLabel()).toBeVisible();
    await calendarPage.openAppointmentMenu(PENDING_CUSTOMER_NAME);
    await calendarPage.rejectLateCancelButton().click();

    await expect(page.getByRole('status').filter({ hasText: 'בקשת הביטול נדחתה' })).toBeVisible();
    await expect(calendarPage.pendingLateCancelLabel()).toHaveCount(0);
    await expect(calendarPage.appointmentText(PENDING_CUSTOMER_NAME)).toBeVisible();

    const customerAppointments = await getMyAppointmentsViaApi(customer);
    const appointment = customerAppointments.upcoming.find(
      (entry) => entry.id === appointmentId,
    );
    expect(appointment?.status).toBe('CONFIRMED');

    await hydrateAuthSession(page, customer.accessToken);
    const appointmentsPage = new AppointmentsPage(page);
    await appointmentsPage.goto();
    await expect(appointmentsPage.appointmentFor(business.name)).toBeVisible();
    await expect(page.getByText('ממתין לאישור בעל העסק')).toHaveCount(0);
  });
});
