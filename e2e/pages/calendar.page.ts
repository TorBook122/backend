import type { Page } from '@playwright/test';

export class CalendarPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/calendar');
  }

  heading(): ReturnType<Page['getByRole']> {
    return this.page.getByRole('heading', { name: 'יומן' });
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
