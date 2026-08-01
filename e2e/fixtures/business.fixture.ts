import { test as baseTest, expect } from './auth.fixture.js';
import {
  seedOwnerWithBusiness,
  type SeededOwnerBusiness,
} from '../helpers/seed-via-api.js';

type BusinessFixtures = {
  seedBusiness: (options?: {
    completeOnboarding?: boolean;
    withService?: boolean;
    businessName?: string;
    serviceName?: string;
    category?: string;
  }) => Promise<SeededOwnerBusiness>;
};

export const test = baseTest.extend<BusinessFixtures>({
  seedBusiness: async ({}, use) => {
    await use(async (options = {}) => {
      return seedOwnerWithBusiness(options);
    });
  },
});

export {
  expect,
  setAccessTokenCookie,
  getAccessTokenCookie,
  hydrateAuthSession,
  dismissMissingContactModal,
} from './auth.fixture.js';
