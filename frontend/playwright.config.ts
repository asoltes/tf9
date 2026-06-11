import { defineConfig, devices } from '@playwright/test';

const port = 18119;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 8_000,
  },
  reporter: 'line',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    viewport: { width: 1500, height: 950 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `node e2e/server.mjs ${port}`,
    url: `http://127.0.0.1:${port}/api/repos`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
