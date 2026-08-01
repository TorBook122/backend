import { test as baseTest, expect } from './base.fixture.js';
import { uniqueTestUser, type TestUserCredentials } from '../helpers/credentials.js';
import {
  dismissMissingContactModal,
  getAccessTokenCookie,
  hydrateAuthSession,
  setAccessTokenCookie,
} from '../helpers/session.js';
import { LoginPage } from '../pages/login.page.js';
import { RegisterPage } from '../pages/register.page.js';

type AuthFixtures = {
  loginPage: LoginPage;
  registerPage: RegisterPage;
  registerCustomer: () => Promise<TestUserCredentials>;
  registerOwner: () => Promise<TestUserCredentials>;
  loginAs: (credentials: Pick<TestUserCredentials, 'email' | 'phone' | 'password'>, identifier?: 'email' | 'phone') => Promise<void>;
};

export const test = baseTest.extend<AuthFixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  registerPage: async ({ page }, use) => {
    await use(new RegisterPage(page));
  },

  registerCustomer: async ({ registerPage, page }, use) => {
    await use(async () => {
      const credentials = uniqueTestUser('customer');
      await registerPage.goto();
      await registerPage.registerCustomer(credentials);
      await page.waitForURL('**/my-appointments');
      return credentials;
    });
  },

  registerOwner: async ({ registerPage, page }, use) => {
    await use(async () => {
      const credentials = uniqueTestUser('owner');
      await registerPage.goto();
      await registerPage.registerOwner(credentials);
      await page.waitForURL('**/setup/step-1');
      return credentials;
    });
  },

  loginAs: async ({ loginPage, page }, use) => {
    await use(async (credentials, identifier = 'email') => {
      await loginPage.goto();
      await loginPage.login(
        identifier === 'email' ? credentials.email : credentials.phone,
        credentials.password,
      );
      await page.waitForURL((url) => !url.pathname.startsWith('/login'));
    });
  },
});

export {
  expect,
  setAccessTokenCookie,
  getAccessTokenCookie,
  hydrateAuthSession,
  dismissMissingContactModal,
};
