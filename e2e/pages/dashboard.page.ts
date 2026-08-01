import type { Page } from '@playwright/test';

export class DashboardPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/dashboard');
    await this.waitForLoaded();
  }

  async waitForLoaded(): Promise<void> {
    await this.heading().waitFor({ state: 'visible', timeout: 20_000 });
    await this.statCard('סה״כ תורים בכל הזמנים').waitFor({ state: 'visible', timeout: 20_000 });
  }

  heading(): ReturnType<Page['getByRole']> {
    return this.page.getByRole('heading', { name: 'לוח בקרה' });
  }

  statCard(title: string): ReturnType<Page['getByText']> {
    return this.page.getByText(title, { exact: true });
  }

  todaySection(): ReturnType<Page['getByText']> {
    return this.page.getByText('תורים שנקבעו להיום:');
  }

  calendarLink(): ReturnType<Page['getByRole']> {
    return this.page.getByRole('link', { name: 'יומן בעל עסק' });
  }
}
