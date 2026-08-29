import { describe, expect, it } from 'vitest';
import {
  DecisionPipeline,
  executionStage,
  type PipelinePrincipal,
  type PipelineRequest,
  permissionStage,
  policyStage,
  trustStage,
  verificationStage,
} from '../src/index';

const request: PipelineRequest = {
  id: 'req-1',
  operation: 'file.write',
  actor: 'runtime-a',
  targetType: 'file',
  targetId: 'f1',
};
const principal: PipelinePrincipal = { id: 'runtime-a', role: 'developer', runtimeType: 'agent' };

describe('DecisionPipeline', () => {
  it('runs the full chain and records history', async () => {
    const pipeline = new DecisionPipeline([
      permissionStage({ check: () => ({ allowed: true, role: 'developer', reason: 'ok' }) }),
      policyStage({ evaluate: () => ({ result: 'allow', reason: 'ok', matchedPolicies: [] }) }),
      executionStage({
        execute: () => ({ status: 'succeeded', summary: 'wrote file' }),
      }),
      verificationStage({ verify: () => ({ status: 'passed', summary: 'checks passed', checks: ['c1'] }) }),
      trustStage({ score: () => ({ score: 0.9, confidence: 0.8 }) }),
    ]);

    const outcome = await pipeline.run(request, principal);
    expect(outcome.errored).toBe(false);
    expect(outcome.context.permissionResult?.allowed).toBe(true);
    expect(outcome.context.policyDecision?.result).toBe('allow');
    expect(outcome.context.executionResult?.status).toBe('succeeded');
    expect(outcome.context.verificationResult?.status).toBe('passed');
    expect(outcome.context.trustRecord?.score).toBe(0.9);
    expect(outcome.context.historyRecord).toBeDefined();
    expect(pipeline.history.count()).toBe(1);
  });

  it('short-circuits when permission is denied', async () => {
    const pipeline = new DecisionPipeline([
      permissionStage({
        check: () => ({ allowed: false, role: 'viewer', reason: 'no write access' }),
      }),
      executionStage({ execute: () => ({ status: 'succeeded', summary: 'should not run' }) }),
    ]);

    const outcome = await pipeline.run(request, principal);
    expect(outcome.errored).toBe(false);
    expect(outcome.error).toContain('no write access');
    expect(outcome.context.executionResult).toBeUndefined();
    expect(outcome.history).toBeDefined();
  });

  it('returns an errored outcome when a stage throws', async () => {
    const pipeline = new DecisionPipeline([
      permissionStage({ check: () => ({ allowed: true, role: 'developer', reason: 'ok' }) }),
      executionStage({
        execute: () => {
          throw new Error('boom');
        },
      }),
    ]);

    const outcome = await pipeline.run(request, principal);
    expect(outcome.errored).toBe(true);
    expect(outcome.error).toBe('boom');
    expect(outcome.history).toBeDefined();
    expect(pipeline.history.count()).toBe(1);
  });

  it('applies stages in the fixed order regardless of registration order', async () => {
    const order: string[] = [];
    const pipeline = new DecisionPipeline([
      executionStage({
        execute: () => {
          order.push('execution');
          return { status: 'succeeded', summary: 'x' };
        },
      }),
      permissionStage({
        check: () => {
          order.push('permission');
          return { allowed: true, role: 'developer', reason: 'ok' };
        },
      }),
    ]);

    await pipeline.run(request, principal);
    expect(order).toEqual(['permission', 'execution']);
  });

  it('refuses to populate the same field twice', async () => {
    const pipeline = new DecisionPipeline([
      permissionStage({ check: () => ({ allowed: true, role: 'developer', reason: 'ok' }) }),
      {
        stage: 'execution',
        run: () => ({ field: 'permissionResult', value: { allowed: true, role: 'developer', reason: 'again' } }),
      },
    ]);

    const outcome = await pipeline.run(request, principal);
    expect(outcome.errored).toBe(true);
    expect(outcome.error).toContain('already populated');
  });

  it('rejects an unknown context field', async () => {
    const pipeline = new DecisionPipeline([
      {
        stage: 'execution',
        run: () => ({ field: 'bogus' as never, value: {} }),
      },
    ]);

    const outcome = await pipeline.run(request, principal);
    expect(outcome.errored).toBe(true);
    expect(outcome.error).toContain('Unknown context field');
  });

  it('records history as append-only', async () => {
    const pipeline = new DecisionPipeline([
      permissionStage({ check: () => ({ allowed: true, role: 'developer', reason: 'ok' }) }),
    ]);
    await pipeline.run(request, principal);
    await pipeline.run({ ...request, id: 'req-2' }, principal);
    expect(pipeline.history.count()).toBe(2);
    expect(pipeline.history.list()).toHaveLength(2);
  });
});
