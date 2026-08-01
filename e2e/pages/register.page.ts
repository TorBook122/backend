import type { Page } from '@playwright/test';
import type { TestUserCredentials } from '../helpers/credentials.js';

export class RegisterPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/register');
  }

  async selectOwner(): Promise<void> {
    await this.page.getByRole('button', { name: 'בעל עסק' }).click();
  }

  async selectCustomer(): Promise<void> {
    await this.page.getByRole('button', { name: 'לקוח' }).click();
  }

  async fillForm(credentials: Pick<TestUserCredentials, 'name' | 'phone' | 'email' | 'password'>): Promise<void> {
    await this.page.getByLabel('שם מלא').fill(credentials.name);
    await this.page.getByLabel('טלפון').fill(credentials.phone);
    await this.page.getByLabel('אימייל').fill(credentials.email);
    await this.page.getByLabel('סיסמה').fill(credentials.password);
  }

  async submitAsOwner(): Promise<void> {
    await this.page.getByRole('button', { name: 'הרשמה והגדרת העסק' }).click();
  }

  async submitAsCustomer(): Promise<void> {
    await this.page.getByRole('button', { name: 'הרשמה', exact: true }).click();
  }

  async registerOwner(credentials: TestUserCredentials): Promise<void> {
    await this.selectOwner();
    await this.fillForm(credentials);
    await this.submitAsOwner();
  }

  async registerCustomer(credentials: TestUserCredentials): Promise<void> {
    await this.selectCustomer();
    await this.fillForm(credentials);
    await this.submitAsCustomer();
  }

  serverError(): ReturnType<Page['locator']> {
    return this.page.locator('.text-red-600').filter({ hasText: /.+/ });
  }
}
