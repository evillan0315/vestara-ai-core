import { defineConfig } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const serverUrl = new URL(BASE_URL);
const serverHost = serverUrl.hostname === 'localhost' ? '127.0.0.1' : serverUrl.hostname;
const serverPort = serverUrl.port || (serverUrl.protocol === 'https:' ? '443' : '80');

export default defineConfig({
  testDir: './tests/visual',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  globalSetup: './tests/visual/setup-clean.ts',
  globalTeardown: './tests/visual/report-teardown.ts',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'off',
  },
  webServer: {
    command: `VESTARA_DISABLE_DEV_WS_PROXY=1 npx vite dev --host ${serverHost} --port ${serverPort} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
