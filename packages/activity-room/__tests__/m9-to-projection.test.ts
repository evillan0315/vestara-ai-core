import { describe, expect, it } from 'vitest';
import { toProjectionRecord } from '../src/m9-to-projection';
import type { ActivityRecord } from '../src/m9-types';

function makeM9Record(overrides: Partial<ActivityRecord> = {}): ActivityRecord {
  return {
    activityId: 'act-1-test' as any,
    eventId: 'evt-1',
    sequenceNumber: 1,
    type: 'workflow.started',
    timestamp: '2026-01-01T00:00:00.000Z',
    actor: {
      type: 'system',
      id: 'workflow-engine',
      displayName: 'Workflow Engine',
    },
    source: 'workflow-engine',
    payload: { message: 'Workflow started' },
    visibility: 'all',
    ...overrides,
  };
}

describe('toProjectionRecord', () => {
  it('converts workflow.started to workflow kind', () => {
    const record = makeM9Record({ type: 'workflow.started' });
    const result = toProjectionRecord(record);

    expect(result.kind).toBe('workflow');
    expect(result.id).toBe('act-1-test');
    expect(result.sequence).toBe(1);
    expect(result.content).toBe('Workflow started');
  });

  it('converts task.started to task kind', () => {
    const record = makeM9Record({ type: 'task.started', taskId: 'task-1' as any });
    const result = toProjectionRecord(record);

    expect(result.kind).toBe('task');
  });

  it('converts agent.started to agent-message kind', () => {
    const record = makeM9Record({
      type: 'agent.started',
      actor: { type: 'agent', id: 'dev-1', displayName: 'Developer' },
    });
    const result = toProjectionRecord(record);

    expect(result.kind).toBe('agent-message');
    expect(result.agentId).toBe('dev-1');
  });

  it('converts human.message to agent-message kind', () => {
    const record = makeM9Record({
      type: 'human.message',
      actor: { type: 'human', id: 'user-1', displayName: 'User' },
    });
    const result = toProjectionRecord(record);

    expect(result.kind).toBe('agent-message');
  });

  it('sets effect to intervention on error', () => {
    const record = makeM9Record({
      type: 'task.failed',
      payload: { message: 'Failed', error: { message: 'Error details' } },
    });
    const result = toProjectionRecord(record);

    expect(result.effect).toBe('intervention');
  });

  it('includes output when present', () => {
    const record = makeM9Record({
      type: 'task.completed',
      payload: { message: 'Done', output: 'Result data' },
    });
    const result = toProjectionRecord(record);

    expect(result.output).toBe('Result data');
  });

  it('maps actorId to role', () => {
    const record = makeM9Record({
      actor: { type: 'agent', id: 'dev-1', displayName: 'Dev' },
      actorId: 'developer',
    });
    const result = toProjectionRecord(record);

    expect(result.actor.role).toBe('developer');
  });

  it('preserves workflowRunId as workflowId', () => {
    const record = makeM9Record({ workflowRunId: 'wf-1' as any });
    const result = toProjectionRecord(record);

    expect(result.workflowId).toBe('wf-1');
  });

  it('defaults kind to workflow for unknown types', () => {
    const record = makeM9Record({ type: 'system.event' as any });
    const result = toProjectionRecord(record);

    expect(result.kind).toBe('workflow');
  });

  it('sets empty content when message is missing', () => {
    const record = makeM9Record({ payload: {} });
    const result = toProjectionRecord(record);

    expect(result.content).toBe('');
  });
});
