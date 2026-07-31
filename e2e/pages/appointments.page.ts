import type { Page } from '@playwright/test';

export class AppointmentsPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/my-appointments');
  }

  heading(): ReturnType<Page['getByRole']> {
    return this.page.getByRole('heading', { name: 'התורים שלי' });
  }

  appointmentFor(businessName: string): ReturnType<Page['getByRole']> {
    return this.page.getByRole('listitem').filter({
      has: this.page.getByRole('article', { name: new RegExp(`תור ב${businessName}`) }),
    });
  }

  cancelButton(businessName: string): ReturnType<Page['getByRole']> {
    return this.page.getByRole('button', { name: new RegExp(`ביטול תור ב${businessName}`) });
  }

  emptyState(): ReturnType<Page['getByText']> {
    return this.page.getByText('אין לך תורים קרובים');
  }
}
