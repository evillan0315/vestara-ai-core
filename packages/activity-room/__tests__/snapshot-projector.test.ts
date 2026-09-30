/**
 * AR-SNAPSHOT-002 regression: M11A SnapshotProjector entity cardinality.
 *
 * Deterministic fixtures over a fake M9 history page source (implementing the
 * frozen AR-HISTORY-002 backward-page contract) with the REAL M10
 * single-record projection. No live database, no API, no UI.
 */

import { describe, expect, it } from 'vitest';
import type { ActivityRecord, ActivityType } from '../src/m9-types';
import { ProjectionRuntime } from '../src/m10-projection-runtime';
import type { StreamItem } from '../src/projection-types';
import { projectActivitySnapshot, type SnapshotProjectorDeps } from '../src/snapshot-projector';

const runtime = new ProjectionRuntime();

function record(sequenceNumber: number, type: ActivityType, extra: Partial<ActivityRecord> = {}): ActivityRecord {
  return {
    activityId: `act-${sequenceNumber}-fixture` as ActivityRecord['activityId'],
    eventId: `fixture-event-${sequenceNumber}`,
    sequenceNumber,
    type,
    timestamp: new Date(Date.UTC(2026, 8, 25, 12, 0, sequenceNumber % 60)).toISOString(),
    actor: { type: 'system', id: 'snapshot-test', displayName: 'Snapshot test' },
    source: 'system',
    payload: { message: `record ${sequenceNumber}` },
    visibility: 'all',
    ...extra,
  };
}

function toolRow(sequenceNumber: number, callID: string, conversationId: string, called: boolean): ActivityRecord {
  return record(sequenceNumber, called ? 'tool.called' : 'tool.succeeded', {
    payload: {
      message: `tool ${callID}`,
      data: { callID, toolName: 'bash', conversationId },
    },
  });
}

function parentCompleted(sequenceNumber: number, conversationId: string): ActivityRecord {
  return record(sequenceNumber, 'agent.completed', {
    payload: { message: 'Completed', data: { conversationId } },
  });
}

/** Fake M9 history source with AR-HISTORY-002 backward-page semantics. */
function fakeDeps(rows: readonly ActivityRecord[]): SnapshotProjectorDeps {
  const ordered = [...rows].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  return {
    fetchPage: async (beforeSequence: number, limit: number) => {
      const below = ordered.filter((row) => row.sequenceNumber < beforeSequence);
      return below.slice(-limit);
    },
    projectRecord: (recordItem: ActivityRecord) => runtime.projectRecord(recordItem),
  };
}

function sequences(items: readonly StreamItem[]): number[] {
  return items.map((item) => item.sequenceNumber);
}

function expectAscending(items: readonly StreamItem[]): void {
  expect(sequences(items)).toEqual([...sequences(items)].sort((a, b) => a - b));
}

/** Build an execution: started + N paired tool rows + completed, one lineage. */
function execution(startSeq: number, conversationId: string, pairs: number): ActivityRecord[] {
  const rows: ActivityRecord[] = [record(startSeq, 'agent.started')];
  let seq = startSeq;
  for (let i = 0; i < pairs; i += 1) {
    const callID = `call-${conversationId}-${i}`;
    rows.push(toolRow((seq += 1), callID, conversationId, true));
    rows.push(toolRow((seq += 1), callID, conversationId, false));
  }
  rows.push(parentCompleted(seq + 1, conversationId));
  return rows;
}

describe('AR-SNAPSHOT-002 SnapshotProjector', () => {
  it('A: operation-heavy newest execution does not starve parent entities', async () => {
    const rows: ActivityRecord[] = [];
    for (let i = 1; i <= 5; i += 1) {
      rows.push(record(i, 'human.message', { payload: { message: `message ${i}`, conversationId: `conv-${i}` } }));
    }
    rows.push(...execution(6, 'conv-heavy', 60));
    const selection = await projectActivitySnapshot(fakeDeps(rows), { capacity: 5, startBefore: 1000 });

    // 5 entities: completed + started + 3 newest messages — despite 120 tool
    // rows dominating the newest window. The old raw tail would have held ~2.
    expect(selection.entityCount).toBe(5);
    expect(selection.complete).toBe(true);
    expectAscending(selection.items);
    // Every tool row travels as evidence (zero slots consumed, none dropped).
    expect(selection.items.filter((item) => item.kind === 'tool-call').length).toBe(60);
    expect(selection.items.filter((item) => item.kind === 'tool-result').length).toBe(60);
    expect(selection.items.length).toBe(5 + 120);
    expect(
      selection.entities.find((entity) => entity.lineageKey === 'conversation:conv-heavy')?.operations,
    ).toHaveLength(60);
  });

  it('B: one parent with many operations consumes one entity slot', async () => {
    const rows = execution(1, 'conv-big', 200);
    const selection = await projectActivitySnapshot(fakeDeps(rows), { capacity: 5, startBefore: 1000 });

    expect(selection.entityCount).toBe(2); // started + completed
    const tools = selection.items.filter((item) => item.kind === 'tool-call' || item.kind === 'tool-result');
    expect(tools.length).toBe(400);
    expect(new Set(tools.map((item) => item.tool!.callID)).size).toBe(200);
    expect(selection.entities).toHaveLength(2);
    expect(selection.entities.find((entity) => entity.lineageKey === 'conversation:conv-big')?.operations).toHaveLength(
      200,
    );
    expectAscending(selection.items);
  });

  it('C: multiple parents with distinct lineages reconstruct with correct attachment', async () => {
    const rows = [...execution(1, 'conv-a', 3), ...execution(20, 'conv-b', 4)];
    const selection = await projectActivitySnapshot(fakeDeps(rows), { capacity: 10, startBefore: 1000 });

    expect(selection.entityCount).toBe(4);
    const tools = selection.items.filter((item) => item.tool);
    expect(tools.length).toBe(14);
    for (const tool of tools) {
      expect(tool.originConversationId === 'conv-a' || tool.originConversationId === 'conv-b').toBe(true);
    }
    expect(selection.entities.find((entity) => entity.lineageKey === 'conversation:conv-a')?.operations).toHaveLength(
      3,
    );
    expect(selection.entities.find((entity) => entity.lineageKey === 'conversation:conv-b')?.operations).toHaveLength(
      4,
    );
    expectAscending(selection.items);
  });

  it('attaches lifecycle rows split across pages and never crosses lineage', async () => {
    const rows: ActivityRecord[] = [
      record(1, 'human.message', { payload: { message: 'other', data: { conversationId: 'conv-other' } } }),
      toolRow(2, 'call-a', 'conv-a', true),
      toolRow(3, 'call-b', 'conv-b', true),
      toolRow(4, 'call-a', 'conv-a', false),
      parentCompleted(5, 'conv-a'),
      parentCompleted(6, 'conv-b'),
    ];
    const selection = await projectActivitySnapshot(fakeDeps(rows), { capacity: 2, pageSize: 3, startBefore: 1000 });
    const entityA = selection.entities.find((entity) => entity.lineageKey === 'conversation:conv-a');
    const entityB = selection.entities.find((entity) => entity.lineageKey === 'conversation:conv-b');
    expect(entityA?.operations.map((operation) => operation.operationId)).toEqual(['call-a']);
    expect(entityB?.operations.map((operation) => operation.operationId)).toEqual(['call-b']);
    expect(entityA?.operations[0]?.activityIds).toHaveLength(2);
    expect(entityA?.operations[0]?.status).toBe('completed');
    expectAscending(selection.items);
  });

  it('reports incomplete when the selected parent is outside the total scan budget', async () => {
    const rows: ActivityRecord[] = [parentCompleted(1, 'conv-outside')];
    for (let sequence = 2; sequence <= 80; sequence += 1) {
      rows.push(toolRow(sequence, `call-${sequence}`, 'conv-outside', sequence % 2 === 0));
    }
    const selection = await projectActivitySnapshot(fakeDeps(rows), {
      capacity: 1,
      pageSize: 10,
      maxPages: 2,
      startBefore: 1000,
    });
    expect(selection.entityCount).toBe(0);
    expect(selection.complete).toBe(false);
    expect(selection.entities).toEqual([]);
  });

  it('D: bounded scan is deterministic and fail-closed when the budget exhausts', async () => {
    const rows = execution(1, 'conv-far', 30);
    // maxPages=1 of 10 rows: newest 10 rows hold 9 tools + the completed
    // parent; capacity 5 is unreachable within budget.
    const partial = await projectActivitySnapshot(fakeDeps(rows), {
      capacity: 5,
      pageSize: 10,
      maxPages: 1,
      startBefore: 1000,
    });
    expect(partial.entityCount).toBe(1);
    expect(partial.complete).toBe(false);
    // Same inputs → same outputs (deterministic, no silent completion).
    const again = await projectActivitySnapshot(fakeDeps(rows), {
      capacity: 5,
      pageSize: 10,
      maxPages: 1,
      startBefore: 1000,
    });
    expect(sequences(again.items)).toEqual(sequences(partial.items));

    // Sufficient budget recovers the parents deterministically.
    const full = await projectActivitySnapshot(fakeDeps(rows), {
      capacity: 5,
      pageSize: 10,
      maxPages: 20,
      startBefore: 1000,
    });
    expect(full.entityCount).toBe(2); // started + completed
    expect(full.complete).toBe(true);
  });

  it('E/F: canonical ascending order and frontier-independent selection', async () => {
    const rows = execution(1, 'conv-ord', 5);
    const near = await projectActivitySnapshot(fakeDeps(rows), { capacity: 5, startBefore: 13 });
    const far = await projectActivitySnapshot(fakeDeps(rows), { capacity: 5, startBefore: 100000 });
    // Frontier position does not change membership: identical selection far
    // above the max sequence proves independence from the frontier value.
    expect(sequences(far.items)).toEqual(sequences(near.items));
    expectAscending(far.items);
    expect(far.oldestEntitySequence).toBe(near.oldestEntitySequence);
  });

  it('G: snapshot composes with Load Older History without gaps or duplicates', async () => {
    const rows: ActivityRecord[] = [];
    for (let i = 1; i <= 8; i += 1) rows.push(record(i, 'human.message'));
    rows.push(...execution(9, 'conv-g', 4));
    const deps = fakeDeps(rows);
    const selection = await projectActivitySnapshot(deps, { capacity: 4, startBefore: 1000 });

    const heldIds = new Set(selection.items.map((item) => item.activityId));
    const oldestHeld = Math.min(...sequences(selection.items));
    // Simulate one Load Older History page below the held window.
    const older = await deps.fetchPage(oldestHeld, 50);
    expect(older.length).toBeGreaterThan(0);
    for (const row of older) expect(heldIds.has(String(row.activityId))).toBe(false);
    const union = [...sequences(selection.items), ...older.map((row) => row.sequenceNumber)].sort((a, b) => a - b);
    expect(new Set(union).size).toBe(union.length);
    // Contiguous: every sequence between min and max present exactly once.
    expect(union).toEqual(Array.from({ length: union.length }, (_, i) => union[0]! + i));
  });

  it('I: muted/telemetry rows are recovered as entities; filtering stays downstream', async () => {
    const rows = [record(1, 'system.event'), record(2, 'task.runnable'), record(3, 'human.message')];
    const selection = await projectActivitySnapshot(fakeDeps(rows), { capacity: 5, startBefore: 1000 });
    // Recovery includes log/telemetry kinds — hiding them is presentation's job.
    expect(selection.entityCount).toBe(3);
    expect(selection.items.some((item) => item.kind === 'telemetry' || item.kind === 'log')).toBe(true);
  });

  it('J: zero-operation control behaves as before', async () => {
    const rows: ActivityRecord[] = [];
    for (let i = 1; i <= 8; i += 1) rows.push(record(i, 'human.message'));
    const selection = await projectActivitySnapshot(fakeDeps(rows), { capacity: 5, startBefore: 1000 });
    expect(selection.entityCount).toBe(5);
    expect(sequences(selection.items)).toEqual([4, 5, 6, 7, 8]);
    expect(selection.complete).toBe(true);
  });
});
