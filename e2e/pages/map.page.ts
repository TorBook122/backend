import type { Page } from '@playwright/test';

export class MapPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/map');
  }

  heading(): ReturnType<Page['getByRole']> {
    return this.page.getByRole('heading', { name: 'מפת עסקים' });
  }

  businessInList(name: string): ReturnType<Page['getByRole']> {
    return this.page.getByRole('listitem').filter({ hasText: name });
  }

  categoryFilter(name: string): ReturnType<Page['getByRole']> {
    return this.page.getByRole('button', { name, exact: true });
  }
}
