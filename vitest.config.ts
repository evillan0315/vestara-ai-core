import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Build resolve aliases for all @vestara/* workspace packages
// so vitest can resolve them from source in pnpm strict mode.
const packagesDir = path.resolve(__dirname, 'packages');
const aliases: Record<string, string> = {};

if (fs.existsSync(packagesDir)) {
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
}

export default defineConfig({
  resolve: {
    alias: aliases,
  },
  test: {
    include: [
      'packages/*/__tests__/**/*.{test,spec}.{ts,tsx}',
      'packages/{providers,tools}/*/__tests__/**/*.{test,spec}.{ts,tsx}',
      'apps/*/__tests__/**/*.{test,spec}.{ts,tsx}',
      'apps/workspace/tests/visual/__tests__/**/*.{test,spec}.{ts,tsx}',
    ],
    testTimeout: 15000,
  },
});
