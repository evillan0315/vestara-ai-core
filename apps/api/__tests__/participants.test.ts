import type { ActivityRecord } from '@vestara/activity-projection';
import type { AcceptanceBoundary } from '@vestara/workspace';
import { describe, expect, it } from 'vitest';
import { projectWorkflowParticipants } from '../src/participants.js';

function thread(id: string, role: string, status: string, stageIndex: number) {
  return { id, status, metadata: { workflowId: 'wf-1', role, agentId: `agent-${role}`, stageIndex } };
}

function record(threadId: string, kind: 'agent-message', messageKind: string, content: string): ActivityRecord {
  return {
    id: `r-${threadId}-${messageKind}`,
    sequence: 1,
    timestamp: '2026-08-12T10:00:00.000Z',
    actor: { type: 'agent', id: 'a', displayName: 'A' },
    kind,
    agentId: 'a',
    threadId,
    messageKind: messageKind as 'message',
    content,
    evidenceRefs: [],
  } as unknown as ActivityRecord;
}

function boundary(overrides: Partial<AcceptanceBoundary> = {}): AcceptanceBoundary {
  return {
    workflowId: 'wf-1',
    objective: 'A visual change approved by the Director must survive reload.',
    obligations: [
      { id: 'ob-1', description: 'the approved change is reconstructed after reload', source: 'interpretation' },
    ],
    materialUncertainties: [],
    derivedBy: 'planner',
    derivedAt: '2026-08-12T09:00:00.000Z',
    conditional: false,
    ...overrides,
  };
}

describe('workflow participant projection', () => {
  it('projects real participants with distinct execution states', () => {
    const projection = projectWorkflowParticipants({
      workflowId: 'wf-1',
      threads: [
        thread('t-planner', 'planner', 'completed', 0),
        thread('t-developer', 'developer', 'active', 1),
        thread('t-verifier', 'verifier', 'queued', 2),
        thread('t-reviewer', 'reviewer', 'queued', 3),
      ],
      records: [record('t-developer', 'agent-message', 'model-response', 'implementation complete')],
      boundary: boundary(),
    });

    expect(projection.participants.map((p) => [p.role, p.executionState])).toEqual([
      ['planner', 'completed'],
      ['developer', 'reasoning'],
      ['verifier', 'queued'],
      ['reviewer', 'queued'],
    ]);
  });

  it('keeps execution completion and conditional acceptance distinct', () => {
    // All stages completed, but acceptance is conditional — never collapsed.
    const projection = projectWorkflowParticipants({
      workflowId: 'wf-1',
      threads: [
        thread('t-planner', 'planner', 'completed', 0),
        thread('t-developer', 'developer', 'completed', 1),
        thread('t-verifier', 'verifier', 'completed', 2),
        thread('t-reviewer', 'reviewer', 'completed', 3),
      ],
      records: [],
      boundary: boundary({ conditional: true, materialUncertainties: ['whether "reload" means cold restart'] }),
    });

    expect(projection.participants.every((p) => p.executionState === 'completed')).toBe(true);
    expect(projection.acceptanceState.status).toBe('conditional');
  });

  it('derives satisfied acceptance only when terminal and unconditional', () => {
    const projection = projectWorkflowParticipants({
      workflowId: 'wf-1',
      threads: [
        thread('t-planner', 'planner', 'completed', 0),
        thread('t-developer', 'developer', 'completed', 1),
        thread('t-verifier', 'verifier', 'completed', 2),
        thread('t-reviewer', 'reviewer', 'completed', 3),
      ],
      records: [],
      boundary: boundary(),
    });
    expect(projection.acceptanceState.status).toBe('satisfied');
    expect(projection.acceptanceState.obligations).toHaveLength(1);
  });

  it('reports unset acceptance when no boundary exists and exposes last activity', () => {
    const projection = projectWorkflowParticipants({
      workflowId: 'wf-1',
      threads: [thread('t-planner', 'planner', 'active', 0)],
      records: [record('t-planner', 'agent-message', 'tool-result', 'read theme.tsx')],
      boundary: undefined,
    });
    expect(projection.acceptanceState.status).toBe('unset');
    expect(projection.participants[0]?.lastActivity).toBeDefined();
    expect(projection.participants[0]?.lastActivityAt).toBe('2026-08-12T10:00:00.000Z');
  });
});
