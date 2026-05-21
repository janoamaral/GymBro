import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3101',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'E2E_AUTH_BYPASS=true pnpm dev --port 3101',
    url: 'http://localhost:3101',
    reuseExistingServer: false,
    timeout: 120000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
