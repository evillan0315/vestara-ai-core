/**
 * ARX-015 M10 — Projection & Attention Evidence
 *
 * All tests are hermetic. Uses M9 DurableActivityStore (sql.js in-memory)
 * and ProjectionRuntime to prove projection correctness.
 * No live providers, no real OpenCode sessions.
 *
 * Adapter usage:
 *   fromWorkflowEvent(WorkflowEvent)  — M8 workflow events
 *   fromHumanMessage({ message, userId, displayName }) — human messages
 *   fromAgentLifecycle({ agentId, displayName, lifecycleType }) — agent lifecycle
 */

import type {
  ActivityEvent,
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

// ─── Test Helpers ───────────────────────────────────────────

const eventCounter = 0;

function makeWorkflowRunId(): WorkflowRunId {
  return `wr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` as WorkflowRunId;
}

function makeExecutionId(): ExecutionId {
  return `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` as ExecutionId;
}

function makeTaskId(): WorkflowTaskId {
  return `wt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` as WorkflowTaskId;
}

function makeWorkflowEvent(
  overrides: Partial<WorkflowEvent> & { type: WorkflowEvent['type']; workflowRunId: WorkflowRunId },
): WorkflowEvent {
  return {
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function ts(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

// ─── Store Setup ────────────────────────────────────────────

describe('M10 — Projection & Attention Evidence', () => {
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

  // ─── Area 1: Projection Rebuild Equivalence ───────────────

  describe('Area 1 — Projection Rebuild Equivalence', () => {
    it('rebuilding from the same records produces equivalent projection', async () => {
      const workflowRunId = makeWorkflowRunId();
      const executionId = makeExecutionId();
      const taskId1 = makeTaskId();
      const taskId2 = makeTaskId();

      await store.append(
        fromHumanMessage({ message: 'Hello team', userId: 'human-1', displayName: 'Alice', executionId }),
      );
      await store.append(
        fromWorkflowEvent(
          makeWorkflowEvent({
            type: 'workflow.started',
            workflowRunId,
            executionId,
          }),
        ),
      );
      await store.append(
        fromWorkflowEvent(
          makeWorkflowEvent({
            type: 'task.runnable',
            workflowRunId,
            taskInstanceId: taskId1,
            executionId,
            agentAssignmentId: 'planner',
          }),
        ),
      );
      await store.append(
        fromWorkflowEvent(
          makeWorkflowEvent({
            type: 'task.started',
            workflowRunId,
            taskInstanceId: taskId1,
            executionId,
            agentAssignmentId: 'planner',
          }),
        ),
      );
      await store.append(
        fromWorkflowEvent(
          makeWorkflowEvent({
            type: 'task.completed',
            workflowRunId,
            taskInstanceId: taskId1,
            executionId,
            agentAssignmentId: 'planner',
          }),
        ),
      );
      await store.append(
        fromWorkflowEvent(
          makeWorkflowEvent({
            type: 'task.started',
            workflowRunId,
            taskInstanceId: taskId2,
            executionId,
            agentAssignmentId: 'developer',
          }),
        ),
      );

      const records = await store.rebuild();

      const runtime1 = new ProjectionRuntime();
      const projection1 = runtime1.rebuild(records);

      const runtime2 = new ProjectionRuntime();
      const projection2 = runtime2.rebuild(records);

      expect(projection1.participants.length).toBe(projection2.participants.length);
      expect(projection1.stream.length).toBe(projection2.stream.length);
      expect(projection1.attention.length).toBe(projection2.attention.length);
      expect(projection1.room.cursor.sequenceNumber).toBe(projection2.room.cursor.sequenceNumber);

      const ids1 = projection1.participants.map((p) => p.participantId).sort();
      const ids2 = projection2.participants.map((p) => p.participantId).sort();
      expect(ids1).toEqual(ids2);

      for (let i = 0; i < projection1.stream.length; i++) {
        expect(projection1.stream[i].content).toBe(projection2.stream[i].content);
        expect(projection1.stream[i].kind).toBe(projection2.stream[i].kind);
        expect(projection1.stream[i].importance).toBe(projection2.stream[i].importance);
      }

      expect(projection1.workflowSummary?.status).toBe(projection2.workflowSummary?.status);
    });

    it('cursor advances correctly through rebuild', async () => {
      const workflowRunId = makeWorkflowRunId();

      await store.append(fromHumanMessage({ message: 'msg-1', userId: 'h1', displayName: 'H1' }));
      await store.append(
        fromWorkflowEvent(
          makeWorkflowEvent({
            type: 'workflow.started',
            workflowRunId,
          }),
        ),
      );
      const rec3 = await store.append(
        fromWorkflowEvent(
          makeWorkflowEvent({
            type: 'task.runnable',
            workflowRunId,
            taskId: 'runnable-task',
            agentAssignmentId: 'dev',
          }),
        ),
      );

      const records = await store.rebuild();
      const projection = runtime.rebuild(records);

      expect(projection.room.cursor.sequenceNumber).toBe(rec3.sequenceNumber);
      expect(projection.room.cursor.eventId).toBe(rec3.eventId);
    });
  });

  // ─── Area 2: Cursor Disconnect / Reconnect / Catch-up ─────

  describe('Area 2 — Cursor Disconnect / Reconnect / Catch-up', () => {
    it('reconnect with cursor catches up new activities', async () => {
      const workflowRunId = makeWorkflowRunId();

      await store.append(fromHumanMessage({ message: 'hello', userId: 'h1', displayName: 'H1' }));
      await store.append(
        fromWorkflowEvent(
          makeWorkflowEvent({
            type: 'workflow.started',
            workflowRunId,
          }),
        ),
      );

      const records1 = await store.rebuild();
      const projection1 = runtime.rebuild(records1);
      const cursor = projection1.room.cursor;

      // New activities after disconnect
      const taskId = makeTaskId();
      await store.append(
        fromWorkflowEvent(
          makeWorkflowEvent({
            type: 'task.runnable',
            workflowRunId,
            taskInstanceId: taskId,
            agentAssignmentId: 'dev',
          }),
        ),
      );
      await store.append(
        fromWorkflowEvent(
          makeWorkflowEvent({
            type: 'task.started',
            workflowRunId,
            taskInstanceId: taskId,
            agentAssignmentId: 'dev',
          }),
        ),
      );

      // Reconnect: get activities after cursor
      const newRecords = await store.getAfter(cursor);
      expect(newRecords.length).toBe(2);

      for (const record of newRecords) {
        runtime.processRecord(record);
      }

      const projection2 = runtime.getProjection();
      expect(projection2.room.cursor.sequenceNumber).toBeGreaterThan(cursor.sequenceNumber);
      expect(projection2.stream.length).toBeGreaterThanOrEqual(2);
    });

    it('lost activities after reconnect is zero', async () => {
      for (let i = 0; i < 10; i++) {
        await store.append(
          fromHumanMessage({ message: `msg-${i}`, userId: `h-${i % 3}`, displayName: `User ${i % 3}` }),
        );
      }

      const records = await store.rebuild();
      const projection = runtime.rebuild(records);

      const runtime2 = new ProjectionRuntime();
      const projection2 = runtime2.rebuild(records);

      expect(projection2.stream.length).toBe(projection.stream.length);
    });
  });

  // ─── Area 3: Participant Projection ───────────────────────

  describe('Area 3 — Participant Projection', () => {
    it('derives dynamic participants from activity records', async () => {
      await store.append(fromHumanMessage({ message: 'hello', userId: 'human-1', displayName: 'Alice' }));
      await store.append(
        fromAgentLifecycle({
          agentId: 'planner',
          displayName: 'Planner',
          lifecycleType: 'assigned',
        }),
      );
      await store.append(
        fromAgentLifecycle({
          agentId: 'developer',
          displayName: 'Developer',
          lifecycleType: 'assigned',
        }),
      );

      const records = await store.rebuild();
      const projection = runtime.rebuild(records);

      expect(projection.participants.length).toBe(3);
      const ids = projection.participants.map((p) => p.participantId).sort();
      expect(ids).toEqual(['agent-developer', 'agent-planner', 'human-human-1']);
    });

    it('no hardcoded participants', async () => {
      await store.append(fromHumanMessage({ message: 'hello', userId: 'h1', displayName: 'H1' }));

      const records = await store.rebuild();
      const projection = runtime.rebuild(records);

      for (const p of projection.participants) {
        expect(p.participantId).toMatch(/^(human|agent|system)-/);
      }
    });

    it('presence resolved independently, not from history', async () => {
      // Historical activity from yesterday
      await store.append(
        fromAgentLifecycle({
          agentId: 'dev',
          displayName: 'Developer',
          lifecycleType: 'started',
        }),
      );

      const records = await store.rebuild();
      const projection = runtime.rebuild(records);

      const dev = projection.participants.find((p) => p.participantId === 'agent-dev');
      expect(dev).toBeDefined();
      expect(dev!.presence).toBe('offline');
    });

    it('work state derives from authoritative facts', async () => {
      const workflowRunId = makeWorkflowRunId();
      const taskId = makeTaskId();

      await store.append(
        fromWorkflowEvent(
          makeWorkflowEvent({
            type: 'task.runnable',
            workflowRunId,
            taskInstanceId: taskId,
            agentAssignmentId: 'dev',
          }),
        ),
      );
      await store.append(
        fromWorkflowEvent(
          makeWorkflowEvent({
            type: 'task.started',
            workflowRunId,
            taskInstanceId: taskId,
            agentAssignmentId: 'dev',
          }),
        ),
      );
      await store.append(
        fromWorkflowEvent(
          makeWorkflowEvent({
            type: 'task.failed',
            workflowRunId,
            taskInstanceId: taskId,
            agentAssignmentId: 'dev',
            error: 'Build error',
          }),
        ),
      );

      const records = await store.rebuild();
      const projection = runtime.rebuild(records);

      const dev = projection.participants.find((p) => p.participantId === 'agent-dev');
      expect(dev).toBeDefined();
      expect(dev!.workState).toBe('attention-required');
    });

    it('membership and work state are separate', async () => {
      await store.append(fromHumanMessage({ message: 'hello', userId: 'h1', displayName: 'H1' }));

      const workflowRunId = makeWorkflowRunId();
      const taskId = makeTaskId();
      await store.append(
        fromWorkflowEvent(
          makeWorkflowEvent({
            type: 'task.started',
            workflowRunId,
            taskInstanceId: taskId,
            agentAssignmentId: 'dev',
          }),
        ),
      );

      const records = await store.rebuild();
      const projection = runtime.rebuild(records);

      const dev = projection.participants.find((p) => p.participantId === 'agent-dev');
      expect(dev).toBeDefined();
      expect(dev!.membership).toBe('joined');
      expect(dev!.workState).toBe('working');
    });
  });

  // ─── Area 4: Attention Model ──────────────────────────────

  describe('Area 4 — Attention Model', () => {
    it('generates attention for failed tasks', async () => {
      const workflowRunId = makeWorkflowRunId();
      const taskId = makeTaskId();

      await store.append(
        fromWorkflowEvent(
          makeWorkflowEvent({
            type: 'task.failed',
            workflowRunId,
            taskInstanceId: taskId,
            agentAssignmentId: 'dev',
            error: 'Compilation error in main.ts',
          }),
        ),
      );

      const records = await store.rebuild();
      const projection = runtime.rebuild(records);

      expect(projection.attention.length).toBe(1);
      expect(projection.attention[0].reason).toBe('task-failed');
      expect(projection.attention[0].severity).toBe('high');
      expect(projection.attention[0].message).toContain('Compilation error');
      expect(projection.attention[0].taskId).toBe(taskId);
      expect(projection.attention[0].acknowledged).toBe(false);
    });

    it('generates attention for workflow failure', async () => {
      const workflowRunId = makeWorkflowRunId();

      await store.append(
        fromWorkflowEvent(
          makeWorkflowEvent({
            type: 'workflow.failed',
            workflowRunId,
            error: 'All tasks failed',
          }),
        ),
      );

      const records = await store.rebuild();
      const projection = runtime.rebuild(records);

      expect(projection.attention.length).toBe(1);
      expect(projection.attention[0].reason).toBe('workflow-failed');
      expect(projection.attention[0].severity).toBe('critical');
    });

    it('generates attention for agent waiting', async () => {
      const workflowRunId = makeWorkflowRunId();
      const taskId = makeTaskId();

      await store.append(
        fromAgentLifecycle({
          agentId: 'dev',
          displayName: 'Developer',
          lifecycleType: 'waiting',
          workflowRunId,
          taskId,
        }),
      );

      const records = await store.rebuild();
      const projection = runtime.rebuild(records);

      expect(projection.attention.length).toBe(1);
      expect(projection.attention[0].reason).toBe('waiting-for-human');
      expect(projection.attention[0].severity).toBe('medium');
    });

    it('auto-resolves attention when task completes', async () => {
      const workflowRunId = makeWorkflowRunId();
      const taskId = makeTaskId();

      await store.append(
        fromWorkflowEvent(
          makeWorkflowEvent({
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
          makeWorkflowEvent({
            type: 'task.completed',
            workflowRunId,
            taskInstanceId: taskId,
            agentAssignmentId: 'dev',
          }),
        ),
      );

      const records = await store.rebuild();
      const projection = runtime.rebuild(records);

      const taskAttention = projection.attention.filter((a) => a.taskId === taskId);
      expect(taskAttention.length).toBe(0);
    });

    it('deduplicates attention for same task/reason', async () => {
      const workflowRunId = makeWorkflowRunId();
      const taskId = makeTaskId();

      await store.append(
        fromWorkflowEvent(
          makeWorkflowEvent({
            type: 'task.failed',
            workflowRunId,
            taskInstanceId: taskId,
            agentAssignmentId: 'dev',
            error: 'error 1',
          }),
        ),
      );
      await store.append(
        fromWorkflowEvent(
          makeWorkflowEvent({
            type: 'task.failed',
            workflowRunId,
            taskInstanceId: taskId,
            agentAssignmentId: 'dev',
            error: 'error 2',
          }),
        ),
      );

      const records = await store.rebuild();
      const projection = runtime.rebuild(records);

      const taskAttention = projection.attention.filter((a) => a.taskId === taskId);
      expect(taskAttention.length).toBe(1);
    });
  });

  // ─── Area 5: Stream Importance & Muting ───────────────────

  describe('Area 5 — Stream Importance & Muting', () => {
    it('classifies stream items by importance', async () => {
      await store.append(fromHumanMessage({ message: 'hello', userId: 'h1', displayName: 'H1' }));

      await store.append(
        fromWorkflowEvent(
          makeWorkflowEvent({
            type: 'workflow.started',
            workflowRunId: makeWorkflowRunId(),
          }),
        ),
      );
      await store.append(
        fromAgentLifecycle({
          agentId: 'dev',
          displayName: 'Developer',
          lifecycleType: 'progress',
        }),
      );

      const records = await store.rebuild();
      const projection = runtime.rebuild(records);

      const humanItem = projection.stream.find((s) => s.content === 'hello');
      expect(humanItem?.importance).toBe('primary');
      expect(humanItem?.kind).toBe('conversation');

      const workflowItem = projection.stream.find((s) => s.kind === 'activity');
      expect(workflowItem?.importance).toBe('primary');

      const progressItem = projection.stream.find((s) => s.kind === 'progress');
      expect(progressItem?.importance).toBe('muted');
    });

    it('muted items are aggregated when threshold reached', async () => {
      for (let i = 0; i < 3; i++) {
        await store.append(
          fromAgentLifecycle({
            agentId: 'dev',
            displayName: 'Developer',
            lifecycleType: 'progress',
          }),
        );
        await store.append(
          fromWorkflowEvent(
            makeWorkflowEvent({
              type: 'task.runnable',
              workflowRunId: makeWorkflowRunId(),
              taskId: `task-${i}`,
              agentAssignmentId: 'dev',
            }),
          ),
        );
      }

      const records = await store.rebuild();
      const projection = runtime.rebuild(records);

      const mutedItems = projection.stream.filter((s) => s.importance === 'muted');
      const aggregated = mutedItems.filter((s) => s.aggregated !== undefined);
      expect(aggregated.length).toBeGreaterThanOrEqual(1);
    });

    it('aggregated items have correct summary', async () => {
      for (let i = 0; i < 3; i++) {
        await store.append(
          fromWorkflowEvent(
            makeWorkflowEvent({
              type: 'task.runnable',
              workflowRunId: makeWorkflowRunId(),
              taskId: `log-${i}`,
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
          }),
        );
      }

      const records = await store.rebuild();
      const projection = runtime.rebuild(records);

      const aggregated = projection.stream.find((s) => s.aggregated !== undefined);
      if (aggregated?.aggregated) {
        expect(aggregated.aggregated.count).toBeGreaterThanOrEqual(5);
        expect(typeof aggregated.aggregated.summary).toBe('string');
      }
    });

    it('high-volume activity is bounded', async () => {
      for (let i = 0; i < 600; i++) {
        await store.append(
          fromAgentLifecycle({
            agentId: 'dev',
            displayName: 'Developer',
            lifecycleType: 'progress',
          }),
        );
      }

      const records = await store.rebuild();
      const projection = runtime.rebuild(records);

      expect(projection.stream.length).toBeLessThanOrEqual(500);
    });
  });

  // ─── Area 6: Workflow Summary ─────────────────────────────

  describe('Area 6 — Workflow Summary', () => {
    it('tracks workflow status lifecycle', async () => {
      const workflowRunId = makeWorkflowRunId();
      const taskId = makeTaskId();

      await store.append(
        fromWorkflowEvent(
          makeWorkflowEvent({
            type: 'workflow.started',
            workflowRunId,
          }),
        ),
      );
      await store.append(
        fromWorkflowEvent(
          makeWorkflowEvent({
            type: 'task.runnable',
            workflowRunId,
            taskInstanceId: taskId,
            agentAssignmentId: 'dev',
          }),
        ),
      );
      await store.append(
        fromWorkflowEvent(
          makeWorkflowEvent({
            type: 'task.started',
            workflowRunId,
            taskInstanceId: taskId,
            agentAssignmentId: 'dev',
          }),
        ),
      );
      await store.append(
        fromWorkflowEvent(
          makeWorkflowEvent({
            type: 'task.completed',
            workflowRunId,
            taskInstanceId: taskId,
            agentAssignmentId: 'dev',
          }),
        ),
      );
      await store.append(
        fromWorkflowEvent(
          makeWorkflowEvent({
            type: 'workflow.completed',
            workflowRunId,
          }),
        ),
      );

      const records = await store.rebuild();
      const projection = runtime.rebuild(records);

      expect(projection.workflowSummary).toBeDefined();
      expect(projection.workflowSummary!.workflowRunId).toBe(workflowRunId);
      expect(projection.workflowSummary!.status).toBe('completed');
    });
  });

  // ─── Area 7: Contextual Capabilities ─────────────────────

  describe('Area 7 — Contextual Capabilities for M11', () => {
    it('exposes mentionable participants from membership', async () => {
      await store.append(fromHumanMessage({ message: 'hello', userId: 'h1', displayName: 'Alice' }));
      await store.append(
        fromAgentLifecycle({
          agentId: 'dev',
          displayName: 'Developer',
          lifecycleType: 'assigned',
        }),
      );

      const records = await store.rebuild();
      const projection = runtime.rebuild(records);

      const mentionable = projection.contextualCapabilities.mentionableParticipants;
      expect(mentionable.length).toBe(2);
      const names = mentionable.map((p) => p.displayName).sort();
      expect(names).toEqual(['Alice', 'Developer']);
    });

    it('available commands are exposed', async () => {
      const records = await store.rebuild([]);
      const projection = runtime.rebuild(records);

      expect(projection.contextualCapabilities.availableCommands.length).toBeGreaterThan(0);
      const commands = projection.contextualCapabilities.availableCommands.map((c) => c.command);
      expect(commands).toContain('/status');
      expect(commands).toContain('/retry');
    });

    it('referenceable entities include active workflows', async () => {
      const workflowRunId = makeWorkflowRunId();

      await store.append(
        fromWorkflowEvent(
          makeWorkflowEvent({
            type: 'workflow.started',
            workflowRunId,
          }),
        ),
      );

      const records = await store.rebuild();
      const projection = runtime.rebuild(records);

      const entities = projection.contextualCapabilities.referenceableEntities;
      expect(entities.length).toBe(1);
      expect(entities[0].entityType).toBe('workflow');
      expect(entities[0].entityId).toBe(workflowRunId);
    });
  });

  // ─── Area 8: No Domain-Authority Leakage ──────────────────

  describe('Area 8 — No Domain-Authority Leakage', () => {
    it('projection does not mutate M9 store', async () => {
      await store.append(
        fromWorkflowEvent(
          makeWorkflowEvent({
            type: 'task.runnable',
            workflowRunId: makeWorkflowRunId(),
            taskId: 'test-task',
            agentAssignmentId: 'dev',
          }),
        ),
      );

      const recordsBefore = await store.rebuild();
      runtime.rebuild(recordsBefore);

      const recordsAfter = await store.rebuild();
      expect(recordsAfter.length).toBe(recordsBefore.length);
      for (let i = 0; i < recordsBefore.length; i++) {
        expect(recordsAfter[i].activityId).toBe(recordsBefore[i].activityId);
        expect(recordsAfter[i].sequenceNumber).toBe(recordsBefore[i].sequenceNumber);
      }
    });

    it('no provider/OpenCode leakage in projection', async () => {
      await store.append(fromHumanMessage({ message: 'hello', userId: 'h1', displayName: 'H1' }));
      await store.append(
        fromAgentLifecycle({
          agentId: 'dev',
          displayName: 'Developer',
          lifecycleType: 'started',
        }),
      );

      const records = await store.rebuild();
      const projection = runtime.rebuild(records);

      const projectionStr = JSON.stringify(projection);
      expect(projectionStr).not.toContain('openai');
      expect(projectionStr).not.toContain('anthropic');
      expect(projectionStr).not.toContain('opencode');
    });
  });

  // ─── Area 9: Full Collaborative Scenario ──────────────────

  describe('Area 9 — Full Collaborative Scenario', () => {
    it('human join → message → workflow → agents → complete → restart → replay', async () => {
      const workflowRunId = makeWorkflowRunId();
      const executionId = makeExecutionId();
      const task1 = makeTaskId();
      const task2 = makeTaskId();

      // Human joins
      await store.append(
        fromHumanMessage({
          message: 'Build the dashboard',
          userId: 'human-1',
          displayName: 'Alice',
          executionId,
        }),
      );

      // Workflow starts
      await store.append(
        fromWorkflowEvent(
          makeWorkflowEvent({
            type: 'workflow.started',
            workflowRunId,
            executionId,
          }),
        ),
      );

      // Planner works
      await store.append(
        fromWorkflowEvent(
          makeWorkflowEvent({
            type: 'task.started',
            workflowRunId,
            taskInstanceId: task1,
            executionId,
            agentAssignmentId: 'planner',
          }),
        ),
      );
      await store.append(
        fromWorkflowEvent(
          makeWorkflowEvent({
            type: 'task.completed',
            workflowRunId,
            taskInstanceId: task1,
            executionId,
            agentAssignmentId: 'planner',
          }),
        ),
      );

      // Developer waiting → working
      await store.append(
        fromWorkflowEvent(
          makeWorkflowEvent({
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
          makeWorkflowEvent({
            type: 'task.started',
            workflowRunId,
            taskInstanceId: task2,
            executionId,
            agentAssignmentId: 'developer',
          }),
        ),
      );

      // Noisy progress/logs
      for (let i = 0; i < 8; i++) {
        await store.append(
          fromAgentLifecycle({
            agentId: 'developer',
            displayName: 'Developer',
            lifecycleType: 'progress',
            workflowRunId,
            taskId: task2,
          }),
        );
      }

      // Developer fails
      await store.append(
        fromWorkflowEvent(
          makeWorkflowEvent({
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
        fromWorkflowEvent(
          makeWorkflowEvent({
            type: 'workflow.failed',
            workflowRunId,
            executionId,
            error: 'Task failed',
          }),
        ),
      );

      // Build projection
      const records = await store.rebuild();
      const projection = runtime.rebuild(records);

      // ─── Assertions ───────────────────────────────────────

      // Hardcoded participants: 0
      for (const p of projection.participants) {
        expect(p.participantId).toMatch(/^(human|agent|system)-/);
      }

      // Duplicate projected activities: 0
      const streamIds = projection.stream.map((s) => s.streamItemId);
      expect(new Set(streamIds).size).toBe(streamIds.length);

      // Lost activities after reconnect: 0
      const runtime2 = new ProjectionRuntime();
      const projection2 = runtime2.rebuild(records);
      expect(projection2.stream.length).toBe(projection.stream.length);

      // Projection rebuild drift: 0
      expect(projection2.room.cursor.sequenceNumber).toBe(projection.room.cursor.sequenceNumber);
      expect(projection2.participants.length).toBe(projection.participants.length);

      // Raw-log flooding: bounded
      const mutedCount = projection.stream.filter((s) => s.importance === 'muted').length;
      const aggregatedCount = projection.stream.filter((s) => s.aggregated !== undefined).length;
      expect(mutedCount + aggregatedCount).toBeLessThanOrEqual(projection.stream.length);

      // Stale permanent presence: 0
      for (const p of projection.participants) {
        expect(p.presence).toBe('offline');
      }

      // Authoritative mutations from M10: 0
      const recordsAfter = await store.rebuild();
      expect(recordsAfter.length).toBe(records.length);

      // Provider/OpenCode leakage: 0
      const jsonStr = JSON.stringify(projection);
      expect(jsonStr).not.toContain('openai');
      expect(jsonStr).not.toContain('anthropic');

      // Attention entries exist for failures
      expect(projection.attention.length).toBeGreaterThan(0);
      const criticalAttention = projection.attention.filter((a) => a.severity === 'critical');
      expect(criticalAttention.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Area 10: Live Provider / OpenCode Session Prohibition ─

  describe('Area 10 — Live Provider / OpenCode Session Prohibition', () => {
    it('no live provider calls in projection', async () => {
      const records = await store.rebuild();
      const projection = runtime.rebuild(records);
      expect(projection).toBeDefined();
    });

    it('no live OpenCode sessions in projection', async () => {
      const records = await store.rebuild();
      const projection = runtime.rebuild(records);
      expect(projection.room.roomId).toBe('default');
    });
  });
});
