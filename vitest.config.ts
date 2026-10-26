import fs from 'node:fs';
import path from 'node:path';
import { configDefaults, defineConfig } from 'vitest/config';

// Build resolve aliases for all @vestara/* workspace packages
// so vitest can resolve them from source in pnpm strict mode.
const packagesDir = path.resolve(__dirname, 'packages');
const aliases: Record<string, string> = {};

if (fs.existsSync(packagesDir)) {
  // Scan top-level packages
  for (const dir of fs.readdirSync(packagesDir)) {
    const pkgPath = path.join(packagesDir, dir, 'package.json');
    if (!fs.existsSync(pkgPath)) continue;
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.name?.startsWith('@vestara/')) {
        aliases[pkg.name] = path.join(packagesDir, dir, 'dist');
      }
    } catch {
      // skip invalid package.json
    }
  }
  // Scan nested packages under providers/ and tools/
  for (const subdir of ['providers', 'tools']) {
    const subDirPath = path.join(packagesDir, subdir);
    if (!fs.existsSync(subDirPath)) continue;
    for (const dir of fs.readdirSync(subDirPath)) {
      const pkgPath = path.join(subDirPath, dir, 'package.json');
      if (!fs.existsSync(pkgPath)) continue;
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.name?.startsWith('@vestara/')) {
          aliases[pkg.name] = path.join(subDirPath, dir, 'dist');
        }
      } catch {
        // skip invalid package.json
      }
    }
  }
}

export default defineConfig({
  resolve: {
    alias: aliases,
  },
  test: {
    // Setup lives next to its dependency: @testing-library/react is a
    // @vestara/workspace-ui dependency, unresolvable from the repo root
    // under pnpm strict mode. This file remains as project-level test
    // infrastructure; with the legacy test source removed it will simply
    // have no DOM tests to clean, but is retained for the fresh suite.
    setupFiles: [path.resolve(__dirname, 'apps/workspace/vitest.setup.ts')],
    // NOTE: include patterns removed — no legacy test source remains.
    // The Vitest runner will start from a clean baseline (zero tests).
    // A new test suite will populate these patterns when ready.
    passWithNoTests: true,
    // Threads pool is faster than forks for unit tests (lighter weight,
    // no process spawn overhead). Forks may be needed if tests require
    // process isolation (e.g., native addons, process.exit).
    pool: 'threads',
    maxWorkers: 4,
    minWorkers: 1,
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      // Scoped to shippable source; fixtures, mocks, tests, and generated
      // contracts never count toward the repo-wide number.
      include: [
        'packages/*/src/**/*.ts',
        'packages/providers/*/src/**/*.ts',
        'packages/tools/*/src/**/*.ts',
        'apps/api/src/**/*.ts',
        'apps/cli/src/**/*.ts',
        'apps/workspace/src/**/*.{ts,tsx}',
      ],
      exclude: [
        ...configDefaults.exclude,
        '**/__tests__/**',
        '**/*.test.*',
        '**/*.spec.*',
        '**/*.fixtures.ts',
        '**/fixtures/**',
        '**/mocks/**',
        '**/generated/**',
        'apps/workspace-ui-v2/**',
      ],
      // Thresholds are intentionally unset: measure first via
      // `pnpm test:coverage`, then ratchet here to prevent regression.
      // Promote the CI coverage step from advisory to gate at that point.
    },
    // Ownership boundary (TEST-PERF-001A): Playwright owns
    // apps/workspace/tests/visual/**/*.spec.ts and
    // apps/workspace/tests/e2e/**/*.spec.ts (mirrors the app-local
    // vite.config.ts exclude). Without this, @playwright/test specs are
    // collected by Vitest and can hang/fail on constrained runners.
    // Ownership boundary: apps/workspace-ui-v2 runs its own harness
    // (its own vitest.config.ts with @vitejs/plugin-react, invoked via
    // `pnpm --filter workspace-ui-v2 test` in CI). Without this, the root
    // runner collects its colocated tests with no JSX transform and fails
    // them with `React is not defined`.
    exclude: [
      ...configDefaults.exclude,
      'apps/workspace-ui-v2/**',
      'apps/workspace/tests/visual/**/*.spec.ts',
      'apps/workspace/tests/e2e/**/*.spec.ts',
    ],
  },
});
