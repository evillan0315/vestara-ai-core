import { describe, expect, it } from 'vitest';
import { DefaultProviderManager } from '../src/index';

const provider = { id: 'p1', name: 'Test Provider', capabilities: { features: [] }, models: [] } as never;

describe('DefaultProviderManager contract', () => {
  it('registers, resolves, and lists providers', async () => {
    const manager = new DefaultProviderManager();
    await manager.register(provider);
    expect(manager.getProvider('p1')).toBe(provider);
    expect(manager.getProvider('missing')).toBeNull();
    expect(manager.listProviders().length).toBeGreaterThanOrEqual(1);
    await expect(manager.register(provider)).rejects.toThrow();
  });
});
