import { describe, expect, it } from 'vitest';

describe('@vestara/tools-shell', () => {
  it('exports version', async () => {
    const mod = await import('../src/index.js');
    expect(mod.version).toBeDefined();
    expect(typeof mod.version).toBe('string');
  });
});
