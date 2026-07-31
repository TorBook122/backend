import type { Page } from '@playwright/test';

export class EmployeesPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/employees');
  }

  heading(): ReturnType<Page['getByRole']> {
    return this.page.getByRole('heading', { level: 1, name: /עובדים/ });
  }

  async waitForLoaded(): Promise<void> {
    await this.rolesPanelHeading().waitFor({ state: 'visible' });
    await this.page.getByRole('button', { name: 'הוספת תפקיד' }).waitFor({ state: 'visible' });
  }

  rolesPanelHeading(): ReturnType<Page['getByRole']> {
    return this.page.getByRole('heading', { name: 'הגדרת תפקידים והרשאות' });
  }

  addEmployeeButton(): ReturnType<Page['getByRole']> {
    return this.page.getByRole('button', { name: 'הוסף עובד', exact: true });
  }

  employeeRow(name: string): ReturnType<Page['getByText']> {
    return this.page.getByText(name, { exact: true });
  }

  roleBadge(name: string): ReturnType<Page['getByText']> {
    return this.page.getByText(name, { exact: true });
  }

  roleNameInput(): ReturnType<Page['getByLabel']> {
    return this.page.getByLabel('שם תפקיד');
  }

  permissionCheckbox(label: string): ReturnType<Page['getByRole']> {
    return this.page.getByRole('checkbox', { name: label });
  }

  addRoleButton(): ReturnType<Page['getByRole']> {
    return this.page.getByRole('button', { name: 'הוספת תפקיד' });
  }

  deleteRoleButton(roleName: string): ReturnType<Page['getByRole']> {
    return this.page.getByRole('button', { name: `מחיקת ${roleName}` });
  }

  employeeRoleSelect(): ReturnType<Page['locator']> {
    return this.page.locator('select').filter({ has: this.page.locator('option', { hasText: 'בחרו תפקיד' }) });
  }

  saveEmployeeButton(): ReturnType<Page['getByRole']> {
    return this.page.getByRole('button', { name: /^(הוספה|שמירה)$/ });
  }
}
