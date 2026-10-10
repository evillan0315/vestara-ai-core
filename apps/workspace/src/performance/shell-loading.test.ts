import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Shell loading performance characterization', () => {
  it('records the current generic Suspense fallback', () => {
    // `pnpm test` runs vitest from the repo root while package-scoped runs
    // use apps/workspace as cwd — accept both.
    const candidates = [
      resolve(process.cwd(), 'src/App.tsx'),
      resolve(process.cwd(), 'apps/workspace/src/App.tsx'),
    ];
    const appPath = candidates.find((candidate) => existsSync(candidate));
    expect(appPath).toBeDefined();
    const appSource = readFileSync(appPath as string, 'utf8');
    expect(appSource).toContain('fallback={<div className="w-full py-16 text-center');
    expect(appSource).toContain('>Loading...</div>');
  });
});
