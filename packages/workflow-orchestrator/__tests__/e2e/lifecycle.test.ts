import { describe, expect, it } from 'vitest';
import { DeterministicWorkflowClock } from '../e2e-support/clock';
import { beforeEvent, expectEventSequence, neverBefore } from '../e2e-support/event-sequence';
import { validateStageTransition, WorkflowStageLedger } from '../e2e-support/lifecycle';

describe('WFO-E2E-001A lifecycle contract', () => {
  it('replays a canonical successful workflow to the completed stage', () => {
    const ledger = new WorkflowStageLedger(new DeterministicWorkflowClock());
    for (const [to, reason] of [
      ['context', 'objective recorded'],
      ['planning', 'plan created'],
      ['review-pending', 'plan submitted'],
      ['approved', 'plan authorized'],
      ['ready', 'execution scheduled'],
      ['in-progress', 'tasks running'],
      ['reviewing', 'implementation reviewed'],
      ['verifying', 'implementation complete'],
      ['completed', 'verification passed'],
    ] as const) {
      ledger.transition(to, reason);
    }
    expect(ledger.current()).toBe('completed');
    expect(ledger.replay()).toBe('completed');
    expect(ledger.history()).toHaveLength(9);
  });

  it('replays a revision workflow: planning → review-pending → changes-requested → planning', () => {
    const ledger = new WorkflowStageLedger(new DeterministicWorkflowClock());
    ledger.transition('context', 'objective recorded');
    ledger.transition('planning', 'plan created');
    ledger.transition('review-pending', 'plan submitted');
    ledger.transition('changes-requested', 'review found missing tests');
    ledger.transition('planning', 'plan revised');
    expect(ledger.current()).toBe('planning');
    expect(ledger.replay()).toBe('planning');
  });

  it('rejects invalid transitions with explicit reasons', () => {
    const outcome = validateStageTransition('planning', 'completed');
    expect(outcome.allowed).toBe(false);
    expect(outcome.reason).toContain('invalid transition: planning → completed');
  });

  it('never completes from indeterminate evidence without a human override', () => {
    expect(validateStageTransition('indeterminate', 'completed').allowed).toBe(false);
    const overridden = validateStageTransition('indeterminate', 'completed', { override: true });
    expect(overridden.allowed).toBe(true);
    expect(overridden.reason).toContain('human policy override');
  });

  it('blocks terminal stages from continuing', () => {
    expect(validateStageTransition('completed', 'verifying').allowed).toBe(false);
    expect(validateStageTransition('cancelled', 'in-progress').allowed).toBe(false);
    expect(validateStageTransition('failed', 'completed').allowed).toBe(false);
  });

  it('allows repair transitions from verification and reviewing', () => {
    expect(validateStageTransition('verifying', 'changes-requested').allowed).toBe(true);
    expect(validateStageTransition('reviewing', 'changes-requested').allowed).toBe(true);
    expect(validateStageTransition('changes-requested', 'planning').allowed).toBe(true);
  });
});

describe('WFO-E2E event-order matcher', () => {
  const events = [
    { type: 'workflow.plan.created' },
    { type: 'workflow.plan.reviewed' },
    { type: 'workflow.plan.approved' },
    { type: 'task.started' },
    { type: 'verification.completed' },
    { type: 'workflow.completed' },
  ];

  it('accepts a valid partial ordering', () => {
    expectEventSequence(events).toSatisfy([
      beforeEvent('workflow.plan.created', 'workflow.plan.reviewed'),
      beforeEvent('workflow.plan.approved', 'task.started'),
      beforeEvent('verification.completed', 'workflow.completed'),
      neverBefore('approval.granted', 'capability.executed'),
    ]);
  });

  it('reports violations for a broken ordering', () => {
    const violations = expectEventSequence([{ type: 'task.started' }, { type: 'workflow.plan.approved' }]).violations([
      beforeEvent('workflow.plan.approved', 'task.started'),
    ]);
    expect(violations).toContain('expected workflow.plan.approved before task.started');
  });

  it('forbids guarded events before their guard', () => {
    const violations = expectEventSequence([{ type: 'capability.executed' }, { type: 'approval.granted' }]).violations([
      neverBefore('approval.granted', 'capability.executed'),
    ]);
    expect(violations).toContain('forbidden: capability.executed occurred before approval.granted');
  });
});
