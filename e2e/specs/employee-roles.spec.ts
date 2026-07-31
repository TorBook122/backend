import { test, expect, hydrateAuthSession } from '../fixtures/business.fixture.js';
import { EmployeesPage } from '../pages/employees.page.js';
import { CalendarPage } from '../pages/calendar.page.js';
import { SettingsPage } from '../pages/settings.page.js';
import { setBusinessPro } from '../helpers/db-reset.js';
import {
  activateEmployeeViaApi,
  createEmployeeRoleViaApi,
  createEmployeeViaApi,
  deleteEmployeeRoleViaApi,
  getEmployeeContextViaApi,
  patchBusinessViaApi,
  seedProBusinessWithEmployee,
} from '../helpers/employee-factory.js';
import { seedOwnerWithBusiness } from '../helpers/seed-via-api.js';

test.describe('employee roles and permissions', () => {
  test('owner can create a role and employee from the employees page', async ({ page, seedBusiness }) => {
    const seeded = await seedBusiness({ completeOnboarding: true });
    await setBusinessPro(seeded.business.id);

    await hydrateAuthSession(page, seeded.owner.accessToken);
    const employeesPage = new EmployeesPage(page);
    await employeesPage.goto();
    await employeesPage.waitForLoaded();

    await expect(employeesPage.heading()).toBeVisible();
    await expect(employeesPage.rolesPanelHeading()).toBeVisible();

    await employeesPage.roleNameInput().fill('קבלה');
    await employeesPage.permissionCheckbox('צפייה ברשימת התורים הקרובים').check();
    await employeesPage.addRoleButton().click();
    await expect(page.getByRole('status').filter({ hasText: 'התפקיד נוצר' })).toBeVisible();
    await expect(page.getByText('קבלה')).toBeVisible();
    await expect(page.getByText('1 הרשאות')).toBeVisible();

    await employeesPage.addEmployeeButton().click();
    await page.getByLabel('שם מלא').fill('דנה עובדת');
    await page.getByLabel('טלפון').fill(`050${String(Date.now()).slice(-7)}`);
    await page.getByLabel('אימייל').fill(`employee-ui-${Date.now()}@e2e.test`);
    await employeesPage.employeeRoleSelect().selectOption({ label: 'קבלה (1 הרשאות)' });
    await employeesPage.saveEmployeeButton().click();

    await expect(page.getByRole('heading', { name: 'העובד נוסף — קישור הזמנה' })).toBeVisible();
    await expect(employeesPage.employeeRow('דנה עובדת')).toBeVisible();
  });

  test('GET /employees/me returns permissions from assigned role', async () => {
    const seeded = await seedProBusinessWithEmployee([
      'VIEW_APPOINTMENTS',
      'EDIT_BUSINESS_PROFILE',
    ]);

    const context = await getEmployeeContextViaApi(seeded.employee.accessToken);

    expect(context.businessId).toBe(seeded.business.id);
    expect(context.businessName).toBe(seeded.business.name);
    expect(context.roleName).toBe('תפקיד בדיקה');
    expect(context.permissions).toEqual(
      expect.arrayContaining(['VIEW_APPOINTMENTS', 'EDIT_BUSINESS_PROFILE']),
    );
    expect(context.permissions).toHaveLength(2);
  });

  test('employee with VIEW_APPOINTMENTS sees calendar in navigation', async ({ page }) => {
    const seeded = await seedProBusinessWithEmployee(['VIEW_APPOINTMENTS']);

    await hydrateAuthSession(page, seeded.employee.accessToken);
    await page.goto('/browse');

    await expect(page.getByRole('link', { name: 'יומן בעל עסק' })).toBeVisible();

    const calendarPage = new CalendarPage(page);
    await calendarPage.goto();
    await expect(calendarPage.heading()).toBeVisible();
  });

  test('employee without VIEW_APPOINTMENTS does not see calendar in navigation', async ({ page }) => {
    const seeded = await seedProBusinessWithEmployee(['EDIT_BUSINESS_PROFILE']);

    await hydrateAuthSession(page, seeded.employee.accessToken);
    await page.goto('/browse');

    await expect(page.getByRole('link', { name: 'יומן בעל עסק' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'לוח בקרה' })).toHaveCount(0);
  });

  test('employee with settings permissions can access settings page', async ({ page }) => {
    const seeded = await seedProBusinessWithEmployee(['EDIT_BUSINESS_PROFILE']);

    await hydrateAuthSession(page, seeded.employee.accessToken);
    await page.goto('/browse');

    await expect(page.getByRole('link', { name: 'הגדרות עסק' })).toBeVisible();

    const settingsPage = new SettingsPage(page);
    await settingsPage.goto();
    await page.waitForResponse(
      (response) => response.url().includes('/businesses/mine/managed') && response.ok(),
    );
    await settingsPage.waitForLoaded();
    await expect(page.getByRole('heading', { name: 'פרטי העסק' })).toBeVisible({ timeout: 15_000 });
  });

  test('employee without settings permissions is redirected away from settings', async ({ page }) => {
    const seeded = await seedProBusinessWithEmployee(['VIEW_APPOINTMENTS']);

    await hydrateAuthSession(page, seeded.employee.accessToken);
    await page.goto('/settings');

    await expect(page).toHaveURL(/\/browse/, { timeout: 15_000 });
    await expect(page.getByRole('link', { name: 'הגדרות עסק' })).toHaveCount(0);
  });

  test('employee is blocked from owner employees page', async ({ page }) => {
    const seeded = await seedProBusinessWithEmployee(['VIEW_APPOINTMENTS']);

    await hydrateAuthSession(page, seeded.employee.accessToken);
    await page.goto('/employees');

    await expect(page).toHaveURL(/\/browse/);
  });

  test('deleting a role with assigned employees returns 409', async () => {
    const seeded = await seedProBusinessWithEmployee(['VIEW_APPOINTMENTS']);

    const result = await deleteEmployeeRoleViaApi(seeded.owner, seeded.role.id);

    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({
      success: false,
      error: { code: 'ROLE_HAS_EMPLOYEES' },
    });
  });

  test('owner UI shows error when deleting role with assigned employees', async ({ page }) => {
    const seeded = await seedProBusinessWithEmployee(['VIEW_APPOINTMENTS'], {
      roleName: 'תפקיד משויך',
    });

    await hydrateAuthSession(page, seeded.owner.accessToken);
    const employeesPage = new EmployeesPage(page);
    await employeesPage.goto();
    await employeesPage.waitForLoaded();

    page.once('dialog', (dialog) => dialog.accept());
    await employeesPage.deleteRoleButton('תפקיד משויך').click();

    await expect(
      page.getByRole('status').filter({ hasText: 'לא ניתן למחוק תפקיד עם עובדים משויכים' }),
    ).toBeVisible();
  });

  test('employee without business edit permission gets 403 from API', async () => {
    const seeded = await seedProBusinessWithEmployee(['VIEW_APPOINTMENTS']);

    const result = await patchBusinessViaApi(seeded.employee.accessToken, seeded.business.id, {
      notes: 'ניסיון עריכה ללא הרשאה',
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
    expect(result.body).toMatchObject({
      success: false,
      error: { code: 'PERMISSION_DENIED' },
    });
  });

  test('owner can delete unused role from employees page', async ({ page, seedBusiness }) => {
    const seeded = await seedBusiness({ completeOnboarding: true });
    await setBusinessPro(seeded.business.id);

    const role = await createEmployeeRoleViaApi(
      seeded.owner,
      seeded.business.id,
      'תפקיד למחיקה',
      ['VIEW_APPOINTMENTS'],
    );

    await hydrateAuthSession(page, seeded.owner.accessToken);
    const employeesPage = new EmployeesPage(page);
    await employeesPage.goto();
    await employeesPage.waitForLoaded();

    await expect(page.getByText('תפקיד למחיקה')).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept());
    await employeesPage.deleteRoleButton('תפקיד למחיקה').click();

    await expect(page.getByRole('status').filter({ hasText: 'התפקיד נמחק' })).toBeVisible();
    await expect(page.getByText('תפקיד למחיקה')).toHaveCount(0);

    const deleteAgain = await deleteEmployeeRoleViaApi(seeded.owner, role.id);
    expect(deleteAgain.status).toBe(404);
  });

  test('employee invite activation creates an active employee account', async () => {
    const seeded = await seedOwnerWithBusiness({ completeOnboarding: true });
    await setBusinessPro(seeded.business.id);

    const role = await createEmployeeRoleViaApi(
      seeded.owner,
      seeded.business.id,
      'תפקיד הפעלה',
      ['VIEW_APPOINTMENTS'],
    );

    const employeeRecord = await createEmployeeViaApi(
      seeded.owner,
      seeded.business.id,
      role.id,
      { name: 'עובד מופעל' },
    );

    const employee = await activateEmployeeViaApi(employeeRecord.inviteUrl);
    const context = await getEmployeeContextViaApi(employee.accessToken);

    expect(context.roleName).toBe('תפקיד הפעלה');
    expect(context.permissions).toContain('VIEW_APPOINTMENTS');
  });
});
