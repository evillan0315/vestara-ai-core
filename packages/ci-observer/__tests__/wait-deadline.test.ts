import { describe, expect, it } from 'vitest';
import { reconcileWait } from '../src/reconcile';
import { evaluateWaitDeadline } from '../src/wait-deadline';

const NOW = Date.parse('2026-09-16T01:00:00.000Z');
const now = () => NOW;
const POLICY = { deadlineMs: 45 * 60 * 1000 };

describe('evaluateWaitDeadline', () => {
  it('marks a resumed wait resolved regardless of age', () => {
    const assessment = evaluateWaitDeadline(
      { suspendedAt: '2026-09-15T00:00:00.000Z', resumedAt: '2026-09-15T00:05:00.000Z' },
      POLICY,
      now,
    );
    expect(assessment.state).toBe('resolved');
  });

  it('marks a recent unresolved wait active', () => {
    const assessment = evaluateWaitDeadline({ suspendedAt: '2026-09-16T00:45:00.000Z' }, POLICY, now);
    expect(assessment.state).toBe('active');
    expect(assessment.ageMs).toBe(15 * 60 * 1000);
  });

  it('marks an unresolved wait past the deadline stale', () => {
    const assessment = evaluateWaitDeadline({ suspendedAt: '2026-09-16T00:00:00.000Z' }, POLICY, now);
    expect(assessment.state).toBe('stale');
    expect(assessment.ageMs).toBe(60 * 60 * 1000);
    expect(assessment.reason).toMatch(/deadline/i);
  });

  it('never treats an unparseable suspension time as healthy', () => {
    const assessment = evaluateWaitDeadline({ suspendedAt: 'not-a-date' }, POLICY, now);
    expect(assessment.state).toBe('unknown');
  });
});

describe('reconcileWait', () => {
  const stale = evaluateWaitDeadline({ suspendedAt: '2026-09-16T00:00:00.000Z' }, POLICY, now);
  const active = evaluateWaitDeadline({ suspendedAt: '2026-09-16T00:45:00.000Z' }, POLICY, now);

  it('does nothing for an active or resolved wait', () => {
    expect(reconcileWait({ waitRef: 'w', deadline: active }).action).toBe('none');
    expect(reconcileWait({ waitRef: 'w', deadline: { ...stale, state: 'resolved' } }).action).toBe('none');
  });

  it('holds when no run was observed for a stale wait', () => {
    const decision = reconcileWait({ waitRef: 'w', deadline: stale });
    expect(decision.action).toBe('hold');
    expect(decision.reason).toContain('no provider run');
  });

  it('recommends attaching an observed run, never resuming', () => {
    const decision = reconcileWait({ waitRef: 'w', deadline: stale, observation: { runId: 'run-7' } });
    expect(decision.action).toBe('attach-run');
    expect(decision.runRef).toBe('run-7');
    expect(decision.action).not.toBe('none');
  });

  it('awaits completion when a run is already attached', () => {
    const decision = reconcileWait({
      waitRef: 'w',
      runRef: 'run-7',
      deadline: stale,
      observation: { runId: 'run-7', status: 'completed', conclusion: 'failure' },
    });
    expect(decision.action).toBe('await-completion');
    expect(decision.reason).toContain('lost');
  });

  it('holds for an unknown wait age', () => {
    const decision = reconcileWait({ waitRef: 'w', deadline: { ...stale, state: 'unknown' } });
    expect(decision.action).toBe('hold');
  });
});
