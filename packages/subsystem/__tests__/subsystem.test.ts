import type { EventBus } from '@vestara/event-bus';
import type { Logger } from '@vestara/logger';
import type { ServiceRegistry } from '@vestara/service-registry';
import { describe, expect, it, vi } from 'vitest';
import { Subsystem } from '../src/index';

class TestSubsystem extends Subsystem {
  protected async onInitialize(): Promise<void> {}
  protected async onStart(): Promise<void> {}
  protected async onStop(): Promise<void> {}
  protected async onDispose(): Promise<void> {}
  protected async onHealth() {
    return { status: 'healthy' as const };
  }
}

function createMocks() {
  const eventBus = { emit: vi.fn() } as unknown as EventBus;
  const logger = {
    child: vi.fn().mockReturnValue({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  } as unknown as Logger;
  const registry = { register: vi.fn() } as unknown as ServiceRegistry;
  return { eventBus, logger, registry };
}

describe('Subsystem', () => {
  it('initializes with correct id and version', () => {
    const mocks = createMocks();
    const sub = new TestSubsystem(
      {
        id: 'test',
        version: '1.0',
        name: 'Test',
        description: '',
        capabilities: [],
        dependencies: [],
        permissions: [],
      },
      mocks,
    );
    expect(sub.id).toBe('test');
    expect(sub.version).toBe('1.0');
    expect(sub.status).toBe('uninitialized');
  });

  it('transitions through lifecycle', async () => {
    const mocks = createMocks();
    const sub = new TestSubsystem(
      {
        id: 'lifecycle',
        version: '1.0',
        name: '',
        description: '',
        capabilities: [],
        dependencies: [],
        permissions: [],
      },
      mocks,
    );
    expect(sub.status).toBe('uninitialized');
    await sub.initialize();
    expect(sub.status).toBe('initialized');
    await sub.start();
    expect(sub.status).toBe('running');
    await sub.stop();
    expect(sub.status).toBe('stopped');
    await sub.dispose();
    expect(sub.status).toBe('disposed');
  });

  it('emits health status', async () => {
    const mocks = createMocks();
    const sub = new TestSubsystem(
      {
        id: 'health-test',
        version: '1.0',
        name: '',
        description: '',
        capabilities: [],
        dependencies: [],
        permissions: [],
      },
      mocks,
    );
    await sub.initialize();
    await sub.start();
    const health = await sub.health();
    expect(health.status).toBe('healthy');
    expect(health.serviceId).toBe('health-test');
    expect(health.uptime).toBeGreaterThanOrEqual(0);
  });

  it('runs lifecycle hooks', async () => {
    const mocks = createMocks();
    const sub = new TestSubsystem(
      { id: 'hooks', version: '1.0', name: '', description: '', capabilities: [], dependencies: [], permissions: [] },
      mocks,
    );
    const preInit = vi.fn();
    const postStart = vi.fn();
    sub.on('pre-init', preInit);
    sub.on('post-start', postStart);
    await sub.initialize();
    expect(preInit).toHaveBeenCalled();
    await sub.start();
    expect(postStart).toHaveBeenCalled();
  });
});
