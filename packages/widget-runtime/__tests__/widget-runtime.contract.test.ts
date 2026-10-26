import { describe, expect, it } from 'vitest';
import { WidgetLifecycleManager } from '../src/index';

const manifest = {
  id: 'w1',
  version: '1.0.0',
  name: 'Health',
  description: 'Health widget',
  category: 'health',
  icon: 'pulse',
  permissions: [],
  events: [],
} as never;

function instance() {
  return {
    manifest,
    state: 'installed',
    element: null,
    initialize: async () => {},
    subscribe: async () => {},
    mount: async () => {},
    unmount: async () => {},
    suspend: async () => {},
    resume: async () => {},
  } as never;
}

describe('WidgetLifecycleManager contract', () => {
  it('instantiates widgets from registered factories', async () => {
    const manager = new WidgetLifecycleManager();
    manager.registerFactory('health', () => instance());
    const created = await manager.instantiate(manifest);
    expect(created.manifest).toBe(manifest);
  });

  it('rejects manifests with no factory', async () => {
    const manager = new WidgetLifecycleManager();
    await expect(manager.instantiate(manifest)).rejects.toThrow('health');
  });
});
