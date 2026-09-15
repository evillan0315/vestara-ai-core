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
    // under pnpm strict mode. Imports inside the setup file resolve
    // relative to that file, so this works for every jsdom test.
    setupFiles: ['./apps/workspace/vitest.setup.ts'],
    include: [
      'packages/*/__tests__/**/*.{test,spec}.{ts,tsx}',
      // Colocated package tests (e.g. opencode-contract under src/__tests__)
      // were orphaned from root discovery. Canonical owner: root Vitest.
      'packages/*/src/__tests__/**/*.{test,spec}.{ts,tsx}',
      'packages/{providers,tools}/*/__tests__/**/*.{test,spec}.{ts,tsx}',
      'apps/*/__tests__/**/*.{test,spec}.{ts,tsx}',
      // Colocated app tests (theme-builder and appearance suites under
      // src/**/__tests__) were orphaned from root discovery. Canonical
      // owner: root Vitest (jsdom declared per-file via pragma).
      'apps/*/src/**/__tests__/**/*.{test,spec}.{ts,tsx}',
      // Vitest-owned tests for the visual tooling itself (config/diff/discovery/
      // naming/reports). Playwright owns the sibling *.visual.spec.ts files —
      // see the `exclude` below.
      'apps/workspace/tests/visual/__tests__/**/*.{test,spec}.{ts,tsx}',
    ],
    // Ownership boundary (TEST-PERF-001A): Playwright owns
    // apps/workspace/tests/visual/**/*.spec.ts (mirrors the app-local
    // vite.config.ts exclude). Without this, @playwright/test specs are
    // collected by Vitest and can hang/fail on constrained runners.
    exclude: [...configDefaults.exclude, 'apps/workspace/tests/visual/**/*.spec.ts'],
    // Deterministic resource bounds for a 4-core / 8 GB-class machine.
    // `forks` is Vitest's default pool and is preserved deliberately: the
    // suite mixes node, jsdom and sql.js/wasm workloads whose native/isolate
    // behavior is safest in forked child processes. maxWorkers=2 prevents the
    // default (cores-1 = 3) forks from thrashing under the ~3 GB headroom.
    pool: 'forks',
    maxWorkers: 2,
    testTimeout: 15000,
  },
});
