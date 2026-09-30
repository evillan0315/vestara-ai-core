import { describe, expect, it } from 'vitest';
import { projectAttentionEntries } from '../src/attention';
import type { ActivityRecord as LegacyActivityRecord } from '../src/contracts';
import type { ActivityRecord as M9ActivityRecord } from '../src/m9-types';
import { ProjectionRuntime } from '../src/m10-projection-runtime';
import { ACTIVITY_MIGRATIONS } from '../src/migrations';

function m9ToolRecord(
  sequenceNumber: number,
  type: M9ActivityRecord['type'],
  callID: string,
  toolName = 'bash',
): M9ActivityRecord {
  return {
    activityId: `activity-${sequenceNumber}` as M9ActivityRecord['activityId'],
    eventId: `tool.${type === 'tool.called' ? 'called' : type === 'tool.succeeded' ? 'succeeded' : 'failed'}:${callID}`,
    sequenceNumber,
    type,
    timestamp: `2026-09-24T00:00:0${sequenceNumber}.000Z`,
    actor: { type: 'agent', id: 'vestara', displayName: 'vestara' },
    source: 'runtime-session',
    payload: { message: `${toolName} ${type}`, data: { callID, toolName } },
    visibility: 'all',
  };
}

function m9TaskFailed(sequenceNumber: number): M9ActivityRecord {
  return {
    activityId: `activity-${sequenceNumber}` as M9ActivityRecord['activityId'],
    eventId: `task-failed-${sequenceNumber}`,
    sequenceNumber,
    type: 'task.failed',
    timestamp: `2026-09-24T00:01:0${sequenceNumber}.000Z`,
    workflowRunId: 'workflow-1' as M9ActivityRecord['workflowRunId'],
    taskId: 'task-1' as M9ActivityRecord['taskId'],
    actor: { type: 'agent', id: 'vestara', displayName: 'vestara' },
    source: 'workflow-engine',
    payload: { message: 'Task failed', error: { message: 'Task failed' } },
    visibility: 'all',
  };
}

function legacyToolResult(sequence: number, status: 'completed' | 'failed', callID: string): LegacyActivityRecord {
  return {
    id: `tool-result-${sequence}`,
    sequence,
    timestamp: `2026-09-24T00:00:0${sequence}.000Z`,
    actor: { type: 'agent', id: 'vestara', displayName: 'vestara' },
    evidenceRefs: [],
    kind: 'tool-result',
    agentId: 'vestara',
    toolName: 'bash',
    callID,
    status,
  };
}

describe('AR-ATTN-003: tool-call errors excluded from Needs Attention', () => {
  it('keeps historical tool.failed queryable in Activity stream history', () => {
    const records = [m9ToolRecord(1, 'tool.called', 'call-1'), m9ToolRecord(2, 'tool.failed', 'call-1')];
    const projection = new ProjectionRuntime().rebuild(records);
    const toolItems = projection.stream.filter((item) => item.tool?.callID === 'call-1');
    expect(toolItems).toHaveLength(2);
    expect(toolItems.map((item) => item.tool?.status).sort()).toEqual(['failed', 'started']);
  });

  it('unresolved tool.failed produces zero Needs Attention', () => {
    const projection = new ProjectionRuntime().rebuild([
      m9ToolRecord(1, 'tool.called', 'call-9'),
      m9ToolRecord(2, 'tool.failed', 'call-9'),
    ]);
    expect(projection.attention).toHaveLength(0);
  });

  it('tool.failed then tool.succeeded history remains intact without fabricated events', () => {
    const records = [m9ToolRecord(1, 'tool.called', 'call-2'), m9ToolRecord(2, 'tool.failed', 'call-2')];
    const before = new ProjectionRuntime().rebuild(records);
    expect(before.stream.filter((item) => item.tool?.callID === 'call-2')).toHaveLength(2);

    const withSuccess = [...records, m9ToolRecord(3, 'tool.succeeded', 'call-2')];
    const after = new ProjectionRuntime().rebuild(withSuccess);
    const toolItems = after.stream.filter((item) => item.tool?.callID === 'call-2');
    expect(toolItems).toHaveLength(3);
    expect(toolItems.map((item) => item.tool?.status).sort()).toEqual(['completed', 'failed', 'started']);
    expect(after.attention.filter((entry) => entry.reason === 'tool-failed')).toHaveLength(0);
  });

  it('multiple historical tool failures contribute zero attention items', () => {
    const records = [
      m9ToolRecord(1, 'tool.called', 'call-a'),
      m9ToolRecord(2, 'tool.failed', 'call-a'),
      m9ToolRecord(3, 'tool.called', 'call-b'),
      m9ToolRecord(4, 'tool.failed', 'call-b'),
      m9ToolRecord(5, 'tool.called', 'call-c'),
      m9ToolRecord(6, 'tool.failed', 'call-c'),
    ];
    const projection = new ProjectionRuntime().rebuild(records);
    expect(projection.stream.filter((item) => item.tool?.status === 'failed')).toHaveLength(3);
    expect(projection.attention).toHaveLength(0);
  });

  it('unrelated attention sources still appear and count correctly', () => {
    const projection = new ProjectionRuntime().rebuild([
      m9ToolRecord(1, 'tool.called', 'call-1'),
      m9ToolRecord(2, 'tool.failed', 'call-1'),
      m9TaskFailed(3),
    ]);
    expect(projection.attention).toHaveLength(1);
    expect(projection.attention[0]).toMatchObject({ reason: 'task-failed' });
  });

  it('legacy tool-result failures contribute zero attention while other sources remain', () => {
    const failedOnly = projectAttentionEntries([legacyToolResult(1, 'failed', 'call-1')]);
    expect(failedOnly).toHaveLength(0);

    const mixed = projectAttentionEntries([
      legacyToolResult(1, 'failed', 'call-1'),
      legacyToolResult(2, 'failed', 'call-2'),
      {
        id: 'task-1',
        sequence: 3,
        timestamp: '2026-09-24T00:00:03.000Z',
        actor: { type: 'agent', id: 'vestara', displayName: 'vestara' },
        evidenceRefs: [],
        kind: 'task',
        taskId: 'task-1',
        previousStatus: 'in-progress',
        status: 'failed',
        summary: 'Task failed',
      },
    ]);
    expect(mixed).toHaveLength(1);
    expect(mixed[0]).toMatchObject({ reason: 'task-failed' });
  });

  it('M9 rows are unchanged by the projection policy', () => {
    const records = [m9ToolRecord(1, 'tool.called', 'call-1'), m9ToolRecord(2, 'tool.failed', 'call-1')];
    const snapshot = structuredClone(records);
    new ProjectionRuntime().rebuild(records);
    expect(records).toEqual(snapshot);
    expect(records[1].type).toBe('tool.failed');
    expect(records[1].eventId).toBe('tool.failed:call-1');
    expect(records[1].payload.data).toMatchObject({ callID: 'call-1', toolName: 'bash' });
  });

  it('introduces no persistence or history migration', () => {
    const migrationNames = ACTIVITY_MIGRATIONS.map((migration) => migration.name);
    expect(migrationNames).toEqual(['activity_events.baseline']);
    expect(
      migrationNames.some((name) => name.toLowerCase().includes('attn') || name.toLowerCase().includes('tool')),
    ).toBe(false);
  });
});
