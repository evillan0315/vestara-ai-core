import { afterEach, describe, expect, it } from 'vitest';
import { DefaultKernel } from '../src/index';

const kernels: DefaultKernel[] = [];
afterEach(async () => {
  for (const kernel of kernels.splice(0)) await kernel.shutdown();
});

describe('Kernel decision pipeline (ADR-007 full chain)', () => {
  it('denies when permission is not granted and short-circuits', async () => {
    const kernel = new DefaultKernel();
    kernels.push(kernel);
    await kernel.boot({});
    const out = await kernel.decisionPipeline.run(
      { id: 'req-1', operation: 'resource:write', actor: 'runtime-a', targetType: 'file', targetId: 'f1' },
      { id: 'runtime-a', role: 'developer', runtimeType: 'agent' },
    );
    expect(out.errored).toBe(false);
    expect(out.error).toBe('denied');
    expect(out.context.policyDecision).toBeUndefined();
  });

  it('runs the full chain when permission is granted', async () => {
    const kernel = new DefaultKernel();
    kernels.push(kernel);
    await kernel.boot({});
    kernel.permissions.grant('runtime-a', 'admin', 'file', 'f1', 'kernel');

    const out = await kernel.decisionPipeline.run(
      { id: 'req-2', operation: 'resource:write', actor: 'runtime-a', targetType: 'file', targetId: 'f1' },
      { id: 'runtime-a', role: 'admin', runtimeType: 'agent' },
    );
    expect(out.errored).toBe(false);
    expect(out.error).toBeUndefined();
    expect(out.context.permissionResult?.allowed).toBe(true);
    expect(out.context.policyDecision).toBeDefined();
    expect(out.context.executionResult).toBeDefined();
    expect(out.context.verificationResult).toBeDefined();
    expect(out.context.trustRecord).toBeDefined();
    expect(out.context.historyRecord).toBeDefined();
    expect(kernel.decisionPipeline.history.count()).toBe(1);
  });

  it('records history as append-only across decisions', async () => {
    const kernel = new DefaultKernel();
    kernels.push(kernel);
    await kernel.boot({});
    kernel.permissions.grant('runtime-a', 'admin', 'file', 'f1', 'kernel');
    await kernel.decisionPipeline.run(
      { id: 'req-3', operation: 'resource:write', actor: 'runtime-a', targetType: 'file', targetId: 'f1' },
      { id: 'runtime-a', role: 'admin', runtimeType: 'agent' },
    );
    await kernel.decisionPipeline.run(
      { id: 'req-4', operation: 'resource:read', actor: 'runtime-a', targetType: 'file', targetId: 'f1' },
      { id: 'runtime-a', role: 'admin', runtimeType: 'agent' },
    );
    expect(kernel.decisionPipeline.history.count()).toBe(2);
    expect(kernel.decisionPipeline.history.list()).toHaveLength(2);
  });
});
