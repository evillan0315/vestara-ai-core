import { describe, expect, it } from 'vitest';
import { HistoryRecorder } from '../src/history';
import { DecisionPipeline } from '../src/pipeline';

describe('decision pipeline contract', () => {
  it('runs an empty pipeline to a recorded, non-errored outcome', async () => {
    const pipeline = new DecisionPipeline();
    const outcome = await pipeline.run(
      { id: 'req-1', operation: 'read', actor: 'alice', targetType: 'repo', targetId: 'r1' },
      { id: 'alice', role: 'viewer' },
    );
    expect(outcome.errored).toBe(false);
    expect(outcome.history?.decisionId).toBe('req-1');
  });

  it('applies stage results into the context in order', async () => {
    const recorder = new HistoryRecorder();
    const pipeline = new DecisionPipeline([
      {
        stage: 'policy',
        run: () => ({ field: 'policyDecision', value: { decision: 'allow' } }),
      } as never,
    ]);
    expect(pipeline.hasStage('policy')).toBe(true);
    const outcome = await pipeline.run(
      { id: 'req-2', operation: 'write', actor: 'bob', targetType: 'repo', targetId: 'r2' },
      { id: 'bob', role: 'editor' },
    );
    expect(outcome.errored).toBe(false);
    expect(outcome.context.policyDecision).toMatchObject({ decision: 'allow' });
    expect(recorder.list()).toHaveLength(0);
  });
});
