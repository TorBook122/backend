import { test as base, expect } from '@playwright/test';
import { resetDatabase } from '../helpers/db-reset.js';
import { clearRateLimitKeys } from '../helpers/redis-reset.js';

const resetFiles = new Set<string>();

type BaseFixtures = {
  autoResetDb: void;
};

export const test = base.extend<BaseFixtures>({
  autoResetDb: [
    async ({}, use, testInfo) => {
      if (!resetFiles.has(testInfo.file)) {
        await Promise.all([resetDatabase(), clearRateLimitKeys()]);
        resetFiles.add(testInfo.file);
      }
      await use();
    },
    { auto: true },
  ],
});

export { expect };
