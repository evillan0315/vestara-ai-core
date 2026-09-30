/**
 * AR-STREAM-TOOL-001 — Tool lifecycle evidence without standalone stream rows.
 *
 * Product decision: tool.called / tool.succeeded / tool.failed remain
 * authoritative M9 execution evidence but must not become standalone
 * user-facing Activity Stream rows. This is a presentation/projection rule:
 * no M9 record is deleted or modified here.
 *
 * Proves at the durable/projection boundary:
 *   1. M9 retains all tool.* records with exact callID lineage.
 *   2. Raw recovery retains every tool identity (reload-safe evidence).
 *   3. Owning activity/execution detail still resolves exact tool operations
 *      by durable identity (the UI list exclusion never touches this path).
 *   4. tool.failed remains absent from Needs Attention (AR-ATTN-003 holds).
 *
 * List exclusion itself (standalone rows, all densities, counts) is proved
 * at the UI stream projection layer in
 * apps/workspace/src/pages/activity/M11CActivityStream.tool.test.tsx, which
 * consumes the raw recovery proved here. M10 aggregation and AR-COORD
 * grouping are unchanged.
 */

import { describe, expect, it } from 'vitest';
import { SqliteActivityStore } from '../src/m9-sqlite-store';
import type { ActivityEvent, ActivityRecord } from '../src/m9-types';
import { ProjectionRuntime } from '../src/m10-projection-runtime';

const SNAPSHOT_WINDOW = 50;

async function createStore(): Promise<SqliteActivityStore> {
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();
  return new SqliteActivityStore(new SQL.Database());
}

function toolEvent(
  lifecycle: 'called' | 'succeeded' | 'failed',
  callID: string,
  toolName: string,
  index: number,
): ActivityEvent {
  return {
    eventId: `tool.${lifecycle}:${callID}`,
    type: `tool.${lifecycle}` as ActivityEvent['type'],
    timestamp: new Date(Date.UTC(2026, 8, 24, 4, 0, index)).toISOString(),
    actor: { type: 'agent', id: 'developer', displayName: 'Developer' },
    source: 'runtime-session',
    payload: {
      message: `${toolName} ${lifecycle}`,
      data: { callID, toolName },
      ...(lifecycle === 'succeeded' ? { output: `${toolName} output for ${callID}` } : {}),
    },
    executionId: 'exec-tool-001' as ActivityEvent['executionId'],
  };
}

function agentEvent(type: 'agent.started' | 'agent.completed', index: number): ActivityEvent {
  return {
    eventId: `tool-001:${type}:${index}`,
    type,
    timestamp: new Date(Date.UTC(2026, 8, 24, 4, 1, index)).toISOString(),
    actor: { type: 'agent', id: 'developer', displayName: 'Developer' },
    source: 'agent-harness',
    payload: { message: type === 'agent.started' ? 'Agent started work' : 'Agent completed work' },
    executionId: 'exec-tool-001' as ActivityEvent['executionId'],
  };
}

async function seed(): Promise<{ store: SqliteActivityStore; records: readonly ActivityRecord[] }> {
  const store = await createStore();
  await store.append(agentEvent('agent.started', 1));
  await store.append(toolEvent('called', 'call-read-1', 'read', 2));
  await store.append(toolEvent('called', 'call-write-1', 'write', 3));
  await store.append(toolEvent('succeeded', 'call-read-1', 'read', 4));
  await store.append(toolEvent('succeeded', 'call-write-1', 'write', 5));
  await store.append(agentEvent('agent.completed', 6));
  await store.append(toolEvent('called', 'call-risky-1', 'bash', 7));
  await store.append(toolEvent('failed', 'call-risky-1', 'bash', 8));
  await store.append({
    eventId: 'tool-001:human:1',
    type: 'human.message',
    timestamp: new Date(Date.UTC(2026, 8, 24, 4, 2, 0)).toISOString(),
    actor: { type: 'human', id: 'local', displayName: 'Operator' },
    source: 'human-input',
    payload: { message: 'noted' },
  });
  return { store, records: await store.rebuild() };
}

describe('AR-STREAM-TOOL-001: tool evidence stays durable', () => {
  it('M9 retains every tool.* record with exact callID lineage', async () => {
    const { records } = await seed();
    expect(records).toHaveLength(9);

    const tools = records.filter((record) => record.type.startsWith('tool.'));
    expect(tools).toHaveLength(6);
    expect(tools.map((record) => record.eventId).sort()).toEqual(
      [
        'tool.called:call-read-1',
        'tool.called:call-write-1',
        'tool.called:call-risky-1',
        'tool.failed:call-risky-1',
        'tool.succeeded:call-read-1',
        'tool.succeeded:call-write-1',
      ].sort(),
    );
    for (const record of tools) {
      const data = record.payload.data as Record<string, unknown>;
      expect(typeof data.callID).toBe('string');
      expect(typeof data.toolName).toBe('string');
      expect(record.executionId).toBe('exec-tool-001');
    }
    // Lifecycle transitions for the same operation stay distinct records.
    const readOps = tools.filter((record) => (record.payload.data as Record<string, unknown>).callID === 'call-read-1');
    expect(readOps.map((record) => record.type).sort()).toEqual(['tool.called', 'tool.succeeded']);
  });

  it('raw recovery retains every tool identity for reload/correlation', async () => {
    const { records } = await seed();
    const runtime = new ProjectionRuntime();
    const projection = runtime.rebuild(records);

    const raw = runtime.getRawStream();
    expect(raw).toHaveLength(9);
    const toolRows = raw.filter((item) => item.kind === 'tool-call' || item.kind === 'tool-result');
    expect(toolRows).toHaveLength(6);
    for (const item of toolRows) {
      expect(item.streamItemId).toBe(`si-${String(item.activityId)}`);
      expect(item.streamItemId.startsWith('si-agg-')).toBe(false);
    }
    expect(toolRows.map((item) => item.tool?.callID).sort()).toEqual(
      ['call-read-1', 'call-read-1', 'call-risky-1', 'call-risky-1', 'call-write-1', 'call-write-1'].sort(),
    );

    // The M11A snapshot window carries tool evidence like any other record.
    const snapshot = raw.slice(-SNAPSHOT_WINDOW);
    expect(snapshot).toHaveLength(9);
    expect(snapshot.filter((item) => item.kind === 'tool-call' || item.kind === 'tool-result')).toHaveLength(6);
    expect(projection.room.cursor.sequenceNumber).toBe(9);
  });

  it('owning activity/execution detail still resolves exact tool operations', async () => {
    const { store, records } = await seed();
    const succeeded = records.find((record) => record.eventId === 'tool.succeeded:call-read-1');
    expect(succeeded).toBeDefined();

    // Detail surfaces resolve by durable identity, never via the list.
    const byActivity = await store.getByActivityId(String(succeeded!.activityId));
    expect(byActivity?.eventId).toBe('tool.succeeded:call-read-1');
    expect((byActivity!.payload.data as Record<string, unknown>).callID).toBe('call-read-1');
    expect((byActivity!.payload.data as Record<string, unknown>).toolName).toBe('read');
    const byEvent = await store.getByEventId('tool.failed:call-risky-1');
    expect(byEvent?.type).toBe('tool.failed');

    // Tool observations used by execution/activity detail survive verbatim.
    expect(byActivity!.payload.output).toBe('read output for call-read-1');
  });

  it('tool.failed remains absent from Needs Attention', async () => {
    const { records } = await seed();
    const runtime = new ProjectionRuntime();
    const projection = runtime.rebuild(records);
    expect(projection.attention).toHaveLength(0);

    // The failed operation is still immutable execution evidence in history.
    const failed = records.filter((record) => record.type === 'tool.failed');
    expect(failed).toHaveLength(1);
    expect(failed[0].eventId).toBe('tool.failed:call-risky-1');
  });
});
