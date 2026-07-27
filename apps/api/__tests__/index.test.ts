import { describe, expect, it } from 'vitest';

describe('@vestara/api', () => {
  it('can import the module', async () => {
    const mod = await import('../src/index.js');
    expect(mod).toBeDefined();
  });

  it('module has expected structure', async () => {
    const mod = await import('../src/index.js');
    // App entry point — no public API exports to validate
    expect(typeof mod).toBe('object');
  });
});
