import { describe, expect, it } from 'vitest';
import { DefaultServiceRegistry } from '../src/index';

const service = {
  id: 'svc-a',
  version: '1.0.0',
  status: 'running',
  initialize: async () => {},
  start: async () => {},
  stop: async () => {},
  health: async () => ({ status: 'healthy' }),
  dispose: async () => {},
} as never;

describe('DefaultServiceRegistry contract', () => {
  it('registers, resolves, and unregisters services', async () => {
    const registry = new DefaultServiceRegistry();
    await registry.register(service, ['compute']);
    expect(registry.get('svc-a')).toBe(service);
    expect(registry.findByCapability('compute')).toBe(service);
    expect(registry.listServices()).toHaveLength(1);
    await expect(registry.register(service)).rejects.toThrow();
    await registry.unregister('svc-a');
    expect(registry.get('svc-a')).toBeNull();
  });
});
