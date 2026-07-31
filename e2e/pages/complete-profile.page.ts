import type { Page } from '@playwright/test';

export class CompleteProfilePage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/complete-profile');
  }

  heading(): ReturnType<Page['getByRole']> {
    return this.page.getByRole('heading', { name: 'השלמת פרופיל' });
  }

  async submitPhone(phone: string): Promise<void> {
    await this.page.getByLabel('טלפון').fill(phone);
    await this.page.getByRole('button', { name: 'המשך' }).click();
  }
}
