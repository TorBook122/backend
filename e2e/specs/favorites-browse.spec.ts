import { test, expect, hydrateAuthSession } from '../fixtures/business.fixture.js';
import { BrowsePage } from '../pages/browse.page.js';
import { FavoritesPage } from '../pages/favorites.page.js';
import { registerCustomer } from '../helpers/seed-via-api.js';

test.describe('favorites and browse', () => {
  test('browse list shows seeded business', async ({ page, seedBusiness }) => {
    const { business } = await seedBusiness({ businessName: 'מספרה לבדיקה' });
    const customer = await registerCustomer();
    await hydrateAuthSession(page, customer.accessToken);

    const browsePage = new BrowsePage(page);
    await browsePage.goto();
    await Promise.all([
      page.waitForResponse(
        (response) => response.url().includes('/businesses') && response.ok(),
      ),
      browsePage.search('מספרה לבדיקה'),
    ]);

    await expect(browsePage.businessCard('מספרה לבדיקה')).toBeVisible({ timeout: 10_000 });
    await expect(browsePage.bookLink('מספרה לבדיקה')).toBeVisible();
  });

  test('customer can add a business to favorites', async ({ page, seedBusiness }) => {
    const { business } = await seedBusiness();
    const customer = await registerCustomer();

    await hydrateAuthSession(page, customer.accessToken);
    await page.goto(`/${business.slug}`);

    await page.getByRole('button', { name: 'הוסף למועדפים' }).click();
    await expect(page.getByRole('button', { name: 'הסר ממועדפים' })).toBeVisible();
  });

  test('customer can remove a favorite', async ({ page, seedBusiness }) => {
    const { business } = await seedBusiness();
    const customer = await registerCustomer();

    await hydrateAuthSession(page, customer.accessToken);
    await page.goto(`/${business.slug}`);
    await page.getByRole('button', { name: 'הוסף למועדפים' }).click();

    const favoritesPage = new FavoritesPage(page);
    await favoritesPage.goto();
    await expect(favoritesPage.heading()).toBeVisible();

    await favoritesPage.removeFavoriteButton(business.name).click();
    await expect(page.getByText('אין עסקים במועדפים')).toBeVisible();
  });

  test('navigate to book from favorites', async ({ page, seedBusiness }) => {
    const { business } = await seedBusiness();
    const customer = await registerCustomer();

    await hydrateAuthSession(page, customer.accessToken);
    await page.goto(`/${business.slug}`);
    await page.getByRole('button', { name: 'הוסף למועדפים' }).click();
    await expect(page.getByRole('button', { name: 'הסר ממועדפים' })).toBeVisible();

    const favoritesPage = new FavoritesPage(page);
    await favoritesPage.goto();
    await favoritesPage.bookLink().click();

    await expect(page).toHaveURL(`/${business.slug}/book`);
    await expect(page.getByRole('heading', { name: 'הזמנת תור' })).toBeVisible();
  });
});
