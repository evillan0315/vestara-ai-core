import { describe, expect, it } from 'vitest';

describe('@vestara/registry', () => {
  it('exports REGISTRY with all runtime types', () => {
    const mod = require('../dist/index.js');
    expect(mod.REGISTRY).toBeDefined();
    expect(Object.keys(mod.REGISTRY).length).toBeGreaterThan(30);
  });

  it('includes core runtime types', () => {
    const mod = require('../dist/index.js');
    expect(mod.REGISTRY.runtime).toBeDefined();
    expect(mod.REGISTRY.agent).toBeDefined();
    expect(mod.REGISTRY.workspace).toBeDefined();
    expect(mod.REGISTRY.kernel).toBeDefined();
  });

  it('includes system runtime types', () => {
    const mod = require('../dist/index.js');
    expect(mod.REGISTRY['event-bus']).toBeDefined();
    expect(mod.REGISTRY.scheduler).toBeDefined();
    expect(mod.REGISTRY['job-manager']).toBeDefined();
    expect(mod.REGISTRY.permission).toBeDefined();
  });

  it('abstract runtime has no parent', () => {
    const mod = require('../dist/index.js');
    expect(mod.REGISTRY.runtime.parent).toBeNull();
  });

  it('agent extends runtime', () => {
    const mod = require('../dist/index.js');
    expect(mod.REGISTRY.agent.parent).toBe('runtime');
  });

  it('ai-agent extends agent', () => {
    const mod = require('../dist/index.js');
    expect(mod.REGISTRY['ai-agent'].parent).toBe('agent');
  });

  it('system runtimes have singleton true', () => {
    const mod = require('../dist/index.js');
    expect(mod.REGISTRY.kernel.singleton).toBe(true);
    expect(mod.REGISTRY['event-bus'].singleton).toBe(true);
    expect(mod.REGISTRY.scheduler.singleton).toBe(true);
  });

  it('agent runtimes have singleton false', () => {
    const mod = require('../dist/index.js');
    expect(mod.REGISTRY.agent.singleton).toBe(false);
    expect(mod.REGISTRY['ai-agent'].singleton).toBe(false);
  });

  it('getRuntimeDefinition returns definition', () => {
    const mod = require('../dist/index.js');
    const def = mod.getRuntimeDefinition('agent');
    expect(def.type).toBe('agent');
    expect(def.category).toBe('core');
  });

  it('getRuntimeDefinition throws for unknown type', () => {
    const mod = require('../dist/index.js');
    expect(() => mod.getRuntimeDefinition('unknown')).toThrow('Unknown runtime type');
  });

  it('getRuntimeDependencies returns dependencies', () => {
    const mod = require('../dist/index.js');
    const deps = mod.getRuntimeDependencies('workspace');
    expect(deps).toContain('memory');
    expect(deps).toContain('repository');
  });

  it('getRuntimeChildren returns direct children', () => {
    const mod = require('../dist/index.js');
    const children = mod.getRuntimeChildren('agent');
    expect(children).toContain('ai-agent');
  });

  it('getRuntimeTree returns type and all descendants', () => {
    const mod = require('../dist/index.js');
    const tree = mod.getRuntimeTree('system');
    expect(tree).toContain('system');
    expect(tree).toContain('kernel');
    expect(tree).toContain('scheduler');
    expect(tree).toContain('verification');
  });

  it('isSingleton returns true for singleton runtimes', () => {
    const mod = require('../dist/index.js');
    expect(mod.isSingleton('kernel')).toBe(true);
    expect(mod.isSingleton('workspace')).toBe(true);
  });

  it('isSingleton returns false for non-singleton runtimes', () => {
    const mod = require('../dist/index.js');
    expect(mod.isSingleton('agent')).toBe(false);
    expect(mod.isSingleton('tool')).toBe(false);
  });

  it('isSystemRuntime identifies system runtimes', () => {
    const mod = require('../dist/index.js');
    expect(mod.isSystemRuntime('kernel')).toBe(true);
    expect(mod.isSystemRuntime('event-bus')).toBe(true);
    expect(mod.isSystemRuntime('scheduler')).toBe(true);
    expect(mod.isSystemRuntime('permission')).toBe(true);
  });

  it('isSystemRuntime returns false for non-system runtimes', () => {
    const mod = require('../dist/index.js');
    expect(mod.isSystemRuntime('agent')).toBe(false);
    expect(mod.isSystemRuntime('workspace')).toBe(false);
    expect(mod.isSystemRuntime('widget')).toBe(false);
  });

  it('createRuntimeRegistry provides typed interface', () => {
    const mod = require('../dist/index.js');
    const registry = mod.createRuntimeRegistry();
    expect(registry.getDefinition('runtime').type).toBe('runtime');
    expect(registry.getAllTypes().length).toBeGreaterThan(30);
    expect(registry.getAllCoreTypes().length).toBeGreaterThan(0);
    expect(registry.getAllExtensionTypes()).toContain('widget');
  });

  it('runtime has lifecycle config', () => {
    const mod = require('../dist/index.js');
    expect(mod.REGISTRY.runtime.lifecycle.maxDegradedMs).toBe(300_000);
    expect(mod.REGISTRY.runtime.lifecycle.maxRecoveryAttempts).toBe(3);
  });

  it('system runtimes have shorter lifecycle config', () => {
    const mod = require('../dist/index.js');
    expect(mod.REGISTRY.kernel.lifecycle.maxDegradedMs).toBe(60_000);
    expect(mod.REGISTRY.kernel.lifecycle.maxRecoveryAttempts).toBe(5);
  });
});
