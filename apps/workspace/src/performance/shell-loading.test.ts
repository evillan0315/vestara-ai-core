import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Shell loading performance characterization', () => {
  it('records the current generic Suspense fallback', () => {
    const appSource = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
    expect(appSource).toContain('fallback={<div className="w-full py-16 text-center');
    expect(appSource).toContain('>Loading...</div>');
  });
});
