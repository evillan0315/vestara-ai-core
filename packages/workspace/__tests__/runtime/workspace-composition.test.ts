import { Runtime, type RuntimeConfig, type RuntimeType } from '@vestara/runtime';
import { describe, expect, it } from 'vitest';
import { RuntimeGroup } from '../../src/runtime/runtime-group';
import type { WorkspaceDefinition } from '../../src/runtime/workspace-definition';
import { WorkspaceFactory } from '../../src/runtime/workspace-factory';
import { WorkspaceComposition } from '../../src/runtime/workspace-runtime';

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

describe('WorkspaceComposition', () => {
  it('initializes all registered runtimes on initialize', async () => {
    const group = new RuntimeGroup({ getDependencies: () => [] });
    const mem = createRuntime('memory');
    group.add('memory' as RuntimeType, mem);

    const config: RuntimeConfig = {
      id: 'workspace:test' as unknown as RuntimeType,
      type: 'workspace' as RuntimeType,
      name: 'test',
    };
    const ws = new WorkspaceComposition(config, group);
    await ws.initialize();

    expect(mem.state).toBe('running');
    expect(ws.state).toBe('running');
  });

  it('stops all runtimes in reverse order on stop', async () => {
    const order: string[] = [];
    const mem = createRuntime('memory', {
      onStop: async () => {
        order.push('memory');
      },
    });
    const agent = createRuntime('agent', {
      onStop: async () => {
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

    const config: RuntimeConfig = {
      id: 'workspace:test' as unknown as RuntimeType,
      type: 'workspace' as RuntimeType,
      name: 'test',
    };
    const ws = new WorkspaceComposition(config, group);
    await ws.initialize();
    await ws.stop();

    // agent (last in) stopped first
    expect(order).toEqual(['agent', 'memory']);
    expect(mem.state).toBe('stopped');
    expect(agent.state).toBe('stopped');
    expect(ws.state).toBe('stopped');
  });

  it('getWorkspaceHealth returns aggregated health', async () => {
    const group = new RuntimeGroup({ getDependencies: () => [] });
    group.add('memory' as RuntimeType, createRuntime('memory'), true);

    const config: RuntimeConfig = {
      id: 'workspace:health' as unknown as RuntimeType,
      type: 'workspace' as RuntimeType,
      name: 'health-test',
    };
    const ws = new WorkspaceComposition(config, group);
    await ws.initialize();

    const health = ws.getWorkspaceHealth();
    expect(health.status).toBe('healthy');
    expect(health.healthy).toBe(1);
    expect(health.total).toBe(1);
  });

  it('addExternalRuntime adds runtime after construction', async () => {
    const group = new RuntimeGroup({ getDependencies: () => [] });
    const config: RuntimeConfig = {
      id: 'workspace:external' as unknown as RuntimeType,
      type: 'workspace' as RuntimeType,
      name: 'external-test',
    };
    const ws = new WorkspaceComposition(config, group);
    const mem = createRuntime('memory');
    ws.addExternalRuntime('memory', mem);
    await ws.initialize();

    expect(mem.state).toBe('running');
  });
});

describe('WorkspaceFactory', () => {
  it('creates a workspace from a definition', async () => {
    const mem = createRuntime('memory');
    const definition: WorkspaceDefinition = {
      name: 'test-workspace',
      runtimes: [{ type: 'memory' as RuntimeType, instance: mem, critical: true }],
    };

    const { runtime, group } = WorkspaceFactory.create(definition);
    await runtime.initialize();

    expect(runtime.state).toBe('running');
    expect(mem.state).toBe('running');

    const health = group.getHealth();
    expect(health.status).toBe('healthy');
  });
});
