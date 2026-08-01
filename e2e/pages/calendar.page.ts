import type { Page } from '@playwright/test';

export class CalendarPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/calendar');
    await this.waitForLoaded();
  }

  /** Waits for the calendar loading snackbar to finish (if shown). */
  async waitForLoaded(): Promise<void> {
    const loading = this.page.getByRole('status').filter({ hasText: 'טוען מידע...' });
    // Snackbar may not be mounted yet when navigation starts — wait for it to appear
    // first so "hidden" is not satisfied against a missing element.
    await loading.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => undefined);
    await loading.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => undefined);
  }

  heading(): ReturnType<Page['getByRole']> {
    return this.page.getByRole('heading', { name: 'יומן תורים' });
  }

  nextWeekButton(): ReturnType<Page['getByRole']> {
    return this.page.getByRole('button', { name: 'שבוע הבא' });
  }

  previousWeekButton(): ReturnType<Page['getByRole']> {
    return this.page.getByRole('button', { name: 'שבוע קודם' });
  }

  emptyBlockCell(): ReturnType<Page['getByRole']> {
    return this.page.getByRole('button').filter({ hasNotText: /\d{2}:\d{2}/ }).first();
  }

  appointmentText(text: string): ReturnType<Page['getByText']> {
    return this.page.getByText(text);
  }

  appointmentCell(customerName: string): ReturnType<Page['getByRole']> {
    return this.page.getByRole('button').filter({ hasText: customerName });
  }

  async openAppointmentMenu(customerName: string): Promise<void> {
    await this.appointmentCell(customerName).click();
  }

  approveLateCancelButton(): ReturnType<Page['getByRole']> {
    return this.page.getByRole('menuitem', { name: 'אישור בקשת ביטול' });
  }

  rejectLateCancelButton(): ReturnType<Page['getByRole']> {
    return this.page.getByRole('menuitem', { name: 'דחיית בקשת ביטול' });
  }

  pendingLateCancelLabel(): ReturnType<Page['getByText']> {
    return this.page.getByText('ממתין לאישור ביטול');
  }
}
