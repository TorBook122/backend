import { test, expect, hydrateAuthSession } from '../fixtures/business.fixture.js';
import { MapPage } from '../pages/map.page.js';
import { RankingsPage } from '../pages/rankings.page.js';
import { registerCustomer, likeBusinessViaApi } from '../helpers/seed-via-api.js';
import { setBusinessCoordinates } from '../helpers/db-reset.js';

test.describe('map and rankings', () => {
  test('guest can view public rankings page', async ({ page }) => {
    const rankingsPage = new RankingsPage(page);
    await rankingsPage.goto();

    await expect(rankingsPage.heading()).toBeVisible();
    await expect(page.getByRole('button', { name: 'ספרות', exact: true })).toBeVisible();
  });

  test('rankings list shows business after engagement', async ({ page, seedBusiness }) => {
    const businessName = `מספרה מדורגת ${Date.now()}`;
    const { business } = await seedBusiness({
      businessName,
      category: 'ספרות',
      completeOnboarding: true,
    });
    const customer = await registerCustomer();
    await likeBusinessViaApi(customer, business.slug);

    const rankingsPage = new RankingsPage(page);
    await rankingsPage.goto();
    await rankingsPage.categoryTab('ספרות').click();

    await expect(rankingsPage.businessEntry(businessName)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/1 לייקים/)).toBeVisible();
  });

  test('customer map page shows seeded business with location', async ({ page, seedBusiness }) => {
    const businessName = `עסק במפה ${Date.now()}`;
    const { business } = await seedBusiness({
      businessName,
      category: 'ספרות',
      completeOnboarding: true,
    });
    await setBusinessCoordinates(business.id, 32.0853, 34.7818);

    const customer = await registerCustomer();
    await hydrateAuthSession(page, customer.accessToken);

    const mapPage = new MapPage(page);
    await mapPage.goto();

    await expect(mapPage.heading()).toBeVisible();
    await expect(page.getByText(/מציג \d+ עסקים/)).toBeVisible();
    await expect(mapPage.businessInList(businessName)).toBeVisible({ timeout: 10_000 });
  });

  test('map category filter narrows business list', async ({ page, seedBusiness }) => {
    const barberName = `ספרות מפה ${Date.now()}`;
    const fitnessName = `כושר מפה ${Date.now()}`;

    const barber = await seedBusiness({
      businessName: barberName,
      category: 'ספרות',
      completeOnboarding: true,
    });
    const fitness = await seedBusiness({
      businessName: fitnessName,
      category: 'כושר ובריאות',
      completeOnboarding: true,
    });

    await setBusinessCoordinates(barber.business.id, 32.08, 34.78);
    await setBusinessCoordinates(fitness.business.id, 32.09, 34.79);

    const customer = await registerCustomer();
    await hydrateAuthSession(page, customer.accessToken);

    const mapPage = new MapPage(page);
    await mapPage.goto();
    await expect(mapPage.businessInList(barberName)).toBeVisible({ timeout: 10_000 });
    await expect(mapPage.businessInList(fitnessName)).toBeVisible();

    await mapPage.categoryFilter('ספרות').click();
    await expect(mapPage.businessInList(barberName)).toBeVisible();
    await expect(mapPage.businessInList(fitnessName)).toHaveCount(0);
  });
});
