import { fromEngineeringTruthEvent, fromOrchestrationEvent } from '@vestara/activity-projection';
import { describe, expect, it } from 'vitest';

describe('fromEngineeringTruthEvent', () => {
  it('normalizes the authoritative truth event shape', () => {
    const event = fromEngineeringTruthEvent({
      id: 'engineering-event-1',
      seq: 42,
      type: 'harness.verification-result',
      at: '2026-08-06T12:00:00.000Z',
      actorId: 'verification-runtime',
      authority: 'verification',
      taskId: 'task-9',
      threadId: 'thread-1',
      turnId: 'turn-2',
      verificationRunId: 'verification-turn-2',
      correlationId: 'corr-1',
      payload: { status: 'passed' },
    });
    expect(event).toMatchObject({
      id: 'engineering-event-1',
      type: 'harness.verification-result',
      at: '2026-08-06T12:00:00.000Z',
      actorId: 'verification-runtime',
      authority: 'verification',
      taskId: 'task-9',
      threadId: 'thread-1',
      turnId: 'turn-2',
      verificationRunId: 'verification-turn-2',
      correlationId: 'corr-1',
      sourceSequence: 42,
      payload: { status: 'passed' },
    });
  });
});

describe('fromOrchestrationEvent', () => {
  it('maps projectId to workflowId and keeps planId in the payload', () => {
    const event = fromOrchestrationEvent({
      type: 'task.started',
      at: '2026-08-06T12:00:00.000Z',
      projectId: 'wfo-001',
      planId: 'plan-1',
      taskId: 'task-3',
      status: 'assigned',
    });
    expect(event.workflowId).toBe('wfo-001');
    expect(event.taskId).toBe('task-3');
    expect(event.authority).toBe('system');
    expect(event.payload).toEqual({ planId: 'plan-1', status: 'assigned' });
    expect(event.type).toBe('task.started');
  });

  it('uses the workflow observer as actor for observation events', () => {
    const event = fromOrchestrationEvent({
      type: 'workflow.transition.recommended',
      projectId: 'wfo-001',
      from: 'executing',
      to: 'verifying',
      action: 'proceed',
      evidenceRefs: ['ev-1', 'ev-2'],
    });
    expect(event.actorId).toBe('workflow-observer');
    expect(event.payload).toMatchObject({ from: 'executing', to: 'verifying', action: 'proceed' });
    expect(event.payload.evidenceRefs).toEqual(['ev-1', 'ev-2']);
  });

  it('falls back to a generated timestamp when none is present', () => {
    const event = fromOrchestrationEvent({ type: 'project.completed', projectId: 'wfo-001' });
    expect(new Date(event.at).getTime()).not.toBeNaN();
  });
});
