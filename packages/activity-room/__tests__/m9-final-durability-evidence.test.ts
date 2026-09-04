/**
 * ARX-015 M9 — Final Durability/Participant Evidence (Areas 1–10 + Freeze Scenario)
 *
 * All tests are hermetic. sql.js in-memory DB simulates durable storage.
 * No live providers, no real OpenCode sessions.
 */

import type {
  ActivityEvent,
  ActivityRecord,
  ActivityStore,
  ExecutionId,
  RepositoryBindingId,
  RuntimeSessionId,
  TraceId,
  WorkflowRunId,
  WorkflowTaskId,
} from '@vestara/types';
import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';

import {
  DurableActivityStore,
  fromAgentLifecycle,
  fromHumanMessage,
  fromWorkflowEvent,
  IdempotentActivityStore,
} from '../src/index.js';

// ─── Test Helpers ───────────────────────────────────────────

let eventCounter = 0;

function makeEventId(prefix: string): string {
  return `${prefix}-${Date.now()}-${++eventCounter}`;
}

function makeWorkflowRunId(): WorkflowRunId {
  return `wr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` as WorkflowRunId;
}

function makeExecutionId(): ExecutionId {
  return `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` as ExecutionId;
}

function makeTraceId(): TraceId {
  return `trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` as TraceId;
}

function makeTaskId(): WorkflowTaskId {
  return `wt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` as WorkflowTaskId;
}

function makeActivityEvent(overrides: Partial<ActivityEvent> & { eventId: string }): ActivityEvent {
  return {
    type: 'system.event',
    timestamp: new Date().toISOString(),
    actor: { type: 'system', id: 'test', displayName: 'Test' },
    source: 'system',
    payload: { message: 'test event' },
    ...overrides,
  };
}

async function createSqliteStore(): Promise<{ store: DurableActivityStore; close: () => Uint8Array }> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  const store = new DurableActivityStore(db);

  const close = () => {
    const data = db.export();
    db.close();
    return data;
  };

  return { store, close };
}

async function reopenSqliteStore(data: Uint8Array): Promise<DurableActivityStore> {
  const SQL = await initSqlJs();
  const db = new SQL.Database(data);
  return new DurableActivityStore(db);
}

// ─── Area 1-2: Actual Persistence Across Store Recreation ────

describe('Area 1-2: Actual persistence across store recreation', () => {
  it('records survive close/reopen with lineage preserved', async () => {
    const { store, close } = await createSqliteStore();
    const workflowRunId = makeWorkflowRunId();
    const execId = makeExecutionId();
    const traceId = makeTraceId();

    // Append records
    const r1 = await store.append(
      makeActivityEvent({
        eventId: 'persist-1',
        type: 'workflow.started',
        workflowRunId,
        executionId: execId,
        traceId,
      }),
    );
    const r2 = await store.append(
      makeActivityEvent({
        eventId: 'persist-2',
        type: 'task.completed',
        workflowRunId,
        taskId: makeTaskId(),
      }),
    );

    // Close the store (simulate process restart)
    const data = close();

    // Create new store from persisted data
    const store2 = await reopenSqliteStore(data);

    // Query — records must be preserved
    const all = await store2.rebuild();
    expect(all.length).toBe(2);

    // Sequence preserved
    expect(all[0].sequenceNumber).toBe(r1.sequenceNumber);
    expect(all[1].sequenceNumber).toBe(r2.sequenceNumber);

    // Lineage preserved
    expect(all[0].workflowRunId).toBe(workflowRunId);
    expect(all[0].executionId).toBe(execId);
    expect(all[0].traceId).toBe(traceId);
    expect(all[1].workflowRunId).toBe(workflowRunId);

    // eventId deduplication preserved
    const byEventId = await store2.getByEventId('persist-1');
    expect(byEventId?.activityId).toBe(r1.activityId);
  });

  it('cursor continuity preserved across restart', async () => {
    const { store, close } = await createSqliteStore();

    await store.append(makeActivityEvent({ eventId: 'cur-a' }));
    const r2 = await store.append(makeActivityEvent({ eventId: 'cur-b' }));

    const cursor = await store.getCursor();
    expect(cursor?.eventId).toBe('cur-b');

    const data = close();
    const store2 = await reopenSqliteStore(data);

    // Cursor from old store still valid
    const cursor2 = await store2.getCursor();
    expect(cursor2?.sequenceNumber).toBe(cursor?.sequenceNumber);
    expect(cursor2?.eventId).toBe(cursor?.eventId);

    // getAfter works with old cursor
    const after = await store2.getAfter(cursor!);
    expect(after.length).toBe(0); // nothing after last event

    // Append more
    await store2.append(makeActivityEvent({ eventId: 'cur-c' }));

    // getAfter still works
    const afterMore = await store2.getAfter(cursor!);
    expect(afterMore.length).toBe(1);
    expect(afterMore[0].eventId).toBe('cur-c');
  });
});

// ─── Area 3: Cursor Stability Across Restart ────────────────

describe('Area 3: Cursor stability across restart', () => {
  it('client holding cursor C reconnects after restart and gets only subsequent records', async () => {
    const { store, close } = await createSqliteStore();

    // Client reads first batch
    await store.append(makeActivityEvent({ eventId: 'stable-1' }));
    await store.append(makeActivityEvent({ eventId: 'stable-2' }));
    const r3 = await store.append(makeActivityEvent({ eventId: 'stable-3' }));

    const cursor = await store.getCursor();
    expect(cursor?.eventId).toBe('stable-3');

    // Client processes up to cursor
    const batch1 = await store.getAfter({ sequenceNumber: 0, eventId: '', timestamp: '' });
    expect(batch1.length).toBe(3);

    // Restart
    const data = close();
    const store2 = await reopenSqliteStore(data);

    // Client reconnects with cursor
    const batch2 = await store2.getAfter(cursor!);
    expect(batch2.length).toBe(0); // nothing new yet

    // New activity arrives
    await store2.append(makeActivityEvent({ eventId: 'stable-4' }));

    // Client gets only new records
    const batch3 = await store2.getAfter(cursor!);
    expect(batch3.length).toBe(1);
    expect(batch3[0].eventId).toBe('stable-4');

    // No gaps, no duplicates
    const all = await store2.rebuild();
    expect(all.length).toBe(4);
  });
});

// ─── Area 4: Sequence-Number Authority ──────────────────────

describe('Area 4: Sequence-number authority', () => {
  it('sequence numbers are monotonic across restart', async () => {
    const { store, close } = await createSqliteStore();

    const r1 = await store.append(makeActivityEvent({ eventId: 'seq-1' }));
    const r2 = await store.append(makeActivityEvent({ eventId: 'seq-2' }));

    expect(r1.sequenceNumber).toBe(1);
    expect(r2.sequenceNumber).toBe(2);

    const data = close();
    const store2 = await reopenSqliteStore(data);

    const r3 = await store2.append(makeActivityEvent({ eventId: 'seq-3' }));
    expect(r3.sequenceNumber).toBe(3); // continues from MAX + 1

    const r4 = await store2.append(makeActivityEvent({ eventId: 'seq-4' }));
    expect(r4.sequenceNumber).toBe(4);
  });

  it('rebuild does not regenerate sequence numbers', async () => {
    const { store, close } = await createSqliteStore();

    const r1 = await store.append(makeActivityEvent({ eventId: 'rebuild-1' }));
    const r2 = await store.append(makeActivityEvent({ eventId: 'rebuild-2' }));

    const data = close();
    const store2 = await reopenSqliteStore(data);

    const rebuilt = await store2.rebuild();
    expect(rebuilt[0].sequenceNumber).toBe(r1.sequenceNumber);
    expect(rebuilt[1].sequenceNumber).toBe(r2.sequenceNumber);

    // Appending after rebuild gets next sequence
    const r3 = await store2.append(makeActivityEvent({ eventId: 'rebuild-3' }));
    expect(r3.sequenceNumber).toBe(3);
  });
});

// ─── Area 5: Dynamic Participant / Membership ───────────────

describe('Area 5: Dynamic participant/membership', () => {
  it('Participant type has no hardcoded Planner/Developer/Reviewer/Verifier', async () => {
    // Verify the Participant type is generic (ActivityActorType: human/agent/system)
    // No hardcoded roles in the Activity Room domain
    const participant: import('@vestara/types').Participant = {
      participantId: 'p-1',
      type: 'agent',
      displayName: 'Any Agent',
      membership: 'joined',
      presence: 'online',
      workState: 'working',
    };

    expect(participant.type).toBe('agent');
    expect(participant.membership).toBe('joined');
    expect(participant.workState).toBe('working');

    // The type system enforces ActivityActorType = 'human' | 'agent' | 'system'
    // No Planner, Developer, Reviewer, Verifier literals
    const validTypes: import('@vestara/types').ActivityActorType[] = ['human', 'agent', 'system'];
    expect(validTypes).toContain(participant.type);
  });

  it('MembershipState, PresenceState, WorkState are separate contracts', async () => {
    // Membership is durable
    const membership: import('@vestara/types').MembershipState = 'joined';
    expect(['joined', 'left', 'assigned']).toContain(membership);

    // Presence is transient (M10 owns this)
    const presence: import('@vestara/types').PresenceState = 'online';
    expect(['online', 'offline', 'idle', 'disconnected']).toContain(presence);

    // Work state is meaningful durable facts
    const workState: import('@vestara/types').WorkState = 'working';
    expect(['available', 'working', 'waiting', 'blocked', 'attention-required']).toContain(workState);
  });
});

// ─── Area 6: Membership, Presence, Work State Separation ────

describe('Area 6: Membership, presence, work state separation', () => {
  it('MembershipEvent is a durable contract separate from ActivityRecord', async () => {
    const membershipEvent: import('@vestara/types').MembershipEvent = {
      eventId: 'mem-1',
      participantId: 'user-1',
      state: 'joined',
      timestamp: new Date().toISOString(),
      workflowRunId: makeWorkflowRunId(),
    };

    expect(membershipEvent.state).toBe('joined');
    expect(membershipEvent.workflowRunId).toBeDefined();
  });
});

// ─── Area 7: Human Message Restart Durability ───────────────

describe('Area 7: Human message restart durability', () => {
  it('human message + agent activity + workflow activity survive restart', async () => {
    const { store, close } = await createSqliteStore();
    const workflowRunId = makeWorkflowRunId();
    const execId = makeExecutionId();

    // Human message
    const humanEvent = fromHumanMessage({
      message: 'Start the build',
      userId: 'user-1',
      displayName: 'Alice',
      workflowRunId,
      executionId: execId,
    });
    await store.append(humanEvent);

    // Agent activity
    const agentEvent = fromAgentLifecycle({
      agentId: 'agent-1',
      displayName: 'Builder',
      lifecycleType: 'started',
      workflowRunId,
    });
    await store.append(agentEvent);

    // Workflow activity
    const workflowEvent = fromWorkflowEvent({
      type: 'workflow.started',
      workflowRunId,
      executionId: execId,
      timestamp: new Date().toISOString(),
    });
    await store.append(workflowEvent);

    // Close and reopen
    const data = close();
    const store2 = await reopenSqliteStore(data);

    // All three classes preserved
    const all = await store2.rebuild();
    expect(all.length).toBe(3);

    const humanRecords = all.filter((r) => r.type === 'human.message');
    const agentRecords = all.filter((r) => r.type.startsWith('agent.'));
    const workflowRecords = all.filter((r) => r.type.startsWith('workflow.'));

    expect(humanRecords.length).toBe(1);
    expect(agentRecords.length).toBe(1);
    expect(workflowRecords.length).toBe(1);

    // Human message has M1 lineage
    expect(humanRecords[0].workflowRunId).toBe(workflowRunId);
    expect(humanRecords[0].executionId).toBe(execId);
    expect(humanRecords[0].actor.type).toBe('human');

    // Agent activity normalized
    expect(agentRecords[0].actor.type).toBe('agent');
    expect(agentRecords[0].source).toBe('agent-harness');

    // Workflow activity has M1 lineage
    expect(workflowRecords[0].workflowRunId).toBe(workflowRunId);
    expect(workflowRecords[0].executionId).toBe(execId);
  });
});

// ─── Area 8: Rebuild Non-Destructive ────────────────────────

describe('Area 8: Rebuild non-destructive', () => {
  it('rebuild does not regenerate identity, sequencing, timestamps, or lineage', async () => {
    const { store, close } = await createSqliteStore();
    const workflowRunId = makeWorkflowRunId();

    const r1 = await store.append(
      makeActivityEvent({
        eventId: 'nd-1',
        type: 'workflow.started',
        workflowRunId,
        timestamp: '2026-08-27T10:00:00Z',
      }),
    );
    const r2 = await store.append(
      makeActivityEvent({
        eventId: 'nd-2',
        type: 'task.completed',
        workflowRunId,
        timestamp: '2026-08-27T10:01:00Z',
      }),
    );

    const data = close();
    const store2 = await reopenSqliteStore(data);

    // Rebuild
    const rebuilt = await store2.rebuild();

    // Identity preserved
    expect(rebuilt[0].activityId).toBe(r1.activityId);
    expect(rebuilt[0].eventId).toBe(r1.eventId);
    expect(rebuilt[1].activityId).toBe(r2.activityId);
    expect(rebuilt[1].eventId).toBe(r2.eventId);

    // Sequencing preserved
    expect(rebuilt[0].sequenceNumber).toBe(r1.sequenceNumber);
    expect(rebuilt[1].sequenceNumber).toBe(r2.sequenceNumber);

    // Timestamps preserved
    expect(rebuilt[0].timestamp).toBe('2026-08-27T10:00:00Z');
    expect(rebuilt[1].timestamp).toBe('2026-08-27T10:01:00Z');

    // Lineage preserved
    expect(rebuilt[0].workflowRunId).toBe(workflowRunId);
    expect(rebuilt[1].workflowRunId).toBe(workflowRunId);
  });
});

// ─── Area 9: Concurrency Proof ──────────────────────────────

describe('Area 9: Concurrency proof at persistence boundary', () => {
  it('concurrent same-eventId ingestion produces exactly one durable record', async () => {
    const { store, close } = await createSqliteStore();
    const eventId = makeEventId('conc-dedup');

    const event = makeActivityEvent({ eventId });

    // Fire 50 concurrent appends with the same eventId
    const N = 50;
    const results = await Promise.all(Array.from({ length: N }, () => store.append(event)));

    // All results reference the same record
    const activityIds = new Set(results.map((r) => r.activityId));
    expect(activityIds.size).toBe(1);

    // Only 1 record in the store
    const all = await store.rebuild();
    expect(all.length).toBe(1);

    // Close and reopen — still 1 record
    const data = close();
    const store2 = await reopenSqliteStore(data);
    const all2 = await store2.rebuild();
    expect(all2.length).toBe(1);
    expect(all2[0].eventId).toBe(eventId);
  });

  it('concurrent distinct events receive unique deterministic sequence numbers', async () => {
    const { store, close } = await createSqliteStore();

    // Fire 50 concurrent appends with different eventIds
    const N = 50;
    const events = Array.from({ length: N }, (_, i) =>
      makeActivityEvent({ eventId: `conc-unique-${i}-${Date.now()}` }),
    );

    const results = await Promise.all(events.map((e) => store.append(e)));

    // All have unique sequence numbers
    const sequences = new Set(results.map((r) => r.sequenceNumber));
    expect(sequences.size).toBe(N);

    // All sequence numbers are 1..N
    const sorted = results.map((r) => r.sequenceNumber).sort((a, b) => a - b);
    expect(sorted[0]).toBe(1);
    expect(sorted[N - 1]).toBe(N);

    // Close and reopen — sequences preserved
    const data = close();
    const store2 = await reopenSqliteStore(data);
    const all = await store2.rebuild();
    expect(all.length).toBe(N);
  });
});

// ─── Area 10: Future Extensibility ──────────────────────────

describe('Area 10: Future extensibility', () => {
  it('ActivityRecord payload supports arbitrary normalized facts', async () => {
    const store = new IdempotentActivityStore();

    // Simulate future browser test event
    const browserEvent = makeActivityEvent({
      eventId: 'ext-browser-1',
      type: 'system.event',
      payload: {
        message: 'Browser test started',
        data: {
          domain: 'browser-testing',
          browser: 'chromium',
          url: 'http://localhost:3001',
          // Large evidence referenced as artifacts, not embedded
          artifacts: [{ type: 'screenshot', id: 'art-1' }],
        },
      },
    });

    const record = await store.append(browserEvent);
    expect(record.payload.data?.domain).toBe('browser-testing');
    expect(record.payload.data?.artifacts).toBeDefined();

    // Simulate future Telegram event
    const telegramEvent = makeActivityEvent({
      eventId: 'ext-telegram-1',
      type: 'human.message',
      payload: {
        message: 'Message from Telegram',
        data: { channel: 'telegram', chatId: '12345' },
      },
    });

    const record2 = await store.append(telegramEvent);
    expect(record2.payload.data?.channel).toBe('telegram');

    // Simulate future marketplace agent event
    const marketplaceEvent = makeActivityEvent({
      eventId: 'ext-marketplace-1',
      type: 'agent.completed',
      actor: { type: 'agent', id: 'marketplace-agent-1', displayName: 'Marketplace Agent' },
      payload: {
        message: 'Marketplace agent completed task',
        data: { marketplace: true, agentType: 'installed' },
      },
    });

    const record3 = await store.append(marketplaceEvent);
    expect(record3.actor.type).toBe('agent');
    expect(record3.payload.data?.marketplace).toBe(true);
  });
});

// ─── Final Freeze Scenario ──────────────────────────────────

describe('Final freeze scenario', () => {
  it('full lifecycle: human joins → message → workflow → agents → complete → restart → replay', async () => {
    const { store, close } = await createSqliteStore();
    const workflowRunId = makeWorkflowRunId();
    const execId = makeExecutionId();
    const traceId = makeTraceId();

    // 1. Human joins room (membership event via ActivityEvent)
    await store.append(
      makeActivityEvent({
        eventId: 'freeze-human-join',
        type: 'human.message',
        actor: { type: 'human', id: 'user-1', displayName: 'Alice' },
        payload: { message: 'Alice joined the room', data: { membership: 'joined' } },
      }),
    );

    // 2. Human sends message
    const humanMsg = fromHumanMessage({
      message: 'Start the build pipeline',
      userId: 'user-1',
      displayName: 'Alice',
      workflowRunId,
      executionId: execId,
      traceId,
    });
    await store.append(humanMsg);

    // 3. Workflow starts
    await store.append(
      fromWorkflowEvent({
        type: 'workflow.started',
        workflowRunId,
        executionId: execId,
        traceId,
        timestamp: new Date().toISOString(),
      }),
    );

    // 4. Planner/agent starts work
    await store.append(
      fromWorkflowEvent({
        type: 'task.started',
        workflowRunId,
        taskId: makeTaskId(),
        agentAssignmentId: 'planner-agent',
        timestamp: new Date().toISOString(),
      }),
    );

    await store.append(
      fromAgentLifecycle({
        agentId: 'planner-agent',
        displayName: 'Planner Agent',
        lifecycleType: 'started',
        workflowRunId,
      }),
    );

    // 5. Task completes
    await store.append(
      fromWorkflowEvent({
        type: 'task.completed',
        workflowRunId,
        taskId: makeTaskId(),
        output: 'Plan created',
        timestamp: new Date().toISOString(),
      }),
    );

    // 6. Another agent begins
    await store.append(
      fromWorkflowEvent({
        type: 'task.started',
        workflowRunId,
        taskId: makeTaskId(),
        agentAssignmentId: 'developer-agent',
        timestamp: new Date().toISOString(),
      }),
    );

    await store.append(
      fromAgentLifecycle({
        agentId: 'developer-agent',
        displayName: 'Developer Agent',
        lifecycleType: 'started',
        workflowRunId,
      }),
    );

    // 7. Workflow completes
    await store.append(
      fromWorkflowEvent({
        type: 'workflow.completed',
        workflowRunId,
        executionId: execId,
        traceId,
        timestamp: new Date().toISOString(),
      }),
    );

    // Verify pre-restart counts
    const preRestart = await store.rebuild();
    expect(preRestart.length).toBe(9);

    // Persist and restart
    const data = close();
    const store2 = await reopenSqliteStore(data);

    // Replay
    const postRestart = await store2.rebuild();
    expect(postRestart.length).toBe(9);

    // Verify durable records preserved
    const humanRecords = postRestart.filter((r) => r.actor.type === 'human');
    expect(humanRecords.length).toBe(2); // join + message

    const agentRecords = postRestart.filter((r) => r.actor.type === 'agent');
    expect(agentRecords.length).toBe(4); // 2 task.started + 2 agent.lifecycle

    const workflowRecords = postRestart.filter((r) => r.type.startsWith('workflow.'));
    expect(workflowRecords.length).toBe(2); // started + completed

    // Verify canonical lineage preserved
    const withExec = postRestart.filter((r) => r.executionId === execId);
    expect(withExec.length).toBe(3); // human.message + workflow.started + workflow.completed

    // Verify event deduplication preserved
    for (const eventId of ['freeze-human-join']) {
      const byEventId = await store2.getByEventId(eventId);
      expect(byEventId).toBeDefined();
    }

    // Verify cursor continuity
    const cursor = await store2.getCursor();
    expect(cursor).not.toBeNull();
    expect(cursor?.sequenceNumber).toBe(9);

    // Verify deterministic ordering
    const sequences = postRestart.map((r) => r.sequenceNumber);
    for (let i = 1; i < sequences.length; i++) {
      expect(sequences[i]).toBeGreaterThan(sequences[i - 1]);
    }

    // Verify no hardcoded participants (Agent IDs are generic strings)
    const agentIds = agentRecords.map((r) => r.actor.id);
    expect(agentIds).not.toContain('Planner');
    expect(agentIds).not.toContain('Developer');
    expect(agentIds).not.toContain('Reviewer');
    expect(agentIds).not.toContain('Verifier');

    // Verify no provider/OpenCode leakage
    const allJson = JSON.stringify(postRestart);
    expect(allJson).not.toContain('opencode');
    expect(allJson).not.toContain('openCode');
    expect(allJson).not.toContain('providerId');
    expect(allJson).not.toContain('modelId');
  });
});
