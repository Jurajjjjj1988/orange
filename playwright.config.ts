import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  retries: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'https://www.orange.sk',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    viewport: { width: 1280, height: 900 },
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'security',
      testDir: './tests/security',
    },
    {
      name: 'e2e',
      testDir: './tests/e2e',
    },
    {
      name: 'api',
      testDir: './tests/api',
    },
    {
      name: 'accessibility',
      testDir: './tests/accessibility',
    },
  ],
});
