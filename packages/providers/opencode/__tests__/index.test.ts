import { describe, expect, it } from 'vitest';

describe('@vestara/provider-opencode', () => {
  it('exports OpenCodeProvider', async () => {
    const mod = await import('../src/index.js');
    expect(mod.OpenCodeProvider).toBeDefined();
  });

  it('can initialize with default config', async () => {
    const mod = await import('../src/index.js');
    const provider = new mod.OpenCodeProvider();
    expect(provider).toBeDefined();
    expect(provider.name).toBe('OpenCode');
    expect(provider.status).toBe('uninitialized');
  });
});
