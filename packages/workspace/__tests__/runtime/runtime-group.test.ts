import { Runtime, type RuntimeConfig, type RuntimeType } from '@vestara/runtime';
import { describe, expect, it } from 'vitest';
import { DuplicateRuntimeError, RuntimeGroup } from '../../src/runtime/runtime-group';

function createRuntime(
  type: string,
  hooks?: { onInitialize?: () => Promise<void>; onStop?: () => Promise<void> },
): Runtime {
  const config: RuntimeConfig = {
    id: type as unknown as RuntimeType,
    type: type as unknown as RuntimeType,
    name: type,
  };
  return new Runtime(config, hooks);
}

function makeGroup() {
  return new RuntimeGroup({
    getDependencies: () => [],
  });
}

describe('RuntimeGroup', () => {
  it('registers and retrieves runtimes', () => {
    const group = makeGroup();
    const rt = createRuntime('memory');
    group.add('memory' as RuntimeType, rt);
    expect(group.get('memory' as RuntimeType)).toBe(rt);
    expect(group.has('memory' as RuntimeType)).toBe(true);
    expect(group.has('unknown' as RuntimeType)).toBe(false);
  });

  it('throws DuplicateRuntimeError on duplicate registration', () => {
    const group = makeGroup();
    group.add('memory' as RuntimeType, createRuntime('memory'));
    expect(() => group.add('memory' as RuntimeType, createRuntime('memory'))).toThrow(DuplicateRuntimeError);
  });

  it('reports correct size', () => {
    const group = makeGroup();
    group.add('memory' as RuntimeType, createRuntime('memory'));
    group.add('agent' as RuntimeType, createRuntime('agent'));
    expect(group.size).toBe(2);
  });

  it('initializeAll transitions runtimes to running state', async () => {
    const group = makeGroup();
    const rt = createRuntime('memory');
    group.add('memory' as RuntimeType, rt);
    await group.initializeAll();
    expect(rt.state).toBe('running');
  });

  it('stopAll transitions all runtimes to stopped state', async () => {
    const group = makeGroup();
    const rt = createRuntime('memory');
    group.add('memory' as RuntimeType, rt);
    await group.initializeAll();
    await group.stopAll();
    expect(rt.state).toBe('stopped');
  });

  it('getHealth returns aggregated health', async () => {
    const group = makeGroup();
    group.add('memory' as RuntimeType, createRuntime('memory'));
    group.add('agent' as RuntimeType, createRuntime('agent'), true);
    await group.initializeAll();

    const health = group.getHealth();
    expect(health.status).toBe('healthy');
    expect(health.healthy).toBe(2);
    expect(health.total).toBe(2);
    expect(health.runtimes['memory']).toBeDefined();
    expect(health.runtimes['agent']).toBeDefined();
  });

  it('initializes runtimes in dependency order', async () => {
    const order: string[] = [];
    const mem = createRuntime('memory', {
      onInitialize: async () => {
        order.push('memory');
      },
    });
    const agent = createRuntime('agent', {
      onInitialize: async () => {
        order.push('agent');
      },
    });

    const group = new RuntimeGroup({
      getDependencies: (type) => {
        if (type === ('agent' as RuntimeType)) return ['memory' as RuntimeType];
        return [];
      },
    });
    group.add('memory' as RuntimeType, mem);
    group.add('agent' as RuntimeType, agent);
    await group.initializeAll();

    expect(order).toEqual(['memory', 'agent']);
  });
});
