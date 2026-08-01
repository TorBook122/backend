import type { Page } from '@playwright/test';

export class ConfirmPage {
  constructor(private readonly page: Page) {}

  successHeading(): ReturnType<Page['getByRole']> {
    return this.page.getByRole('heading', { name: /התור נקבע בהצלחה/ });
  }

  async goToMyAppointments(): Promise<void> {
    await Promise.all([
      this.page.waitForURL(/\/my-appointments(?:\/|$)/),
      this.page.getByRole('link', { name: 'לתורים שלי' }).click(),
    ]);
  }

  appointmentDetails(): ReturnType<Page['locator']> {
    return this.page.locator('time');
  }
}
