import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const e2eDir = path.dirname(fileURLToPath(import.meta.url));

function resolveBackendDir(): string {
  const insideBackend = path.resolve(e2eDir, '..');
  if (fs.existsSync(path.join(insideBackend, 'pnpm-workspace.yaml'))) {
    return insideBackend;
  }

  return path.resolve(e2eDir, '../backend');
}

function resolveFrontendDir(backendDir: string): string {
  const sibling = path.resolve(e2eDir, '../frontend');
  if (fs.existsSync(path.join(sibling, 'package.json'))) {
    return sibling;
  }

  return path.resolve(backendDir, '../frontend');
}

const backendDir = resolveBackendDir();
const frontendDir = resolveFrontendDir(backendDir);
const reuseExistingServer = !process.env.CI;

export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'on-failure' }]],
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  use: {
    baseURL: 'http://localhost:3000',
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      command: 'pnpm e2e:stack',
      cwd: backendDir,
      url: 'http://localhost:3001/api/v1/health',
      reuseExistingServer,
      timeout: 120_000,
    },
    {
      command: 'pnpm dev',
      cwd: frontendDir,
      url: 'http://localhost:3000',
      reuseExistingServer,
      timeout: 120_000,
    },
  ],
});
