import type { Page } from '@playwright/test';

export class BrowsePage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/browse');
  }

  heading(): ReturnType<Page['getByRole']> {
    return this.page.getByRole('heading', { name: 'חיפוש עסקים' });
  }

  async search(query: string): Promise<void> {
    await this.page.getByPlaceholder('חפשו עסק לפי שם, קטגוריה או כתובת...').fill(query);
  }

  businessCard(name: string): ReturnType<Page['getByRole']> {
    return this.page.getByRole('listitem').filter({ hasText: name });
  }

  bookLink(name: string): ReturnType<Page['getByRole']> {
    return this.businessCard(name).getByRole('link', { name: 'הזמנת תור' });
  }
}
