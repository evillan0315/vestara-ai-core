import type { ActivityRecord, ActivitySourceEvent, WorkflowActivity } from '@vestara/activity-projection';

let counter = 0;

/** Build a minimal normalized source event for projector and service tests. */
export function sourceEvent(overrides: Partial<ActivitySourceEvent> & { readonly type: string }): ActivitySourceEvent {
  counter += 1;
  return {
    id: `event-${counter}`,
    at: '2026-08-06T12:00:00.000Z',
    actorId: 'system',
    authority: 'system',
    payload: {},
    ...overrides,
  };
}

/** Build a minimal workflow activity record for store tests. */
export function workflowRecord(
  overrides: Partial<WorkflowActivity> & { readonly id: string; readonly sequence: number },
): ActivityRecord {
  return {
    id: overrides.id,
    sequence: overrides.sequence,
    timestamp: '2026-08-06T12:00:00.000Z',
    actor: { type: 'system', id: 'workflow-orchestrator', displayName: 'workflow-orchestrator', role: 'system' },
    kind: 'workflow',
    workflowId: 'wfo-001',
    previousState: 'draft',
    currentState: 'executing',
    reason: 'phase changed',
    authoritative: true,
    observed: false,
    evidenceRefs: [],
    ...overrides,
  };
}
