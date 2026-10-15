import { defineConfig } from '@playwright/test';

// Functional end-to-end suite for the workspace UI. Unlike the visual
// regression suite (tests/visual, mocked API), these specs drive the REAL
// API + UI servers, so both must already be running:
//
//   pnpm dev:api   # http://127.0.0.1:3001 (or an existing instance)
//   pnpm --filter @vestara/workspace-ui dev   # http://127.0.0.1:5173
//
// Auth is provisioned per-test through the real /api/auth/login endpoint
// (username login auto-creates an editor user). File mutations are scoped
// to timestamped scratch files that the suite deletes afterwards.
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1600, height: 900 },
  },
});
