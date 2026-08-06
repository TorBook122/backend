import type { Page } from '@playwright/test';

const HEBREW_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export class OnboardingPage {
  constructor(private readonly page: Page) {}

  async expectStep(step: number): Promise<void> {
    await this.page
      .locator('header')
      .getByText(`שלב ${step} מתוך 5`)
      .waitFor({ state: 'visible', timeout: 15_000 });
  }

  async fillStep1(details: {
    name: string;
    phone: string;
    category?: string;
    address?: string;
  }): Promise<void> {
    await this.page.getByLabel('שם העסק').fill(details.name);
    if (details.category) {
      await this.page.locator('select').first().selectOption(details.category);
    }
    await this.page.getByLabel('כתובת').fill(details.address ?? 'רחוב הרצל 1, תל אביב');
    await this.page.getByLabel('טלפון').fill(details.phone);
  }

  async continueStep1(): Promise<void> {
    await this.page.getByRole('button', { name: 'המשך' }).click();
  }

  async continueStep2(): Promise<void> {
    await this.page.getByRole('button', { name: 'המשך' }).click();
  }

  async deactivateAllDays(): Promise<void> {
    for (const day of HEBREW_DAYS) {
      const checkbox = this.page.getByRole('checkbox', { name: `${day} פעיל` });
      if (await checkbox.isChecked()) {
        await checkbox.uncheck();
      }
    }
  }

  async fillStep3Service(name: string, price = 80): Promise<void> {
    await this.page.getByPlaceholder('שם השירות').fill(name);
    await this.page.getByRole('spinbutton').nth(1).fill(String(price));
  }

  async continueStep3(): Promise<void> {
    await this.page.getByRole('button', { name: 'המשך' }).click();
  }

  async continueStep4(): Promise<void> {
    await this.page.getByRole('button', { name: 'המשך' }).click();
  }

  async finishOnboarding(): Promise<void> {
    await this.page.locator('main').getByRole('button', { name: 'המשך לתשלום מאובטח' }).click();

    const checkoutIframe = this.page.locator('iframe[title="טופס תשלום מאובטח"]');
    const iframeShown = await checkoutIframe
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => true)
      .catch(() => false);

    if (iframeShown) {
      await this.page.waitForURL('**/upgrade/success**', { timeout: 45_000 });
    } else {
      await this.page.waitForURL('**/upgrade/success**', { timeout: 20_000 });
    }

    await this.page.getByRole('heading', { name: 'העסק שלך פעיל!' }).waitFor({ timeout: 30_000 });
    await this.page.getByRole('button', { name: 'המשך ללוח הבקרה' }).click();
    await this.page.waitForURL('**/dashboard');
  }

  async completeAllSteps(details: {
    businessName: string;
    phone: string;
    category?: string;
    serviceName: string;
  }): Promise<void> {
    await this.page.getByRole('heading', { name: 'פרטי העסק' }).waitFor();
    await this.fillStep1({
      name: details.businessName,
      phone: details.phone,
      category: details.category ?? 'ספרות',
    });
    await this.continueStep1();
    await this.page.waitForURL('**/setup/step-2');

    await this.expectStep(2);
    await this.continueStep2();
    await this.page.waitForURL('**/setup/step-3');

    await this.expectStep(3);
    await this.fillStep3Service(details.serviceName);
    await this.continueStep3();
    await this.page.waitForURL('**/setup/step-4');

    await this.expectStep(4);
    await this.continueStep4();
    await this.page.waitForURL('**/setup/step-5');

    await this.expectStep(5);
    await this.finishOnboarding();
    await this.page.waitForURL('**/dashboard');
  }

  toast(title: string): ReturnType<Page['getByText']> {
    return this.page.getByText(title, { exact: true });
  }
}
