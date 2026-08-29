import { VerificationProjector } from '@vestara/activity-projection';
import { describe, expect, it } from 'vitest';
import { sourceEvent } from '../helpers';

const projector = new VerificationProjector();

describe('VerificationProjector', () => {
  it('supports verification lifecycle events', () => {
    expect(projector.supports(sourceEvent({ type: 'harness.verification.completed' }))).toBe(true);
    expect(projector.supports(sourceEvent({ type: 'harness.verification-result' }))).toBe(true);
    expect(projector.supports(sourceEvent({ type: 'verification.failed' }))).toBe(true);
    expect(projector.supports(sourceEvent({ type: 'harness.agent-message' }))).toBe(false);
  });

  it('projects a verification conclusion with checks', () => {
    const [record] = projector.project(
      sourceEvent({
        type: 'harness.verification-result',
        verificationRunId: 'verification-turn-2',
        taskId: 'task-3',
        payload: {
          status: 'failed',
          confidence: 0.9,
          checks: [
            { name: 'repo-scope', status: 'failed', summary: 'scope mismatch' },
            { name: 'tests', status: 'passed', summary: 'ok' },
          ],
          evidence: [{ id: 'ev-1', kind: 'test', summary: 'run' }],
        },
      }),
    );
    if (record.kind !== 'verification') throw new Error('expected verification activity');
    expect(record.outcome).toBe('failed');
    expect(record.confidence).toBe(0.9);
    expect(record.checks).toEqual([
      { name: 'repo-scope', status: 'failed', summary: 'scope mismatch' },
      { name: 'tests', status: 'passed', summary: 'ok' },
    ]);
    expect(record.evidenceRefs).toEqual(['ev-1']);
    expect(record.verificationRunId).toBe('verification-turn-2');
  });

  it('projects a started verification as inconclusive', () => {
    const [record] = projector.project(sourceEvent({ type: 'harness.verification.started', payload: {} }));
    if (record.kind !== 'verification') throw new Error('expected verification activity');
    expect(record.outcome).toBe('inconclusive');
    expect(record.reason).toBe('verification started');
  });

  it('projects awaiting-approval as blocked and reopened as inconclusive', () => {
    const awaiting = projector.project(sourceEvent({ type: 'verification.awaiting-approval', payload: {} }))[0];
    if (awaiting.kind !== 'verification') throw new Error('expected verification activity');
    expect(awaiting.outcome).toBe('blocked');

    const reopened = projector.project(
      sourceEvent({ type: 'project.verification.reopened', payload: { reopenCount: 2 } }),
    )[0];
    if (reopened.kind !== 'verification') throw new Error('expected verification activity');
    expect(reopened.outcome).toBe('inconclusive');
  });
});
