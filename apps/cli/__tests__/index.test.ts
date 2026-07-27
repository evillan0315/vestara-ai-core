import { describe, expect, it } from 'vitest';

describe('@vestara/cli', () => {
  it('can import the module', async () => {
    const mod = await import('../src/index.js');
    expect(mod).toBeDefined();
  });
});
