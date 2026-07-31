import type { Page } from '@playwright/test';

export class BookingPage {
  constructor(private readonly page: Page) {}

  async goto(slug: string): Promise<void> {
    await this.page.goto(`/${slug}/book`);
  }

  async selectService(name: string): Promise<void> {
    await this.page.getByRole('button', { name: new RegExp(name) }).click();
  }

  async pickDate(date: string): Promise<void> {
    await this.page.locator('input[type="date"]').fill(date);
  }

  async pickFirstAvailableSlot(): Promise<string> {
    const slot = this.page
      .getByRole('listbox', { name: 'שעות פנויות' })
      .getByRole('option')
      .first();
    await slot.waitFor({ state: 'visible' });
    const label = (await slot.textContent())?.trim() ?? '';
    await slot.click();
    return label;
  }

  async confirmBooking(): Promise<void> {
    await this.page.getByRole('button', { name: 'אישור הזמנה' }).click();
  }

  async bookService(serviceName: string, date: string): Promise<string> {
    await this.selectService(serviceName);
    await this.pickDate(date);
    const time = await this.pickFirstAvailableSlot();
    await this.confirmBooking();
    return time;
  }

  async loginInModal(identifier: string, password: string): Promise<void> {
    await this.page.getByLabel('אימייל או טלפון').fill(identifier);
    await this.page.getByLabel('סיסמה').fill(password);
    await this.page.getByRole('button', { name: 'התחברות והזמנה' }).click();
  }

  async openRegisterInModal(): Promise<void> {
    await this.page.getByRole('button', { name: 'הרשמה', exact: true }).click();
  }

  async registerInModal(credentials: {
    name: string;
    phone: string;
    email: string;
    password: string;
  }): Promise<void> {
    const dialog = this.page.getByRole('dialog');
    await dialog.getByLabel('שם מלא').fill(credentials.name);
    await dialog.getByLabel('טלפון').fill(credentials.phone);
    await dialog.getByLabel('אימייל').fill(credentials.email);
    await dialog.getByLabel('סיסמה').fill(credentials.password);
    await dialog.getByRole('button', { name: 'הרשמה והזמנה' }).click();
  }

  emptyState(): ReturnType<Page['getByText']> {
    return this.page.getByText('אין שירותים זמינים');
  }
}
