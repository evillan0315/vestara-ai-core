import type { EventBus } from '@vestara/event-bus';
import type { Logger } from '@vestara/logger';
import { describe, expect, it, vi } from 'vitest';
import type { WidgetCategory, WidgetLocation, WidgetManifest } from '../src/index';
import { DashboardRuntime, WidgetLifecycleManager } from '../src/index';

function createMockManifest(overrides?: Partial<WidgetManifest>): WidgetManifest {
  return {
    id: 'test-widget',
    version: '1.0',
    name: 'Test Widget',
    description: 'A test widget',
    category: 'system' as WidgetCategory,
    icon: 'test-icon',
    permissions: [],
    events: [],
    refresh: 'manual' as const,
    location: 'center' as WidgetLocation,
    priority: 50,
    subsystem: 'test',
    ...overrides,
  };
}

describe('WidgetLifecycleManager', () => {
  it('registers and instantiates widgets', async () => {
    const eventBus = { emit: vi.fn() } as unknown as EventBus;
    const logger = {
      child: vi.fn().mockReturnValue({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
    } as unknown as Logger;
    const manager = new WidgetLifecycleManager({ logger, eventBus });

    let state = '';
    const factory = vi.fn().mockImplementation((manifest: WidgetManifest) => ({
      manifest,
      get state() {
        return state as any;
      },
      set state(s: string) {
        state = s;
      },
      element: null,
      initialize: vi.fn(),
      subscribe: vi.fn(),
      mount: vi.fn(),
      unmount: vi.fn(),
      suspend: vi.fn(),
      resume: vi.fn(),
      destroy: vi.fn(),
      refresh: vi.fn(),
    }));

    manager.registerFactory('system', factory);

    const manifest = createMockManifest();
    const instance = await manager.instantiate(manifest);
    expect(instance.manifest.id).toBe('test-widget');
    expect(factory).toHaveBeenCalledWith(manifest);
  });

  it('throws for missing factory', async () => {
    const manager = new WidgetLifecycleManager();
    const manifest = createMockManifest({ category: 'repository' });
    await expect(manager.instantiate(manifest)).rejects.toThrow('No factory registered for category: repository');
  });
});

describe('DashboardRuntime', () => {
  it('registers manifests and sorts by priority', () => {
    const eventBus = { emit: vi.fn() } as unknown as EventBus;
    const logger = {
      child: vi.fn().mockReturnValue({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
    } as unknown as Logger;
    const lifecycle = new WidgetLifecycleManager();
    const runtime = new DashboardRuntime({ logger, eventBus, lifecycleManager: lifecycle });

    runtime.registerManifest(createMockManifest({ id: 'a', priority: 10 }));
    runtime.registerManifest(createMockManifest({ id: 'b', priority: 50 }));
    runtime.registerManifest(createMockManifest({ id: 'c', priority: 30 }));

    const layout = runtime.getLayout();
    const centerIds = layout.center;
    expect(centerIds).toEqual(['a', 'c', 'b']); // sorted by priority ascending
  });

  it('deduplicates manifests by id', () => {
    const eventBus = { emit: vi.fn() } as unknown as EventBus;
    const logger = { child: vi.fn().mockReturnValue({ info: vi.fn(), warn: vi.fn() }) } as unknown as Logger;
    const lifecycle = new WidgetLifecycleManager();
    const runtime = new DashboardRuntime({ logger, eventBus, lifecycleManager: lifecycle });

    runtime.registerManifest(createMockManifest({ id: 'dup' }));
    runtime.registerManifest(createMockManifest({ id: 'dup' }));

    expect(runtime.getManifests()).toHaveLength(1);
  });

  it('booting emits event', async () => {
    const eventBus = { emit: vi.fn() } as unknown as EventBus;
    const logger = { child: vi.fn().mockReturnValue({ info: vi.fn() }) } as unknown as Logger;
    const lifecycle = new WidgetLifecycleManager();
    const runtime = new DashboardRuntime({ logger, eventBus, lifecycleManager: lifecycle });

    runtime.registerManifest(createMockManifest());
    await runtime.boot();

    expect(eventBus.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'dashboard:booting' }));
  });
});
