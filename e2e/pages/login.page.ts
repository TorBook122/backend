import type { Page } from '@playwright/test';

export class LoginPage {
  constructor(private readonly page: Page) {}

  async goto(from?: string): Promise<void> {
    const url = from ? `/login?from=${encodeURIComponent(from)}` : '/login';
    await this.page.goto(url);
  }

  async fillIdentifier(identifier: string): Promise<void> {
    await this.page.getByPlaceholder('youremail@example.com').fill(identifier);
  }

  async fillPassword(password: string): Promise<void> {
    await this.page.locator('input[type="password"]').first().fill(password);
  }

  async submit(): Promise<void> {
    await this.page.getByRole('button', { name: 'כניסה', exact: true }).click();
  }

  async login(identifier: string, password: string): Promise<void> {
    await this.fillIdentifier(identifier);
    await this.fillPassword(password);
    await this.submit();
  }

  serverError(): ReturnType<Page['locator']> {
    return this.page.locator('.text-red-600').filter({ hasText: /.+/ });
  }
}
