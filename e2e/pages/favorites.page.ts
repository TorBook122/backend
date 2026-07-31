import type { Page } from '@playwright/test';

export class FavoritesPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/favorites');
  }

  heading(): ReturnType<Page['getByRole']> {
    return this.page.getByRole('heading', { name: 'מועדפים' });
  }

  removeFavoriteButton(businessName: string): ReturnType<Page['getByRole']> {
    return this.page.getByRole('button', { name: `הסרת ${businessName} מהמועדפים` });
  }

  bookLink(): ReturnType<Page['getByRole']> {
    return this.page.getByRole('link', { name: 'הזמנת תור' });
  }
}
