import { Runtime, type RuntimeConfig, type RuntimeType } from '@vestara/runtime';
import { describe, expect, it } from 'vitest';
import { DependencyResolver, RuntimeDependencyCycleError } from '../../src/runtime/dependency-resolver';

function createRuntime(type: string): Runtime {
  const config: RuntimeConfig = {
    id: type as unknown as RuntimeType,
    type: type as unknown as RuntimeType,
    name: type,
  };
  return new Runtime(config);
}

describe('DependencyResolver', () => {
  it('returns runtimes in dependency order (dependencies first)', () => {
    const resolver = new DependencyResolver();
    const memory = createRuntime('memory');
    const agent = createRuntime('agent');
    const plugin = createRuntime('plugin');

    const runtimes = new Map([
      ['agent' as RuntimeType, agent],
      ['memory' as RuntimeType, memory],
      ['plugin' as RuntimeType, plugin],
    ]);

    const order = resolver.resolve(runtimes, (type) => {
      const deps: Record<string, string[]> = {
        agent: ['memory'],
        plugin: ['memory', 'agent'],
        memory: [],
      };
      return deps[type] ?? [];
    });

    expect(order.indexOf(memory)).toBeLessThan(order.indexOf(agent));
    expect(order.indexOf(memory)).toBeLessThan(order.indexOf(plugin));
    expect(order.indexOf(agent)).toBeLessThan(order.indexOf(plugin));
  });

  it('preserves isolated runtimes without dependencies', () => {
    const resolver = new DependencyResolver();
    const mem = createRuntime('memory');
    const plugin = createRuntime('plugin');

    const order = resolver.resolve(
      new Map([
        ['memory' as RuntimeType, mem],
        ['plugin' as RuntimeType, plugin],
      ]),
      () => [],
    );

    expect(order).toContain(mem);
    expect(order).toContain(plugin);
  });

  it('throws RuntimeDependencyCycleError on circular dependency', () => {
    const resolver = new DependencyResolver();
    const mem = createRuntime('memory');
    const agent = createRuntime('agent');

    expect(() =>
      resolver.resolve(
        new Map([
          ['memory' as RuntimeType, mem],
          ['agent' as RuntimeType, agent],
        ]),
        (type) => {
          if (type === 'memory') return ['agent' as RuntimeType];
          if (type === 'agent') return ['memory' as RuntimeType];
          return [];
        },
      ),
    ).toThrow(RuntimeDependencyCycleError);
  });

  it('accepts missing non-strict dependencies gracefully', () => {
    const resolver = new DependencyResolver();
    const mem = createRuntime('memory');

    const order = resolver.resolve(new Map([['memory' as RuntimeType, mem]]), () => ['nonexistent' as RuntimeType]);

    expect(order).toHaveLength(1);
    expect(order[0]).toBe(mem);
  });

  it('throws MissingDependencyError in strict mode', () => {
    const resolver = new DependencyResolver({ strict: true });
    const mem = createRuntime('memory');

    expect(() =>
      resolver.resolve(new Map([['memory' as RuntimeType, mem]]), () => ['nonexistent' as RuntimeType]),
    ).toThrow();
  });

  it('handles complex diamond dependency graph', () => {
    const resolver = new DependencyResolver();
    const runtime = createRuntime('runtime');
    const memory = createRuntime('memory');
    const agent = createRuntime('agent');
    const plugin = createRuntime('plugin');

    // plugin depends on memory and agent; memory and agent depend on runtime
    const runtimes = new Map([
      ['runtime' as RuntimeType, runtime],
      ['memory' as RuntimeType, memory],
      ['agent' as RuntimeType, agent],
      ['plugin' as RuntimeType, plugin],
    ]);

    const order = resolver.resolve(runtimes, (type) => {
      const deps: Record<string, string[]> = {
        plugin: ['memory', 'agent'],
        memory: ['runtime'],
        agent: ['runtime'],
        runtime: [],
      };
      return deps[type] ?? [];
    });

    // runtime must come first, plugin last
    expect(order[0]).toBe(runtime);
    expect(order[order.length - 1]).toBe(plugin);
    expect(order.indexOf(runtime)).toBeLessThan(order.indexOf(memory));
    expect(order.indexOf(runtime)).toBeLessThan(order.indexOf(agent));
    expect(order.indexOf(memory)).toBeLessThan(order.indexOf(plugin));
    expect(order.indexOf(agent)).toBeLessThan(order.indexOf(plugin));
  });
});
