import { describe, expect, it, vi } from 'vitest';

function createMockEventBus() {
  let handler: ((event: any) => void) | null = null;
  return {
    emit: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockImplementation((_pattern: any, h: any) => {
      handler = h;
      return () => {
        handler = null;
      };
    }),
    once: vi.fn(),
    unsubscribeAll: vi.fn(),
    getMetrics: vi.fn().mockReturnValue({
      totalEmitted: 0,
      totalProcessed: 0,
      totalFailed: 0,
      avgLatency: 0,
      activeSubscribers: 0,
    }),
    trigger: (event: any) => handler?.(event),
  };
}

function createMockPermissionManager() {
  return {
    check: vi.fn().mockReturnValue(true),
    getEffectiveRole: vi.fn(),
    hasOperation: vi.fn(),
    grant: vi.fn(),
    revoke: vi.fn(),
    registerDefaultGrants: vi.fn(),
    getGrantsForTarget: vi.fn(),
    getGrantsForActor: vi.fn(),
  };
}

describe('@vestara/runtime', () => {
  it('creates a Runtime in created state', () => {
    const { Runtime } = require('../dist/index.js');
    const rt = new Runtime({ id: 'rt-1' as any, type: 'agent' });
    expect(rt.state).toBe('created');
    expect(rt.id).toBe('rt-1');
    expect(rt.type).toBe('agent');
    expect(rt.isDisposed).toBe(false);
  });

  it('initializes to running state', async () => {
    const { Runtime } = require('../dist/index.js');
    const rt = new Runtime({ id: 'rt-2' as any, type: 'agent' });
    await rt.initialize();
    expect(rt.state).toBe('running');
    expect(rt.startedAt).toBeTruthy();
  });

  it('rejects initialize from non-created state', async () => {
    const { Runtime } = require('../dist/index.js');
    const rt = new Runtime({ id: 'rt-3' as any, type: 'agent' });
    await rt.initialize();
    await expect(rt.initialize()).rejects.toThrow(/expected 'created'/);
  });

  it('full lifecycle: created → initialize → running → stop → stopped → destroy → destroyed', async () => {
    const { Runtime } = require('../dist/index.js');
    const rt = new Runtime({ id: 'rt-4' as any, type: 'agent' });
    expect(rt.state).toBe('created');
    await rt.initialize();
    expect(rt.state).toBe('running');
    await rt.stop();
    expect(rt.state).toBe('stopped');
    await rt.destroy();
    expect(rt.state).toBe('destroyed');
    expect(rt.isDisposed).toBe(true);
  });

  it('suspend and resume', async () => {
    const { Runtime } = require('../dist/index.js');
    const rt = new Runtime({ id: 'rt-5' as any, type: 'agent' });
    await rt.initialize();
    await rt.suspend();
    expect(rt.state).toBe('suspended');
    await rt.resume();
    expect(rt.state).toBe('running');
  });

  it('degrade and recover', async () => {
    const { Runtime } = require('../dist/index.js');
    const rt = new Runtime({ id: 'rt-6' as any, type: 'agent' });
    await rt.initialize();
    await rt.degrade(['high latency', 'memory pressure']);
    expect(rt.state).toBe('degraded');
    expect(rt.health.status).toBe('degraded');
    await rt.recover();
    expect(rt.state).toBe('running');
    expect(rt.health.status).toBe('healthy');
  });

  it('quarantine from degraded state', async () => {
    const { Runtime } = require('../dist/index.js');
    const rt = new Runtime({ id: 'rt-7' as any, type: 'agent' });
    await rt.initialize();
    await rt.degrade(['persistent failure']);
    await rt.quarantine('too many failures');
    expect(rt.state).toBe('quarantined');
  });

  it('runs hooks on lifecycle transitions', async () => {
    const { Runtime } = require('../dist/index.js');
    const onInit = vi.fn();
    const onStart = vi.fn();
    const onStop = vi.fn();
    const onDestroy = vi.fn();
    const rt = new Runtime({ id: 'rt-8' as any, type: 'agent' }, { onInitialize: onInit, onStart, onStop, onDestroy });
    await rt.initialize();
    expect(onInit).toHaveBeenCalledTimes(1);
    await rt.stop();
    expect(onStop).toHaveBeenCalledTimes(1);
    await rt.destroy();
    expect(onDestroy).toHaveBeenCalledTimes(1);
  });

  it('emits events via event bus', async () => {
    const { Runtime } = require('../dist/index.js');
    const eventBus = createMockEventBus();
    const rt = new Runtime({ id: 'rt-9' as any, type: 'agent', eventBus });
    await rt.initialize();
    expect(eventBus.emit).toHaveBeenCalled();
    const emittedEvents = eventBus.emit.mock.calls.map((c: any[]) => c[0].type);
    expect(emittedEvents).toContain('runtime:initializing');
    expect(emittedEvents).toContain('runtime:started');
  });

  it('provides runtime info', async () => {
    const { Runtime } = require('../dist/index.js');
    const rt = new Runtime({ id: 'rt-10' as any, type: 'agent' });
    await rt.initialize();
    const info = rt.info;
    expect(info.id).toBe('rt-10');
    expect(info.type).toBe('agent');
    expect(info.state).toBe('running');
    expect(info.health.status).toBe('healthy');
    expect(info.startedAt).toBeTruthy();
  });

  it('checkpoint stores and retrieves data', async () => {
    const { Runtime } = require('../dist/index.js');
    const rt = new Runtime({ id: 'rt-11' as any, type: 'agent' });
    rt.checkpoint('step-1', { files: ['a.ts', 'b.ts'] });
    rt.checkpoint('progress', 50);
    expect(rt.getCheckpoint('step-1')).toEqual({ files: ['a.ts', 'b.ts'] });
    expect(rt.getCheckpoint('progress')).toBe(50);
    rt.clearCheckpoints();
    expect(rt.getCheckpoint('step-1')).toBeUndefined();
  });

  it('dependency management', async () => {
    const { Runtime } = require('../dist/index.js');
    const rt = new Runtime({ id: 'rt-12' as any, type: 'agent' });
    rt.addDependency({
      id: 'dep-1' as any,
      status: 'healthy',
      latency: 5,
      lastChecked: new Date().toISOString(),
    });
    expect(rt.health.dependencies).toHaveLength(1);
    rt.addDependency({
      id: 'dep-2' as any,
      status: 'healthy',
      latency: 3,
      lastChecked: new Date().toISOString(),
    });
    expect(rt.health.dependencies).toHaveLength(2);
    rt.removeDependency('dep-1' as any);
    expect(rt.health.dependencies).toHaveLength(1);
  });

  it('checkPermission delegates to permission manager', async () => {
    const { Runtime } = require('../dist/index.js');
    const pm = createMockPermissionManager();
    const rt = new Runtime({ id: 'rt-13' as any, type: 'agent', permissionManager: pm });
    const result = rt.checkPermission('runtime:read', 'workspace', 'ws-1');
    expect(result).toBe(true);
    expect(pm.check).toHaveBeenCalledWith({
      actor: 'rt-13',
      operation: 'runtime:read',
      targetType: 'workspace',
      targetId: 'ws-1',
    });
  });

  it('checkPermission returns true without permission manager', () => {
    const { Runtime } = require('../dist/index.js');
    const rt = new Runtime({ id: 'rt-14' as any, type: 'agent' });
    expect(rt.checkPermission('runtime:delete', 'workspace', 'ws-1')).toBe(true);
  });

  it('capabilities come from registry by default', () => {
    const { Runtime } = require('../dist/index.js');
    const rt = new Runtime({ id: 'rt-15' as any, type: 'agent' });
    expect(rt.capabilities.length).toBeGreaterThan(0);
  });

  it('custom capabilities override defaults', () => {
    const { Runtime } = require('../dist/index.js');
    const rt = new Runtime({ id: 'rt-16' as any, type: 'agent', capabilities: ['custom:test:develop'] });
    expect(rt.capabilities).toEqual(['custom:test:develop']);
  });

  it('error property captures failure', async () => {
    const { Runtime } = require('../dist/index.js');
    const rt = new Runtime(
      { id: 'rt-17' as any, type: 'agent' },
      {
        onInitialize: async () => {
          throw new Error('init failed');
        },
      },
    );
    await rt.initialize();
    expect(rt.state).toBe('failed');
    expect(rt.error).toBe('init failed');
  });

  it('setEventBus and setPermissionManager update after construction', () => {
    const { Runtime } = require('../dist/index.js');
    const rt = new Runtime({ id: 'rt-18' as any, type: 'agent' });
    const eventBus = createMockEventBus();
    const pm = createMockPermissionManager();
    rt.setEventBus(eventBus as any);
    rt.setPermissionManager(pm as any);
    expect(rt.checkPermission('runtime:read', 'workspace', 'ws-1')).toBe(true);
  });

  it('destroy on non-stopped runtime stops first', async () => {
    const { Runtime } = require('../dist/index.js');
    const rt = new Runtime({ id: 'rt-19' as any, type: 'agent' });
    await rt.initialize();
    await rt.destroy();
    expect(rt.state).toBe('destroyed');
    expect(rt.isDisposed).toBe(true);
  });
});
