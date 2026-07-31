import { test, expect, hydrateAuthSession } from '../fixtures/business.fixture.js';
import { registerCustomer, getEngagementViaApi, getBusinessRankingScoreViaApi } from '../helpers/seed-via-api.js';
import { createConfirmedAppointment, hoursFromNow } from '../helpers/appointment-factory.js';

test.describe('business engagement', () => {
  test('logged-in customer can like a business', async ({ page, seedBusiness }) => {
    const { business } = await seedBusiness({ completeOnboarding: true });
    const customer = await registerCustomer();

    await hydrateAuthSession(page, customer.accessToken);
    await page.goto(`/${business.slug}`);

    const likeButton = page.getByRole('button', { name: /^♡ \d+$/ });
    await likeButton.click();
    await expect(page.getByRole('button', { name: /^♥ 1$/ })).toBeVisible();
    await expect(page.getByText('1 לייקים')).toBeVisible();
  });

  test('customer can publish comment after completed appointment', async ({ page, seedBusiness }) => {
    const { business, service } = await seedBusiness({ completeOnboarding: true });
    const customer = await registerCustomer();

    await createConfirmedAppointment({
      businessId: business.id,
      customerId: customer.id,
      serviceId: service.id,
      startsAt: hoursFromNow(-3),
    });

    await hydrateAuthSession(page, customer.accessToken);
    await page.goto(`/${business.slug}`);

    await page.getByPlaceholder('כתבו תגובה על העסק...').fill('שירות מעולה, ממליץ בחום!');
    await page.getByRole('button', { name: 'פרסם תגובה' }).click();

    await expect(page.getByRole('status').filter({ hasText: 'התגובה פורסמה' })).toBeVisible();
    await expect(page.getByText('שירות מעולה, ממליץ בחום!')).toBeVisible();
    await expect(page.getByText('1 תגובות')).toBeVisible();
    await expect(page.getByText('חיובית')).toBeVisible();
  });

  test('positive comment increases rankings score by 2', async ({ page, seedBusiness }) => {
    const businessName = `עסק חיובי ${Date.now()}`;
    const { business, service } = await seedBusiness({
      businessName,
      category: 'ספרות',
      completeOnboarding: true,
    });
    const customer = await registerCustomer();

    await createConfirmedAppointment({
      businessId: business.id,
      customerId: customer.id,
      serviceId: service.id,
      startsAt: hoursFromNow(-3),
    });

    const initialEngagement = await getEngagementViaApi(business.slug);
    expect(initialEngagement.score).toBe(0);

    await hydrateAuthSession(page, customer.accessToken);
    await page.goto(`/${business.slug}`);
    await page.getByPlaceholder('כתבו תגובה על העסק...').fill('שירות מעולה, ממליץ!');
    await page.getByRole('button', { name: 'פרסם תגובה' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'התגובה פורסמה' })).toBeVisible();

    const engagement = await getEngagementViaApi(business.slug);
    expect(engagement.score).toBe(2);
    expect(engagement.positiveCount).toBe(1);

    const rankingScore = await getBusinessRankingScoreViaApi(business.slug, 'ספרות');
    expect(rankingScore).toBe(2);
  });

  test('negative comment decreases rankings score by 1', async ({ page, seedBusiness }) => {
    const businessName = `עסק שלילי ${Date.now()}`;
    const { business, service } = await seedBusiness({
      businessName,
      category: 'ספרות',
      completeOnboarding: true,
    });
    const customer = await registerCustomer();

    await createConfirmedAppointment({
      businessId: business.id,
      customerId: customer.id,
      serviceId: service.id,
      startsAt: hoursFromNow(-3),
    });

    const initialEngagement = await getEngagementViaApi(business.slug);
    expect(initialEngagement.score).toBe(0);

    await hydrateAuthSession(page, customer.accessToken);
    await page.goto(`/${business.slug}`);
    await page.getByPlaceholder('כתבו תגובה על העסק...').fill('שירות גרוע, לא ממליץ');
    await page.getByRole('button', { name: 'פרסם תגובה' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'התגובה פורסמה' })).toBeVisible();
    await expect(page.getByText('שלילית')).toBeVisible();

    const engagement = await getEngagementViaApi(business.slug);
    expect(engagement.score).toBe(-1);
    expect(engagement.negativeCount).toBe(1);

    const rankingScore = await getBusinessRankingScoreViaApi(business.slug, 'ספרות');
    expect(rankingScore).toBe(-1);
  });

  test('public business page shows navigation buttons when address exists', async ({
    page,
    seedBusiness,
  }) => {
    const { business } = await seedBusiness({ completeOnboarding: true });

    await page.goto(`/${business.slug}`);

    await expect(page.getByRole('button', { name: 'ניווט ב-Google Maps' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'ניווט ב-Waze' })).toBeVisible();
  });
});
