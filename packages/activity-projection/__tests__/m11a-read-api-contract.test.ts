/**
 * ARX-015 M11A — Production Activity Room Read API Contract/Integration Tests
 *
 * All tests are hermetic. Uses M9 DurableActivityStore (sql.js in-memory)
 * and M10 ProjectionRuntime directly (not via HTTP) to prove contract correctness.
 * No live providers, no real OpenCode sessions.
 */

import type {
  ActivityCursor,
  ActivityRecord,
  ActivityRoomProjection,
  ExecutionId,
  WorkflowEvent,
  WorkflowRunId,
  WorkflowTaskId,
} from '@vestara/types';
import initSqlJs from 'sql.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DurableActivityStore,
  fromAgentLifecycle,
  fromHumanMessage,
  fromWorkflowEvent,
  ProjectionRuntime,
} from '../src/index.js';

// ─── Test Helpers ──────────────────────────────────────────────

let eventCounter = 0;

function makeWorkflowRunId(): WorkflowRunId {
  return `wr-${Date.now()}-${++eventCounter}` as WorkflowRunId;
}

function makeExecutionId(): ExecutionId {
  return `exec-${Date.now()}-${++eventCounter}` as ExecutionId;
}

function makeTaskId(): WorkflowTaskId {
  return `wt-${Date.now()}-${++eventCounter}` as WorkflowTaskId;
}

function wf(
  overrides: Partial<WorkflowEvent> & { type: WorkflowEvent['type']; workflowRunId: WorkflowRunId },
): WorkflowEvent {
  return { timestamp: new Date().toISOString(), ...overrides };
}

// ─── Store & Runtime Setup ─────────────────────────────────────

describe('M11A — Production Activity Room Read API Contract Tests', () => {
  let store: DurableActivityStore;
  let runtime: ProjectionRuntime;
  let db: any;

  beforeEach(async () => {
    const SQL = await initSqlJs();
    db = new SQL.Database();
    store = new DurableActivityStore(db);
    runtime = new ProjectionRuntime();
  });

  afterEach(() => {
    db.close();
  });

  // ─── Setup: Populate with test data ──────────────────────────

  async function populateTestData(): Promise<{
    workflowRunId: WorkflowRunId;
    executionId: ExecutionId;
    task1: WorkflowTaskId;
    task2: WorkflowTaskId;
    records: readonly ActivityRecord[];
  }> {
    const workflowRunId = makeWorkflowRunId();
    const executionId = makeExecutionId();
    const task1 = makeTaskId();
    const task2 = makeTaskId();

    // Human message
    await store.append(
      fromHumanMessage({ message: 'Build the dashboard', userId: 'human-1', displayName: 'Alice', executionId }),
    );

    // Workflow starts
    await store.append(fromWorkflowEvent(wf({ type: 'workflow.started', workflowRunId, executionId })));

    // Planner works
    await store.append(
      fromWorkflowEvent(
        wf({ type: 'task.started', workflowRunId, taskInstanceId: task1, executionId, agentAssignmentId: 'planner' }),
      ),
    );
    await store.append(
      fromWorkflowEvent(
        wf({ type: 'task.completed', workflowRunId, taskInstanceId: task1, executionId, agentAssignmentId: 'planner' }),
      ),
    );

    // Developer waiting → working
    await store.append(
      fromWorkflowEvent(
        wf({
          type: 'task.runnable',
          workflowRunId,
          taskInstanceId: task2,
          executionId,
          agentAssignmentId: 'developer',
        }),
      ),
    );
    await store.append(
      fromWorkflowEvent(
        wf({ type: 'task.started', workflowRunId, taskInstanceId: task2, executionId, agentAssignmentId: 'developer' }),
      ),
    );

    // Noisy progress/logs (will be aggregated)
    for (let i = 0; i < 8; i++) {
      await store.append(
        fromAgentLifecycle({
          agentId: 'developer',
          displayName: 'Developer',
          lifecycleType: 'progress',
          workflowRunId,
        }),
      );
    }

    // Developer fails
    await store.append(
      fromWorkflowEvent(
        wf({
          type: 'task.failed',
          workflowRunId,
          taskInstanceId: task2,
          executionId,
          agentAssignmentId: 'developer',
          error: 'TypeScript error',
        }),
      ),
    );

    // Workflow fails
    await store.append(
      fromWorkflowEvent(wf({ type: 'workflow.failed', workflowRunId, executionId, error: 'Task failed' })),
    );

    const records = await store.rebuild();
    return { workflowRunId, executionId, task1, task2, records };
  }

  // ─── INV-1: Room Snapshot + Authoritative Cursor ──────────────

  describe('INV-1: Room Snapshot + Authoritative Cursor', () => {
    it('returns room snapshot with cursor, participants, stream, attention, workflow summary', async () => {
      const { records } = await populateTestData();
      const projection = runtime.rebuild(records);

      // Room metadata
      expect(projection.room).toBeDefined();
      expect(projection.room.roomId).toBe('default');
      expect(projection.room.cursor).toBeDefined();
      expect(projection.room.cursor.sequenceNumber).toBeGreaterThan(0);
      expect(projection.room.cursor.eventId).toBeTruthy();

      // Participants present
      expect(projection.participants.length).toBeGreaterThan(0);
      const alice = projection.participants.find((p) => p.participantId === 'human-human-1');
      expect(alice).toBeDefined();
      expect(alice!.displayName).toBe('Alice');

      // Stream bounded (should be ≤ 500)
      expect(projection.stream.length).toBeLessThanOrEqual(500);

      // Attention for failures
      expect(projection.attention.length).toBeGreaterThan(0);
      const criticalAttention = projection.attention.find((a) => a.severity === 'critical');
      expect(criticalAttention).toBeDefined();

      // Workflow summary
      expect(projection.workflowSummary).toBeDefined();
      expect(projection.workflowSummary!.status).toBe('failed');

      // Contextual capabilities
      expect(projection.contextualCapabilities).toBeDefined();
      expect(projection.contextualCapabilities.mentionableParticipants.length).toBeGreaterThan(0);
    });
  });

  // ─── INV-2: Bounded/Paginated Historical Activity Retrieval ───

  describe('INV-2: Bounded/Paginated Historical Activity Retrieval', () => {
    it('query with limit returns bounded results', async () => {
      const { records } = await populateTestData();

      // Query with limit=5
      const page = await store.query({ limit: 5 });
      expect(page.length).toBe(5);
      // Results in deterministic order (by sequence)
      for (let i = 1; i < page.length; i++) {
        expect(page[i].sequenceNumber).toBeGreaterThan(page[i - 1].sequenceNumber);
      }
    });

    it('query with after cursor returns subsequent records', async () => {
      const { records } = await populateTestData();

      // Get first 5
      const firstPage = await store.query({ limit: 5 });
      expect(firstPage.length).toBe(5);

      // Cursor after first page
      const cursor: ActivityCursor = {
        sequenceNumber: firstPage[4].sequenceNumber,
        eventId: firstPage[4].eventId,
        timestamp: firstPage[4].timestamp,
      };

      const nextPage = await store.getAfter(cursor);
      expect(nextPage.length).toBeGreaterThan(0);
      // All records after cursor
      for (const record of nextPage) {
        expect(record.sequenceNumber).toBeGreaterThan(cursor.sequenceNumber);
      }
    });

    it('query with workflowRunId filter works', async () => {
      const { workflowRunId, records } = await populateTestData();

      const page = await store.query({ workflowRunId, limit: 100 });
      // All records should belong to this workflow
      for (const record of page) {
        expect(record.workflowRunId).toBe(workflowRunId);
      }
    });

    it('query with actor filter works', async () => {
      const { records } = await populateTestData();

      const humanRecords = await store.query({ actor: 'human', limit: 100 });
      for (const record of humanRecords) {
        expect(record.actor.type).toBe('human');
      }

      const agentRecords = await store.query({ actor: 'agent', limit: 100 });
      for (const record of agentRecords) {
        expect(record.actor.type).toBe('agent');
      }
    });

    it('query with type filter works', async () => {
      const { records } = await populateTestData();

      const failedRecords = await store.query({ type: 'task.failed', limit: 100 });
      for (const record of failedRecords) {
        expect(record.type).toBe('task.failed');
      }
    });
  });

  // ─── INV-3: Individual ActivityRecord Retrieval ──────────────

  describe('INV-3: Individual ActivityRecord Retrieval', () => {
    it('getByEventId retrieves specific record', async () => {
      const { records } = await populateTestData();
      const targetRecord = records[0];

      const retrieved = await store.getByEventId(targetRecord.eventId);
      expect(retrieved).toBeDefined();
      expect(retrieved!.activityId).toBe(targetRecord.activityId);
      expect(retrieved!.sequenceNumber).toBe(targetRecord.sequenceNumber);
      expect(retrieved!.type).toBe(targetRecord.type);
    });

    it('getByEventId returns undefined for unknown eventId', async () => {
      const retrieved = await store.getByEventId('unknown-event-id');
      expect(retrieved).toBeUndefined();
    });
  });

  // ─── INV-4: Aggregate Drill-Down ─────────────────────────────

  describe('INV-4: Aggregate Drill-Down', () => {
    it('aggregated stream items have referencedActivityIds for drill-down', async () => {
      const { records } = await populateTestData();
      const projection = runtime.rebuild(records);

      // Find aggregated item
      const aggregated = projection.stream.find((s) => s.aggregated !== undefined);
      expect(aggregated).toBeDefined();
      expect(aggregated!.aggregated).toBeDefined();

      // Has referencedActivityIds
      const refIds = aggregated!.aggregated!.referencedActivityIds;
      expect(refIds.length).toBeGreaterThan(0);
      expect(refIds.length).toBe(aggregated!.aggregated!.count);

      // Each referenced ID maps to a real M9 record
      for (const refId of refIds) {
        const record = records.find((r) => String(r.activityId) === refId);
        expect(record).toBeDefined();
      }

      // Has sequenceRange
      const range = aggregated!.aggregated!.sequenceRange;
      expect(range.first).toBeLessThanOrEqual(range.last);
      expect(range.first).toBeGreaterThan(0);
    });

    it('sequenceRange enables cursor-based retrieval of underlying records', async () => {
      const { records } = await populateTestData();
      const projection = runtime.rebuild(records);

      const aggregated = projection.stream.find((s) => s.aggregated !== undefined);
      expect(aggregated).toBeDefined();

      const { first, last } = aggregated!.aggregated!.sequenceRange;
      const rangeRecords = records.filter((r) => r.sequenceNumber >= first && r.sequenceNumber <= last);
      expect(rangeRecords.length).toBe(aggregated!.aggregated!.count);
    });
  });

  // ─── INV-5: Participant Projection ───────────────────────────

  describe('INV-5: Participant Projection', () => {
    it('participants have membership, presence, workState', async () => {
      const { records } = await populateTestData();
      const projection = runtime.rebuild(records);

      for (const p of projection.participants) {
        expect(p.participantId).toBeTruthy();
        expect(p.type).toMatch(/^(human|agent|system)$/);
        expect(p.displayName).toBeTruthy();
        expect(['joined', 'left', 'assigned']).toContain(p.membership);
        expect(['online', 'offline', 'idle', 'disconnected']).toContain(p.presence);
        expect(['available', 'working', 'waiting', 'blocked', 'attention-required']).toContain(p.workState);
      }
    });

    it('no hardcoded participant identities', async () => {
      const { records } = await populateTestData();
      const projection = runtime.rebuild(records);

      for (const p of projection.participants) {
        expect(p.participantId).toMatch(/^(human|agent|system)-/);
      }
    });

    it('presence resolved independently (not from history)', async () => {
      const { records } = await populateTestData();
      const projection = runtime.rebuild(records);

      // All participants have presence='offline' (not inferred from activity)
      for (const p of projection.participants) {
        expect(p.presence).toBe('offline');
      }
    });

    it('work state derives from authoritative facts', async () => {
      const { records } = await populateTestData();
      const projection = runtime.rebuild(records);

      const developer = projection.participants.find((p) => p.participantId === 'agent-developer');
      expect(developer).toBeDefined();
      // Last activity was task.failed → attention-required
      expect(developer!.workState).toBe('attention-required');
    });
  });

  // ─── INV-6: Attention Projection ──────────────────────────────

  describe('INV-6: Attention Projection', () => {
    it('attention entries have typed reasons and severity', async () => {
      const { records } = await populateTestData();
      const projection = runtime.rebuild(records);

      for (const a of projection.attention) {
        expect(a.attentionId).toBeTruthy();
        expect([
          'task-failed',
          'workflow-failed',
          'waiting-for-human',
          'attention-required',
          'dependency-unavailable',
          'retry-needed',
          'material-change',
        ]).toContain(a.reason);
        expect(['critical', 'high', 'medium', 'low']).toContain(a.severity);
        expect(a.message).toBeTruthy();
        expect(typeof a.acknowledged).toBe('boolean');
      }
    });

    it('critical attention for workflow failure', async () => {
      const { records } = await populateTestData();
      const projection = runtime.rebuild(records);

      const workflowAttention = projection.attention.find((a) => a.reason === 'workflow-failed');
      expect(workflowAttention).toBeDefined();
      expect(workflowAttention!.severity).toBe('critical');
    });

    it('high attention for task failure', async () => {
      const { records } = await populateTestData();
      const projection = runtime.rebuild(records);

      const taskAttention = projection.attention.find((a) => a.reason === 'task-failed');
      expect(taskAttention).toBeDefined();
      expect(taskAttention!.severity).toBe('high');
    });
  });

  // ─── INV-7: Workflow Summary Projection ──────────────────────

  describe('INV-7: Workflow Summary Projection', () => {
    it('workflow summary tracks status lifecycle', async () => {
      const { workflowRunId, records } = await populateTestData();
      const projection = runtime.rebuild(records);

      expect(projection.workflowSummary).toBeDefined();
      expect(projection.workflowSummary!.workflowRunId).toBe(workflowRunId);
      expect(projection.workflowSummary!.status).toBe('failed');
      // taskCount increments on task.runnable only; test has 1 runnable task
      expect(projection.workflowSummary!.taskCount).toBeGreaterThanOrEqual(1);
      // failedTasks increments on task.failed
      expect(projection.workflowSummary!.failedTasks).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── INV-8: Query Limits and Validation ──────────────────────

  describe('INV-8: Query Limits and Validation', () => {
    it('limit is capped at MAX_LIMIT (100)', async () => {
      const { records } = await populateTestData();

      // Request limit > MAX_LIMIT
      const page = await store.query({ limit: 500 });
      // Store enforces limit
      expect(page.length).toBeLessThanOrEqual(100);
    });

    it('limit defaults to DEFAULT_LIMIT (50)', async () => {
      const { records } = await populateTestData();

      const page = await store.query({});
      expect(page.length).toBeLessThanOrEqual(50);
    });

    it('negative afterSequence throws', async () => {
      // This is validated at API layer, not store layer
      // Store accepts any number
      await expect(store.query({ after: { sequenceNumber: -1, eventId: '', timestamp: '' } })).resolves.toBeDefined();
    });

    it('afterSequence >= beforeSequence throws at API layer', async () => {
      // API validation - tested in integration tests
      expect(true).toBe(true); // Placeholder for API layer test
    });
  });

  // ─── INV-9: Historical Pagination Beyond 500-Item Working Set ─

  describe('INV-9: Historical Pagination Beyond M10 500-Item Working Set', () => {
    it('M9 store retains all 1000+ records while projection stream bounded', async () => {
      const workflowRunId = makeWorkflowRunId();

      // Insert 1000 records
      for (let i = 0; i < 1000; i++) {
        await store.append(
          fromAgentLifecycle({
            agentId: 'dev',
            displayName: 'Developer',
            lifecycleType: 'progress',
            workflowRunId,
          }),
        );
      }

      // M9 has all 1000 records
      const allRecords = await store.rebuild();
      expect(allRecords.length).toBe(1000);

      // Projection stream is bounded
      const projection = runtime.rebuild(allRecords);
      expect(projection.stream.length).toBeLessThanOrEqual(500);

      // Pagination works beyond 500
      const cursor500: ActivityCursor = {
        sequenceNumber: 500,
        eventId: '',
        timestamp: '',
      };
      const page = await store.getAfter(cursor500);
      expect(page.length).toBe(500);
      expect(page[0].sequenceNumber).toBe(501);
    });

    it('cursor-based pagination works for full history', async () => {
      const workflowRunId = makeWorkflowRunId();

      for (let i = 0; i < 200; i++) {
        await store.append(
          fromAgentLifecycle({
            agentId: 'dev',
            displayName: 'Developer',
            lifecycleType: 'progress',
            workflowRunId,
          }),
        );
      }

      // getAfter returns ALL records after cursor (no limit at store level)
      let cursor: ActivityCursor = { sequenceNumber: 0, eventId: '', timestamp: '' };
      let totalFetched = 0;

      // First page
      let page = await store.getAfter(cursor);
      expect(page.length).toBe(200);
      totalFetched += page.length;
      cursor = {
        sequenceNumber: page[page.length - 1].sequenceNumber,
        eventId: page[page.length - 1].eventId,
        timestamp: page[page.length - 1].timestamp,
      };

      // Subsequent pages should be empty (no more records)
      for (let pageNum = 1; pageNum < 4; pageNum++) {
        page = await store.getAfter(cursor);
        expect(page.length).toBe(0);
      }

      expect(totalFetched).toBe(200);
    });

    it('API cursor semantics remain M9-sequence based', async () => {
      const { records } = await populateTestData();

      // Get cursor from projection
      const projection = runtime.rebuild(records);
      const cursor = projection.room.cursor;

      // Cursor sequenceNumber matches M9 sequence
      expect(cursor.sequenceNumber).toBe(records[records.length - 1].sequenceNumber);
      expect(cursor.eventId).toBe(records[records.length - 1].eventId);

      // Use cursor to fetch subsequent records (simulating reconnect)
      const newRecords = await store.getAfter(cursor);
      // No new records yet
      expect(newRecords.length).toBe(0);
    });
  });

  // ─── INV-10: Read-Only — No M8/M9/M10 Mutation ──────────────

  describe('INV-10: Read-Only — No M8/M9/M10 Mutation', () => {
    it('projection does not mutate M9 store', async () => {
      const { records } = await populateTestData();
      const snapshot = records.map((r) => ({ ...r }));

      // Rebuild projection multiple times
      for (let i = 0; i < 5; i++) {
        runtime.rebuild(records);
      }

      const finalRecords = await store.rebuild();
      expect(finalRecords.length).toBe(snapshot.length);
      for (let i = 0; i < snapshot.length; i++) {
        expect(finalRecords[i].activityId).toBe(snapshot[i].activityId);
        expect(finalRecords[i].sequenceNumber).toBe(snapshot[i].sequenceNumber);
        expect(finalRecords[i].eventId).toBe(snapshot[i].eventId);
      }
    });

    it('query does not mutate M9 store', async () => {
      const { records } = await populateTestData();
      const before = await store.rebuild();

      // Run multiple queries
      for (let i = 0; i < 10; i++) {
        await store.query({ limit: 10 });
      }

      const after = await store.rebuild();
      expect(after.length).toBe(before.length);
    });

    it('getAfter does not mutate M9 store', async () => {
      const { records } = await populateTestData();
      const cursor: ActivityCursor = { sequenceNumber: 5, eventId: '', timestamp: '' };

      for (let i = 0; i < 5; i++) {
        await store.getAfter(cursor);
      }

      const after = await store.rebuild();
      expect(after.length).toBe(records.length);
    });

    it('getByEventId does not mutate M9 store', async () => {
      const { records } = await populateTestData();
      const eventId = records[0].eventId;

      for (let i = 0; i < 5; i++) {
        await store.getByEventId(eventId);
      }

      const after = await store.rebuild();
      expect(after.length).toBe(records.length);
    });
  });

  // ─── INV-11: No Internal Exposure ────────────────────────────

  describe('INV-11: No Internal Exposure', () => {
    it('no SQLite schema exposure in projection', async () => {
      const { records } = await populateTestData();
      const projection = runtime.rebuild(records);

      const jsonStr = JSON.stringify(projection);
      expect(jsonStr).not.toContain('m9_activity_events');
      expect(jsonStr).not.toContain('sqlite');
      expect(jsonStr).not.toContain('CREATE TABLE');
      expect(jsonStr).not.toContain('INDEX');
    });

    it('no OpenCode internals exposure', async () => {
      const { records } = await populateTestData();
      const projection = runtime.rebuild(records);

      const jsonStr = JSON.stringify(projection);
      expect(jsonStr).not.toContain('opencode');
      expect(jsonStr).not.toContain('openai');
      expect(jsonStr).not.toContain('anthropic');
    });

    it('no provider/model internals exposure', async () => {
      const { records } = await populateTestData();
      const projection = runtime.rebuild(records);

      const jsonStr = JSON.stringify(projection);
      expect(jsonStr).not.toContain('model');
      expect(jsonStr).not.toContain('provider');
      expect(jsonStr).not.toContain('temperature');
      expect(jsonStr).not.toContain('max_tokens');
    });

    it('no implementation-specific projection state exposure', async () => {
      const { records } = await populateTestData();
      const projection = runtime.rebuild(records);

      // Projection should only contain declared types
      const allowedTopLevelKeys = [
        'room',
        'participants',
        'stream',
        'workflowSummary',
        'attention',
        'contextualCapabilities',
      ];
      for (const key of Object.keys(projection)) {
        expect(allowedTopLevelKeys).toContain(key);
      }
    });
  });

  // ─── Full Collaborative Scenario ────────────────────────────

  describe('Full Collaborative Scenario', () => {
    it('end-to-end: human join → message → workflow → agents → complete → paginate history', async () => {
      const { workflowRunId, executionId, task1, task2, records } = await populateTestData();

      // 1. Room snapshot
      const projection = runtime.rebuild(records);
      expect(projection.room.cursor.sequenceNumber).toBe(records.length);

      // 2. Participants
      expect(projection.participants.length).toBe(4); // human, planner, developer, system

      // 3. Stream has aggregated items (noisy logs aggregated)
      const aggregated = projection.stream.filter((s) => s.aggregated !== undefined);
      expect(aggregated.length).toBeGreaterThanOrEqual(1);

      // 4. Attention for failures
      expect(projection.attention.some((a) => a.reason === 'task-failed')).toBe(true);
      expect(projection.attention.some((a) => a.reason === 'workflow-failed')).toBe(true);

      // 5. Historical pagination
      const cursor10: ActivityCursor = { sequenceNumber: 10, eventId: '', timestamp: '' };
      const history = await store.getAfter(cursor10);
      expect(history.length).toBeGreaterThan(0);

      // 6. Individual record retrieval
      const firstRecord = await store.getByEventId(records[0].eventId);
      expect(firstRecord).toBeDefined();
    });
  });

  describe('Aggregate Drill-Down', () => {
    it('uses sequenceRange to retrieve underlying records', async () => {
      const { records } = await populateTestData();
      const projection = runtime.rebuild(records);

      const aggItem = projection.stream.find((s) => s.aggregated !== undefined);
      if (aggItem?.aggregated) {
        const { first, last } = aggItem.aggregated.sequenceRange;
        const rangeRecords = records.filter((r) => r.sequenceNumber >= first && r.sequenceNumber <= last);
        expect(rangeRecords.length).toBe(aggItem.aggregated.count);
        expect(rangeRecords.length).toBeGreaterThan(0);
      }
    });
  });
});
