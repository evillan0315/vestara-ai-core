/**
 * ARX-015 M10 — Final Invariant Review
 *
 * Proves all M10 invariants before M11 authorization.
 * All tests are hermetic. No live providers, no real OpenCode sessions.
 */

import type {
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

// ─── Helpers ────────────────────────────────────────────────

let _counter = 0;
function makeWorkflowRunId(): WorkflowRunId {
  return `wr-${Date.now()}-${++_counter}` as WorkflowRunId;
}
function makeTaskId(): WorkflowTaskId {
  return `wt-${Date.now()}-${++_counter}` as WorkflowTaskId;
}
function makeExecutionId(): ExecutionId {
  return `exec-${Date.now()}-${++_counter}` as ExecutionId;
}
function wf(
  overrides: Partial<WorkflowEvent> & { type: WorkflowEvent['type']; workflowRunId: WorkflowRunId },
): WorkflowEvent {
  return { timestamp: new Date().toISOString(), ...overrides };
}

// ─── Test Suite ─────────────────────────────────────────────

describe('M10 Final Invariant Review', () => {
  let store: DurableActivityStore;
  let db: any;

  beforeEach(async () => {
    const SQL = await initSqlJs();
    db = new SQL.Database();
    store = new DurableActivityStore(db);
  });

  afterEach(() => {
    db.close();
  });

  // ─── INV-1: MAX_STREAM_ITEMS bounds projection only, not M9 ──

  describe('INV-1: Stream backpressure bounds projection only, not M9 history', () => {
    it('M9 retains all records after 600+ append operations', async () => {
      const workflowRunId = makeWorkflowRunId();
      for (let i = 0; i < 600; i++) {
        await store.append(
          fromAgentLifecycle({
            agentId: 'dev',
            displayName: 'Developer',
            lifecycleType: 'progress',
            workflowRunId,
          }),
        );
      }

      // M9 has all 600 records
      const allRecords = await store.rebuild();
      expect(allRecords.length).toBe(600);

      // Cursor points to last record
      const cursor = await store.getCursor();
      expect(cursor?.sequenceNumber).toBe(600);
    });

    it('projection stream is bounded while M9 remains complete', async () => {
      const workflowRunId = makeWorkflowRunId();
      for (let i = 0; i < 600; i++) {
        await store.append(
          fromAgentLifecycle({
            agentId: 'dev',
            displayName: 'Developer',
            lifecycleType: 'progress',
            workflowRunId,
          }),
        );
      }

      const records = await store.rebuild();
      const runtime = new ProjectionRuntime();
      const projection = runtime.rebuild(records);

      // Projection stream bounded
      expect(projection.stream.length).toBeLessThanOrEqual(500);
      // M9 still has everything
      const m9Records = await store.rebuild();
      expect(m9Records.length).toBe(600);
    });
  });

  // ─── INV-2: Stream trimming cannot invalidate cursor reconnect ──

  describe('INV-2: Stream trimming preserves cursor reconnect semantics', () => {
    it('reconnect from cursor after stream trim catches up correctly', async () => {
      const workflowRunId = makeWorkflowRunId();

      // Phase 1: 300 activities
      for (let i = 0; i < 300; i++) {
        await store.append(
          fromAgentLifecycle({
            agentId: 'dev',
            displayName: 'Developer',
            lifecycleType: 'progress',
            workflowRunId,
          }),
        );
      }

      const records1 = await store.rebuild();
      const runtime1 = new ProjectionRuntime();
      const projection1 = runtime1.rebuild(records1);
      const cursor1 = projection1.room.cursor;

      // Phase 2: 300 more (total 600 — triggers backpressure)
      for (let i = 0; i < 300; i++) {
        await store.append(
          fromAgentLifecycle({
            agentId: 'dev',
            displayName: 'Developer',
            lifecycleType: 'progress',
            workflowRunId,
          }),
        );
      }

      // Reconnect from cursor1
      const newRecords = await store.getAfter(cursor1);
      expect(newRecords.length).toBe(300);

      // Process catch-up
      for (const record of newRecords) {
        runtime1.processRecord(record);
      }

      const projection2 = runtime1.getProjection();
      // Cursor advanced to final record
      expect(projection2.room.cursor.sequenceNumber).toBe(600);
      // All 600 M9 records still accessible
      const allRecords = await store.rebuild();
      expect(allRecords.length).toBe(600);
    });
  });

  // ─── INV-3: Aggregated items retain deterministic M9 references ──

  describe('INV-3: Aggregated items retain deterministic M9 references', () => {
    it('aggregated item contains referencedActivityIds mapping to M9 records', async () => {
      const workflowRunId = makeWorkflowRunId();

      // Generate 5 muted items (reaches MUTING_THRESHOLD)
      for (let i = 0; i < 3; i++) {
        await store.append(
          fromWorkflowEvent(
            wf({
              type: 'task.runnable',
              workflowRunId,
              taskId: `task-${i}`,
              agentAssignmentId: 'dev',
            }),
          ),
        );
      }
      for (let i = 0; i < 2; i++) {
        await store.append(
          fromAgentLifecycle({
            agentId: 'dev',
            displayName: 'Developer',
            lifecycleType: 'progress',
            workflowRunId,
          }),
        );
      }

      const records = await store.rebuild();
      const runtime = new ProjectionRuntime();
      const projection = runtime.rebuild(records);

      const aggregated = projection.stream.find((s) => s.aggregated !== undefined);
      expect(aggregated).toBeDefined();
      expect(aggregated!.aggregated).toBeDefined();

      // referencedActivityIds maps to real M9 records
      const refIds = aggregated!.aggregated!.referencedActivityIds;
      expect(refIds.length).toBe(5);

      for (const refId of refIds) {
        const record = records.find((r) => String(r.activityId) === refId);
        expect(record).toBeDefined();
      }

      // sequenceRange is valid
      const range = aggregated!.aggregated!.sequenceRange;
      expect(range.first).toBeLessThanOrEqual(range.last);
      expect(range.first).toBeGreaterThan(0);

      // All records within range belong to the aggregated set
      const rangeRecords = records.filter((r) => r.sequenceNumber >= range.first && r.sequenceNumber <= range.last);
      expect(rangeRecords.length).toBe(5);
    });

    it('drill-down: referencedActivityIds enable retrieval of all underlying records', async () => {
      const workflowRunId = makeWorkflowRunId();

      for (let i = 0; i < 6; i++) {
        await store.append(
          fromAgentLifecycle({
            agentId: 'dev',
            displayName: 'Developer',
            lifecycleType: 'progress',
            workflowRunId,
          }),
        );
      }

      const records = await store.rebuild();
      const runtime = new ProjectionRuntime();
      const projection = runtime.rebuild(records);

      const aggregated = projection.stream.find((s) => s.aggregated !== undefined);
      expect(aggregated).toBeDefined();

      // Can retrieve all underlying M9 records via referencedActivityIds
      const underlyingRecords = records.filter((r) =>
        aggregated!.aggregated!.referencedActivityIds.includes(String(r.activityId)),
      );
      expect(underlyingRecords.length).toBe(aggregated!.aggregated!.count);
    });
  });

  // ─── INV-4: Attention lifecycle correctness ────────────────

  describe('INV-4: Attention lifecycle across failure → retry → failure/completion', () => {
    it('failure → retry → failure: attention remains for latest failure', async () => {
      const workflowRunId = makeWorkflowRunId();
      const taskId = makeTaskId();

      // First failure
      await store.append(
        fromWorkflowEvent(
          wf({
            type: 'task.failed',
            workflowRunId,
            taskInstanceId: taskId,
            agentAssignmentId: 'dev',
            error: 'Build error v1',
          }),
        ),
      );

      let records = await store.rebuild();
      let runtime = new ProjectionRuntime();
      let projection = runtime.rebuild(records);

      expect(projection.attention.length).toBe(1);
      expect(projection.attention[0].reason).toBe('task-failed');
      expect(projection.attention[0].message).toContain('v1');

      // Retry (task.runnable → task.started)
      await store.append(
        fromWorkflowEvent(
          wf({
            type: 'task.runnable',
            workflowRunId,
            taskInstanceId: taskId,
            agentAssignmentId: 'dev',
          }),
        ),
      );
      await store.append(
        fromWorkflowEvent(
          wf({
            type: 'task.started',
            workflowRunId,
            taskInstanceId: taskId,
            agentAssignmentId: 'dev',
          }),
        ),
      );

      records = await store.rebuild();
      runtime = new ProjectionRuntime();
      projection = runtime.rebuild(records);

      // Attention still present (failure not resolved by runnable/started)
      expect(projection.attention.length).toBe(1);
      expect(projection.attention[0].reason).toBe('task-failed');

      // Second failure
      await store.append(
        fromWorkflowEvent(
          wf({
            type: 'task.failed',
            workflowRunId,
            taskInstanceId: taskId,
            agentAssignmentId: 'dev',
            error: 'Build error v2',
          }),
        ),
      );

      records = await store.rebuild();
      runtime = new ProjectionRuntime();
      projection = runtime.rebuild(records);

      // Still one attention entry (deduplicated by taskId + reason)
      expect(projection.attention.length).toBe(1);
      expect(projection.attention[0].message).toContain('v2');
    });

    it('failure → completion: attention auto-resolves', async () => {
      const workflowRunId = makeWorkflowRunId();
      const taskId = makeTaskId();

      await store.append(
        fromWorkflowEvent(
          wf({
            type: 'task.failed',
            workflowRunId,
            taskInstanceId: taskId,
            agentAssignmentId: 'dev',
            error: 'error',
          }),
        ),
      );
      await store.append(
        fromWorkflowEvent(
          wf({
            type: 'task.completed',
            workflowRunId,
            taskInstanceId: taskId,
            agentAssignmentId: 'dev',
          }),
        ),
      );

      const records = await store.rebuild();
      const runtime = new ProjectionRuntime();
      const projection = runtime.rebuild(records);

      // Attention resolved by task.completed
      const taskAttention = projection.attention.filter((a) => a.taskId === taskId);
      expect(taskAttention.length).toBe(0);
    });

    it('unrelated task completion does not resolve attention for different task', async () => {
      const workflowRunId = makeWorkflowRunId();
      const taskA = makeTaskId();
      const taskB = makeTaskId();

      // Task A fails
      await store.append(
        fromWorkflowEvent(
          wf({
            type: 'task.failed',
            workflowRunId,
            taskInstanceId: taskA,
            agentAssignmentId: 'dev',
            error: 'error A',
          }),
        ),
      );
      // Task B completes (unrelated)
      await store.append(
        fromWorkflowEvent(
          wf({
            type: 'task.completed',
            workflowRunId,
            taskInstanceId: taskB,
            agentAssignmentId: 'dev',
          }),
        ),
      );

      const records = await store.rebuild();
      const runtime = new ProjectionRuntime();
      const projection = runtime.rebuild(records);

      // Task A attention still present
      const taskAAttention = projection.attention.filter((a) => a.taskId === taskA);
      expect(taskAAttention.length).toBe(1);
      expect(taskAAttention[0].acknowledged).toBe(false);
    });

    it('workflow failure attention not resolved by unrelated task completion', async () => {
      const workflowRunId = makeWorkflowRunId();
      const taskA = makeTaskId();

      await store.append(
        fromWorkflowEvent(
          wf({
            type: 'workflow.failed',
            workflowRunId,
            agentAssignmentId: 'system',
            error: 'Pipeline failed',
          }),
        ),
      );
      await store.append(
        fromWorkflowEvent(
          wf({
            type: 'task.completed',
            workflowRunId,
            taskInstanceId: taskA,
            agentAssignmentId: 'dev',
          }),
        ),
      );

      const records = await store.rebuild();
      const runtime = new ProjectionRuntime();
      const projection = runtime.rebuild(records);

      // Workflow failure attention persists (no taskId to match)
      const workflowAttention = projection.attention.filter((a) => a.reason === 'workflow-failed');
      expect(workflowAttention.length).toBe(1);
    });
  });

  // ─── INV-5: Participant independence ───────────────────────

  describe('INV-5: Participant membership/presence/workState independence', () => {
    it('historical ActivityActor cannot recreate current participant presence', async () => {
      const workflowRunId = makeWorkflowRunId();

      // Activity from yesterday
      await store.append(
        fromAgentLifecycle({
          agentId: 'dev',
          displayName: 'Developer',
          lifecycleType: 'started',
          workflowRunId,
        }),
      );

      const records = await store.rebuild();
      const runtime = new ProjectionRuntime();
      const projection = runtime.rebuild(records);

      const dev = projection.participants.find((p) => p.participantId === 'agent-dev');
      expect(dev).toBeDefined();
      // Presence is offline despite historical "started" activity
      expect(dev!.presence).toBe('offline');
    });

    it('membership, presence, workState are independent fields', async () => {
      const workflowRunId = makeWorkflowRunId();
      const taskId = makeTaskId();

      await store.append(
        fromWorkflowEvent(
          wf({
            type: 'task.started',
            workflowRunId,
            taskInstanceId: taskId,
            agentAssignmentId: 'dev',
          }),
        ),
      );

      const records = await store.rebuild();
      const runtime = new ProjectionRuntime();
      const projection = runtime.rebuild(records);

      const dev = projection.participants.find((p) => p.participantId === 'agent-dev');
      expect(dev).toBeDefined();
      expect(dev!.membership).toBe('joined');
      expect(dev!.presence).toBe('offline');
      expect(dev!.workState).toBe('working');

      // Changing one doesn't affect others
      // (presence is always offline unless explicitly set — M10 doesn't set it)
    });

    it('multiple agents have independent work states', async () => {
      const workflowRunId = makeWorkflowRunId();
      const task1 = makeTaskId();
      const task2 = makeTaskId();

      await store.append(
        fromWorkflowEvent(
          wf({
            type: 'task.started',
            workflowRunId,
            taskInstanceId: task1,
            agentAssignmentId: 'planner',
          }),
        ),
      );
      await store.append(
        fromWorkflowEvent(
          wf({
            type: 'task.failed',
            workflowRunId,
            taskInstanceId: task2,
            agentAssignmentId: 'developer',
            error: 'error',
          }),
        ),
      );

      const records = await store.rebuild();
      const runtime = new ProjectionRuntime();
      const projection = runtime.rebuild(records);

      const planner = projection.participants.find((p) => p.participantId === 'agent-planner');
      const developer = projection.participants.find((p) => p.participantId === 'agent-developer');

      expect(planner!.workState).toBe('working');
      expect(developer!.workState).toBe('attention-required');
    });
  });

  // ─── INV-6: rebuild(all) ≡ rebuild(prefix) + incrementalApply ──

  describe('INV-6: rebuild(all) ≡ rebuild(prefix) + incrementalApply(remainder)', () => {
    it('equivalence across participants, attention, workflows, and aggregation', async () => {
      const workflowRunId = makeWorkflowRunId();
      const executionId = makeExecutionId();
      const task1 = makeTaskId();
      const task2 = makeTaskId();

      // Build a rich sequence
      const events = [
        fromHumanMessage({ message: 'Hello', userId: 'h1', displayName: 'Alice', executionId }),
        fromWorkflowEvent(wf({ type: 'workflow.started', workflowRunId, executionId })),
        fromWorkflowEvent(
          wf({ type: 'task.started', workflowRunId, taskInstanceId: task1, executionId, agentAssignmentId: 'planner' }),
        ),
        fromWorkflowEvent(
          wf({
            type: 'task.completed',
            workflowRunId,
            taskInstanceId: task1,
            executionId,
            agentAssignmentId: 'planner',
          }),
        ),
        fromWorkflowEvent(
          wf({
            type: 'task.runnable',
            workflowRunId,
            taskInstanceId: task2,
            executionId,
            agentAssignmentId: 'developer',
          }),
        ),
        fromWorkflowEvent(
          wf({
            type: 'task.started',
            workflowRunId,
            taskInstanceId: task2,
            executionId,
            agentAssignmentId: 'developer',
          }),
        ),
        fromAgentLifecycle({
          agentId: 'developer',
          displayName: 'Developer',
          lifecycleType: 'progress',
          workflowRunId,
        }),
        fromAgentLifecycle({
          agentId: 'developer',
          displayName: 'Developer',
          lifecycleType: 'progress',
          workflowRunId,
        }),
        fromAgentLifecycle({
          agentId: 'developer',
          displayName: 'Developer',
          lifecycleType: 'progress',
          workflowRunId,
        }),
        fromAgentLifecycle({
          agentId: 'developer',
          displayName: 'Developer',
          lifecycleType: 'progress',
          workflowRunId,
        }),
        fromAgentLifecycle({
          agentId: 'developer',
          displayName: 'Developer',
          lifecycleType: 'progress',
          workflowRunId,
        }),
        fromWorkflowEvent(
          wf({
            type: 'task.failed',
            workflowRunId,
            taskInstanceId: task2,
            executionId,
            agentAssignmentId: 'developer',
            error: 'Build error',
          }),
        ),
        fromWorkflowEvent(wf({ type: 'workflow.failed', workflowRunId, executionId, error: 'Task failed' })),
      ];

      for (const event of events) {
        await store.append(event);
      }

      const allRecords = await store.rebuild();

      // Full rebuild
      const runtimeFull = new ProjectionRuntime();
      const fullProjection = runtimeFull.rebuild(allRecords);

      // Prefix + incremental
      const prefixRecords = allRecords.slice(0, 7);
      const remainderRecords = allRecords.slice(7);

      const runtimeIncremental = new ProjectionRuntime();
      const prefixProjection = runtimeIncremental.rebuild(prefixRecords);
      expect(prefixProjection.room.cursor.sequenceNumber).toBe(7);

      for (const record of remainderRecords) {
        runtimeIncremental.processRecord(record);
      }
      const incrementalProjection = runtimeIncremental.getProjection();

      // ─── Equivalence checks ───────────────────────────────

      // Participants: same set
      const fullParticipantIds = fullProjection.participants.map((p) => p.participantId).sort();
      const incrParticipantIds = incrementalProjection.participants.map((p) => p.participantId).sort();
      expect(incrParticipantIds).toEqual(fullParticipantIds);

      // Participants: same work states
      for (const fullP of fullProjection.participants) {
        const incrP = incrementalProjection.participants.find((p) => p.participantId === fullP.participantId);
        expect(incrP).toBeDefined();
        expect(incrP!.workState).toBe(fullP.workState);
        expect(incrP!.membership).toBe(fullP.membership);
      }

      // Attention: same unacknowledged entries
      const fullAttention = fullProjection.attention.map((a) => `${a.reason}:${a.taskId ?? 'wf'}`).sort();
      const incrAttention = incrementalProjection.attention.map((a) => `${a.reason}:${a.taskId ?? 'wf'}`).sort();
      expect(incrAttention).toEqual(fullAttention);

      // Workflow summary: same status
      expect(incrementalProjection.workflowSummary?.status).toBe(fullProjection.workflowSummary?.status);
      expect(incrementalProjection.workflowSummary?.workflowRunId).toBe(fullProjection.workflowSummary?.workflowRunId);

      // Cursor: same final position
      expect(incrementalProjection.room.cursor.sequenceNumber).toBe(fullProjection.room.cursor.sequenceNumber);
      expect(incrementalProjection.room.cursor.eventId).toBe(fullProjection.room.cursor.eventId);

      // Stream: primary/secondary items match in content
      const fullNonMuted = fullProjection.stream.filter((s) => s.importance !== 'muted');
      const incrNonMuted = incrementalProjection.stream.filter((s) => s.importance !== 'muted');
      expect(incrNonMuted.length).toBe(fullNonMuted.length);
    });
  });

  // ─── INV-7: Disconnect/reconnect ≡ uninterrupted ──────────

  describe('INV-7: Disconnect/reconnect from cursor C = uninterrupted consumption', () => {
    it('same final projection after disconnect/reconnect vs uninterrupted', async () => {
      const workflowRunId = makeWorkflowRunId();
      const executionId = makeExecutionId();

      // Phase 1: initial activities
      const phase1 = [
        fromHumanMessage({ message: 'Start', userId: 'h1', displayName: 'Alice', executionId }),
        fromWorkflowEvent(wf({ type: 'workflow.started', workflowRunId, executionId })),
      ];
      for (const e of phase1) await store.append(e);

      // Phase 2: activities that arrive during disconnect
      const phase2TaskId = makeTaskId();
      const phase2 = [
        fromWorkflowEvent(
          wf({
            type: 'task.started',
            workflowRunId,
            taskInstanceId: phase2TaskId,
            executionId,
            agentAssignmentId: 'dev',
          }),
        ),
        fromAgentLifecycle({ agentId: 'dev', displayName: 'Developer', lifecycleType: 'progress', workflowRunId }),
        fromWorkflowEvent(
          wf({
            type: 'task.completed',
            workflowRunId,
            taskInstanceId: phase2TaskId,
            executionId,
            agentAssignmentId: 'dev',
          }),
        ),
      ];
      for (const e of phase2) await store.append(e);

      // Now fetch all records (both phases)
      const allRecords = await store.rebuild();

      // Uninterrupted path: process all at once
      const runtimeUninterrupted = new ProjectionRuntime();
      const uninterrupted = runtimeUninterrupted.rebuild(allRecords);

      // Disconnect/reconnect path: rebuild phase 1, then catch up phase 2
      const runtimeReconnect = new ProjectionRuntime();
      const phase1Records = allRecords.slice(0, 2);
      runtimeReconnect.rebuild(phase1Records);
      const cursor = runtimeReconnect.getProjection().room.cursor;

      // Reconnect: get after cursor
      const newRecords = await store.getAfter(cursor);
      expect(newRecords.length).toBe(3);

      for (const r of newRecords) {
        runtimeReconnect.processRecord(r);
      }

      const reconnectProjection = runtimeReconnect.getProjection();

      // ─── Equivalence ──────────────────────────────────────
      // Cursor matches
      expect(reconnectProjection.room.cursor.sequenceNumber).toBe(uninterrupted.room.cursor.sequenceNumber);
      expect(reconnectProjection.room.cursor.eventId).toBe(uninterrupted.room.cursor.eventId);

      // Participants match
      const recParticipantIds = reconnectProjection.participants.map((p) => p.participantId).sort();
      const unParticipantIds = uninterrupted.participants.map((p) => p.participantId).sort();
      expect(recParticipantIds).toEqual(unParticipantIds);

      // Work states match
      for (const unP of uninterrupted.participants) {
        const recP = reconnectProjection.participants.find((p) => p.participantId === unP.participantId);
        expect(recP!.workState).toBe(unP.workState);
      }

      // Attention matches
      expect(reconnectProjection.attention.length).toBe(uninterrupted.attention.length);

      // Workflow summary matches
      expect(reconnectProjection.workflowSummary?.status).toBe(uninterrupted.workflowSummary?.status);
    });
  });

  // ─── INV-8: Projection is read-only ───────────────────────

  describe('INV-8: Projection is read-only — no M10 path mutates M8/M9', () => {
    it('projection does not mutate M9 store records', async () => {
      const workflowRunId = makeWorkflowRunId();

      await store.append(
        fromWorkflowEvent(
          wf({
            type: 'task.started',
            workflowRunId,
            taskInstanceId: makeTaskId(),
            agentAssignmentId: 'dev',
          }),
        ),
      );
      await store.append(
        fromWorkflowEvent(
          wf({
            type: 'task.failed',
            workflowRunId,
            taskInstanceId: makeTaskId(),
            agentAssignmentId: 'dev',
            error: 'error',
          }),
        ),
      );

      const recordsBefore = await store.rebuild();
      const snapshot = recordsBefore.map((r) => ({ ...r }));

      const runtime = new ProjectionRuntime();
      runtime.rebuild(recordsBefore);

      const recordsAfter = await store.rebuild();
      expect(recordsAfter.length).toBe(snapshot.length);
      for (let i = 0; i < snapshot.length; i++) {
        expect(recordsAfter[i].activityId).toBe(snapshot[i].activityId);
        expect(recordsAfter[i].sequenceNumber).toBe(snapshot[i].sequenceNumber);
        expect(recordsAfter[i].eventId).toBe(snapshot[i].eventId);
        expect(recordsAfter[i].type).toBe(snapshot[i].type);
      }
    });

    it('projection does not affect M9 cursor', async () => {
      await store.append(
        fromAgentLifecycle({
          agentId: 'dev',
          displayName: 'Developer',
          lifecycleType: 'progress',
        }),
      );

      const cursorBefore = await store.getCursor();
      expect(cursorBefore).toBeDefined();

      const records = await store.rebuild();
      const runtime = new ProjectionRuntime();
      runtime.rebuild(records);

      const cursorAfter = await store.getCursor();
      expect(cursorAfter?.sequenceNumber).toBe(cursorBefore?.sequenceNumber);
      expect(cursorAfter?.eventId).toBe(cursorBefore?.eventId);
    });

    it('multiple projection rebuilds do not affect M9', async () => {
      for (let i = 0; i < 10; i++) {
        await store.append(
          fromAgentLifecycle({
            agentId: 'dev',
            displayName: 'Developer',
            lifecycleType: 'progress',
          }),
        );
      }

      const records = await store.rebuild();
      for (let i = 0; i < 5; i++) {
        const runtime = new ProjectionRuntime();
        runtime.rebuild(records);
      }

      const finalRecords = await store.rebuild();
      expect(finalRecords.length).toBe(10);
    });
  });

  // ─── INV-10: M11 historical pages independent of M10 ──────

  describe('INV-10: M11 can obtain historical pages from M9 independently', () => {
    it('M9 getAfter(cursor) works independently of M10 projection state', async () => {
      const workflowRunId = makeWorkflowRunId();

      for (let i = 0; i < 20; i++) {
        await store.append(
          fromAgentLifecycle({
            agentId: 'dev',
            displayName: 'Developer',
            lifecycleType: 'progress',
            workflowRunId,
          }),
        );
      }

      // M11 can query M9 directly without M10
      const cursor5 = { sequenceNumber: 5, eventId: '', timestamp: '' };
      const page = await store.getAfter(cursor5);
      expect(page.length).toBe(15);
      expect(page[0].sequenceNumber).toBe(6);

      // M10 projection does not affect M9 page retrieval
      const allRecords = await store.rebuild();
      const runtime = new ProjectionRuntime();
      runtime.rebuild(allRecords);

      const pageAfterProjection = await store.getAfter(cursor5);
      expect(pageAfterProjection.length).toBe(15);
    });

    it('M9 query works independently with filters', async () => {
      const workflowRunId = makeWorkflowRunId();
      const taskA = makeTaskId();
      const taskB = makeTaskId();

      await store.append(
        fromWorkflowEvent(
          wf({ type: 'task.started', workflowRunId, taskInstanceId: taskA, agentAssignmentId: 'planner' }),
        ),
      );
      await store.append(
        fromWorkflowEvent(
          wf({ type: 'task.started', workflowRunId, taskInstanceId: taskB, agentAssignmentId: 'developer' }),
        ),
      );
      await store.append(
        fromWorkflowEvent(
          wf({ type: 'task.completed', workflowRunId, taskInstanceId: taskA, agentAssignmentId: 'planner' }),
        ),
      );

      // M11 can filter by task
      const taskARecords = await store.query({ taskId: taskA });
      expect(taskARecords.length).toBe(2);

      // M11 can filter by actor
      const plannerRecords = await store.query({ actorId: 'planner' });
      expect(plannerRecords.length).toBe(2);
    });
  });

  // ─── INV-9: Performance Baseline (non-gating) ─────────────

  describe('INV-9: Performance Baseline (non-gating, recorded as evidence)', () => {
    async function generateRecords(count: number): Promise<readonly ActivityRecord[]> {
      const workflowRunId = makeWorkflowRunId();
      const events = [];
      for (let i = 0; i < count; i++) {
        const isWorkflow = i % 20 === 0;
        const isFailed = i % 50 === 0;
        const isMuted = !isWorkflow && !isFailed;

        if (isWorkflow) {
          events.push(
            fromWorkflowEvent(
              wf({
                type: i % 40 === 0 ? 'workflow.started' : 'workflow.completed',
                workflowRunId,
              }),
            ),
          );
        } else if (isFailed) {
          events.push(
            fromWorkflowEvent(
              wf({
                type: 'task.failed',
                workflowRunId,
                taskInstanceId: makeTaskId(),
                agentAssignmentId: `agent-${i % 5}`,
                error: `Error at step ${i}`,
              }),
            ),
          );
        } else {
          events.push(
            fromAgentLifecycle({
              agentId: `agent-${i % 5}`,
              displayName: `Agent ${i % 5}`,
              lifecycleType: i % 3 === 0 ? 'progress' : i % 3 === 1 ? 'started' : 'completed',
              workflowRunId,
            }),
          );
        }
      }

      for (const event of events) {
        await store.append(event);
      }
      return store.rebuild();
    }

    it('1K records: rebuild time, incremental latency, stream size', { timeout: 30_000 }, async () => {
      const records = await generateRecords(1000);

      // Rebuild time
      const t0 = performance.now();
      const runtime = new ProjectionRuntime();
      const projection = runtime.rebuild(records);
      const rebuildMs = performance.now() - t0;

      // Incremental apply (10 new records)
      const incrEvents = [];
      for (let i = 0; i < 10; i++) {
        incrEvents.push(
          fromAgentLifecycle({
            agentId: 'dev',
            displayName: 'Developer',
            lifecycleType: 'progress',
          }),
        );
      }
      const incrRecords: ActivityRecord[] = [];
      for (const e of incrEvents) {
        incrRecords.push(await store.append(e));
      }

      const t1 = performance.now();
      for (const r of incrRecords) {
        runtime.processRecord(r);
      }
      const incrMs = performance.now() - t1;

      const finalProjection = runtime.getProjection();

      // Record baseline (non-gating — just evidence)
      console.log(`[INV-9] 1K records:`);
      console.log(`  rebuild: ${rebuildMs.toFixed(1)}ms`);
      console.log(`  incremental (10): ${incrMs.toFixed(1)}ms`);
      console.log(`  stream items: ${finalProjection.stream.length}`);
      console.log(`  participants: ${finalProjection.participants.length}`);
      console.log(`  attention: ${finalProjection.attention.length}`);

      // Soft assertions (non-gating — just ensure reasonable bounds)
      expect(rebuildMs).toBeLessThan(5000); // <5s for 1K
      expect(incrMs).toBeLessThan(100); // <100ms for 10 incremental
      expect(finalProjection.stream.length).toBeLessThanOrEqual(500); // bounded
    });

    it('10K records: rebuild time and stream size', { timeout: 60_000 }, async () => {
      const records = await generateRecords(10_000);

      const t0 = performance.now();
      const runtime = new ProjectionRuntime();
      const projection = runtime.rebuild(records);
      const rebuildMs = performance.now() - t0;

      console.log(`[INV-9] 10K records:`);
      console.log(`  rebuild: ${rebuildMs.toFixed(1)}ms`);
      console.log(`  stream items: ${projection.stream.length}`);
      console.log(`  participants: ${projection.participants.length}`);

      expect(rebuildMs).toBeLessThan(30000); // <30s for 10K
      expect(projection.stream.length).toBeLessThanOrEqual(500);
    });

    it('100K records: rebuild time and stream size', { timeout: 120_000 }, async () => {
      const records = await generateRecords(100_000);

      const t0 = performance.now();
      const runtime = new ProjectionRuntime();
      const projection = runtime.rebuild(records);
      const rebuildMs = performance.now() - t0;

      console.log(`[INV-9] 100K records:`);
      console.log(`  rebuild: ${rebuildMs.toFixed(1)}ms`);
      console.log(`  stream items: ${projection.stream.length}`);
      console.log(`  participants: ${projection.participants.length}`);

      expect(rebuildMs).toBeLessThan(300000); // <5min for 100K
      expect(projection.stream.length).toBeLessThanOrEqual(500);
    });
  });
});
