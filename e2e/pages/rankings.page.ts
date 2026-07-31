import type { Page } from '@playwright/test';

export class RankingsPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/rankings');
  }

  heading(): ReturnType<Page['getByRole']> {
    return this.page.getByRole('heading', { name: 'דירוגים' });
  }

  categoryTab(name: string): ReturnType<Page['getByRole']> {
    return this.page.getByRole('button', { name, exact: true });
  }

  businessEntry(name: string): ReturnType<Page['getByRole']> {
    return this.page.getByRole('listitem').filter({ hasText: name });
  }
}
