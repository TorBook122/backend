import { test, expect } from '../fixtures/auth.fixture.js';
import { OnboardingPage } from '../pages/onboarding.page.js';
import { uniqueTestUser } from '../helpers/credentials.js';

test.describe('owner onboarding', () => {
  test.describe.configure({ timeout: 60_000 });
  test('completes steps 1 through 5 end-to-end', async ({ registerPage, page }) => {
    const credentials = uniqueTestUser('owner');
    const onboarding = new OnboardingPage(page);

    await registerPage.goto();
    await registerPage.registerOwner(credentials);
    await expect(page.getByRole('heading', { name: 'פרטי העסק' })).toBeVisible();

    await onboarding.completeAllSteps({
      businessName: `עסק E2E ${Date.now()}`,
      phone: credentials.phone,
      serviceName: 'תספורת גברים',
    });

    await expect(page.getByRole('heading', { name: 'לוח בקרה' })).toBeVisible();
  });

  test('step 1 validation requires business name and phone', async ({ registerOwner, page }) => {
    const onboarding = new OnboardingPage(page);
    await registerOwner();

    await onboarding.continueStep1();
    await expect(onboarding.toast('נא למלא שם עסק, כתובת וטלפון')).toBeVisible();
    await expect(page).toHaveURL(/\/setup\/step-1/);
  });

  test('step 2 validation requires at least one active day', async ({ registerOwner, page }) => {
    const credentials = uniqueTestUser('owner');
    const onboarding = new OnboardingPage(page);
    await registerOwner();

    await onboarding.fillStep1({
      name: `עסק ${Date.now()}`,
      phone: credentials.phone,
      category: 'ספרות',
    });
    await onboarding.continueStep1();
    await page.waitForURL('**/setup/step-2');

    await onboarding.deactivateAllDays();
    await onboarding.continueStep2();
    await expect(onboarding.toast('הפעילו לפחות יום אחד')).toBeVisible();
    await expect(page).toHaveURL(/\/setup\/step-2/);
  });

  test('step 3 validation requires at least one service', async ({ registerOwner, page }) => {
    const credentials = uniqueTestUser('owner');
    const onboarding = new OnboardingPage(page);
    await registerOwner();

    await onboarding.fillStep1({
      name: `עסק ${Date.now()}`,
      phone: credentials.phone,
      category: 'ספרות',
    });
    await onboarding.continueStep1();
    await page.waitForURL('**/setup/step-2');
    await onboarding.continueStep2();
    await page.waitForURL('**/setup/step-3');

    await onboarding.continueStep3();
    await expect(onboarding.toast('הוסיפו לפחות שירות אחד')).toBeVisible();
    await expect(page).toHaveURL(/\/setup\/step-3/);
  });

  test('resume onboarding after re-login', async ({ registerPage, loginPage, page }) => {
    const credentials = uniqueTestUser('owner');
    const onboarding = new OnboardingPage(page);

    await registerPage.goto();
    await registerPage.registerOwner(credentials);

    await onboarding.fillStep1({
      name: `עסק ${Date.now()}`,
      phone: credentials.phone,
      category: 'ספרות',
    });
    await onboarding.continueStep1();
    await page.waitForURL('**/setup/step-2');
    await onboarding.continueStep2();
    await page.waitForURL('**/setup/step-3');

    await page.getByRole('button', { name: 'יציאה מהמערכת' }).click();
    await expect(page).toHaveURL(/\/login/);

    await loginPage.login(credentials.email, credentials.password);
    await page.waitForURL('**/setup/step-1');

    await page.goto('/setup/step-3');
    await onboarding.fillStep3Service('מניקור');
    await onboarding.continueStep3();
    await page.waitForURL('**/setup/step-4');
    await onboarding.continueStep4();
    await page.waitForURL('**/setup/step-5');
    await onboarding.finishOnboarding();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('step 4 preview shows business details', async ({ registerOwner, page }) => {
    const credentials = uniqueTestUser('owner');
    const onboarding = new OnboardingPage(page);
    const businessName = `עסק תצוגה ${Date.now()}`;
    await registerOwner();

    await onboarding.fillStep1({
      name: businessName,
      phone: credentials.phone,
      category: 'ספרות',
    });
    await onboarding.continueStep1();
    await page.waitForURL('**/setup/step-2');
    await onboarding.continueStep2();
    await page.waitForURL('**/setup/step-3');
    await onboarding.fillStep3Service('צביעה');
    await onboarding.continueStep3();
    await page.waitForURL('**/setup/step-4');

    await expect(page.getByRole('heading', { name: 'תצוגה מקדימה' })).toBeVisible();
    await expect(page.getByRole('heading', { name: businessName })).toBeVisible();
  });

  test('step 5 shows share link only after finishing', async ({ registerOwner, page }) => {
    const credentials = uniqueTestUser('owner');
    const onboarding = new OnboardingPage(page);
    await registerOwner();

    await onboarding.fillStep1({
      name: `עסק שיתוף ${Date.now()}`,
      phone: credentials.phone,
      category: 'ספרות',
    });
    await onboarding.continueStep1();
    await page.waitForURL('**/setup/step-2');
    await onboarding.continueStep2();
    await page.waitForURL('**/setup/step-3');
    await onboarding.fillStep3Service('טיפול');
    await onboarding.continueStep3();
    await page.waitForURL('**/setup/step-4');
    await onboarding.continueStep4();
    await page.waitForURL('**/setup/step-5');

    await expect(page.getByRole('heading', { name: 'הכל מוכן!' })).toBeVisible();
    await expect(page.locator('main').getByRole('button', { name: 'הפעלת העסק' })).toBeVisible();
    await expect(page.locator('p[dir="ltr"]')).toHaveCount(0);

    await page.locator('main').getByRole('button', { name: 'הפעלת העסק' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'העסק שלך פעיל!' })).toBeVisible();
    await expect(page.locator('p[dir="ltr"]')).toContainText('localhost:3000');
  });
});
