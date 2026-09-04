import { ACTIVITY_KINDS, resolveActivityActor, type WorkflowActivity } from '@vestara/activity-room';
import { describe, expect, it } from 'vitest';
import { sourceEvent } from './helpers';

describe('activity contracts', () => {
  it('declares the supported activity kinds including organizational acceptance', () => {
    expect(ACTIVITY_KINDS).toEqual(['workflow', 'task', 'agent-message', 'test', 'verification', 'acceptance']);
  });

  it('maps user authority to a human actor', () => {
    const actor = resolveActivityActor(
      sourceEvent({ type: 'harness.user-message', authority: 'user', actorId: 'console-user' }),
    );
    expect(actor).toEqual({ type: 'human', id: 'console-user', displayName: 'console-user', role: 'user' });
  });

  it('maps agent authority to an agent actor', () => {
    const actor = resolveActivityActor(
      sourceEvent({ type: 'harness.agent-message', authority: 'agent', actorId: 'engineer' }),
    );
    expect(actor.type).toBe('agent');
  });

  it('maps system and verification authority to a system actor', () => {
    for (const authority of ['system', 'policy', 'verification'] as const) {
      const actor = resolveActivityActor(sourceEvent({ type: 'x', authority }));
      expect(actor.type).toBe('system');
    }
  });

  it('carries the typed envelope on every record kind', () => {
    const record: WorkflowActivity = {
      id: 'activity:1:workflow',
      sequence: 1,
      timestamp: '2026-08-06T12:00:00.000Z',
      actor: { type: 'system', id: 'workflow-orchestrator', displayName: 'workflow-orchestrator', role: 'system' },
      kind: 'workflow',
      workflowId: 'wfo-001',
      previousState: 'draft',
      currentState: 'executing',
      reason: 'project phase changed',
      authoritative: true,
      observed: false,
      evidenceRefs: [],
    };
    expect(record.kind).toBe('workflow');
    expect(record.workflowId).toBe('wfo-001');
  });
});
