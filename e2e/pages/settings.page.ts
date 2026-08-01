import type { Page } from '@playwright/test';

const HEBREW_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'] as const;

export class SettingsPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/settings');
  }

  heading(): ReturnType<Page['getByRole']> {
    return this.page.getByRole('heading', { level: 1, name: /הגדרות עסק/ });
  }

  async waitForLoaded(): Promise<void> {
    await this.heading().waitFor({ state: 'visible', timeout: 20_000 });
  }

  hoursEditor(): ReturnType<Page['getByLabel']> {
    return this.page.getByLabel('שעות פעילות');
  }

  async deactivateAllDays(): Promise<void> {
    for (const day of HEBREW_DAYS) {
      await this.page.getByRole('checkbox', { name: `${day} פעיל` }).uncheck();
    }
  }

  breaksHelperText(): ReturnType<Page['getByText']> {
    return this.page.getByText('הפעילו לפחות יום אחד כדי להגדיר הפסקות');
  }
}
