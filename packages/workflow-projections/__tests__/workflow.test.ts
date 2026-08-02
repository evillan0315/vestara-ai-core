import type { EngineeringTruthEvent } from '@vestara/engineering-event-store';
import type { ThreadItem } from '@vestara/thread-runtime';
import { describe, expect, it } from 'vitest';
import { workflowEnvelopes, workflowSnapshotEnvelope } from '../src/events.js';
import { deriveStages, deriveSwimlanes, projectWorkflowAcrossThreads, stageForItem } from '../src/index.js';
import { projectWorkflow } from '../src/project.js';

function iso(seconds: number): string {
  return `2026-08-02T10:00:${String(seconds).padStart(2, '0')}.000Z`;
}

function item(kind: string, payload: Record<string, unknown>, createdAt = iso(0)): ThreadItem {
  return {
    id: `i-${Math.random()}`,
    threadId: 'thread-1',
    turnId: 'turn-1',
    sequence: 0,
    kind: kind as never,
    actorId: 'agent',
    payload,
    createdAt,
    correlationId: 'corr',
  };
}

function event(type: string, payload: Record<string, unknown> = {}, at = iso(0)): EngineeringTruthEvent {
  return {
    seq: 1,
    id: `e-${Math.random()}`,
    type,
    source: 'agent-harness',
    actorId: 'agent',
    authority: 'system',
    workspaceId: 'ws-1',
    correlationId: 'corr',
    payload,
    at,
    previousHash: 'x',
    hash: 'y',
  };
}

describe('deriveStages', () => {
  it('maps structural item/event kinds to stages without parsing model text', () => {
    expect(stageForItem(item('user-message', { content: 'x' }))).toBe('intent');
    expect(stageForItem(item('tool-call', { toolName: 'filesystem.read' }))).toBe('investigation');
    expect(stageForItem(item('tool-call', { toolName: 'filesystem.write' }))).toBe('execution');
    expect(stageForItem(item('verification-result', { status: 'passed' }))).toBe('verification');
    expect(stageForItem(item('final-outcome', { state: 'completed' }))).toBe('complete');
  });

  it('walks a full run into the eight stages with contiguous statuses', () => {
    const items: ThreadItem[] = [
      item('harness-run', { runId: 'run-1', agentId: 'dev' }, iso(0)),
      item('user-message', { content: 'Do the thing' }, iso(1)),
      item('model-response', { content: 'ok', usage: {} }, iso(2)),
      item('tool-call', { callId: 'c1', toolName: 'filesystem.read' }, iso(3)),
      item('tool-result', { callId: 'c1', toolName: 'filesystem.read', status: 'completed' }, iso(4)),
      item('tool-call', { callId: 'c2', toolName: 'filesystem.write', input: { path: 'a.ts' } }, iso(5)),
      item('tool-result', { callId: 'c2', toolName: 'filesystem.write', status: 'completed' }, iso(6)),
      item('verification-result', { status: 'passed', confidence: 0.95 }, iso(7)),
      item('final-outcome', { state: 'completed' }, iso(8)),
    ];
    const stages = deriveStages(items, []);
    const byId = new Map(stages.map((stage) => [stage.id, stage]));
    expect(byId.get('intent')?.status).toBe('completed');
    expect(byId.get('context')?.status).toBe('completed');
    expect(byId.get('investigation')?.status).toBe('completed');
    expect(byId.get('execution')?.status).toBe('completed');
    expect(byId.get('verification')?.status).toBe('completed');
    expect(byId.get('complete')?.status).toBe('completed');
    expect(byId.get('execution')?.tools).toContain('filesystem.write');
    expect(byId.get('execution')?.files).toContain('a.ts');
    expect(byId.get('investigation')?.durationMs).toBeGreaterThan(0);
    // Stages never reached stay pending.
    expect(byId.get('review')?.status).toBe('pending');
  });

  it('marks the active stage and a failed stage', () => {
    const items: ThreadItem[] = [
      item('user-message', { content: 'x' }, '10:00:00'),
      item('tool-call', { toolName: 'filesystem.write' }, '10:00:01'),
      item('tool-result', { toolName: 'filesystem.write', status: 'failed', error: 'EACCES' }, '10:00:02'),
    ];
    const stages = deriveStages(items, []);
    const execution = stages.find((stage) => stage.id === 'execution')!;
    expect(execution.status).toBe('failed');
    expect(execution.blockingReason).toBe('EACCES');
    expect(stages.find((stage) => stage.id === 'complete')?.status).toBe('pending');
  });

  it('lets explicit harness.stage.* announcements override inference', () => {
    // No write/shell tools → inference would never activate Execution, but an
    // orchestrator announces it explicitly.
    const items: ThreadItem[] = [item('user-message', { content: 'x' }, iso(0))];
    const explicitEvents: EngineeringTruthEvent[] = [
      event('harness.stage.execution.started', { stageId: 'execution' }, iso(1)),
      event('harness.stage.execution.completed', { stageId: 'execution' }, iso(2)),
    ];
    const stages = deriveStages(items, explicitEvents);
    const execution = stages.find((stage) => stage.id === 'execution')!;
    expect(execution.status).toBe('completed');
    expect(execution.startedAt).toBe(iso(1));
    expect(execution.completedAt).toBe(iso(2));
  });

  it('explicit start activates a stage that inference would leave pending', () => {
    const items: ThreadItem[] = [item('user-message', { content: 'x' }, iso(0))];
    const explicitEvents: EngineeringTruthEvent[] = [
      event('harness.stage.planning.started', { stageId: 'planning' }, iso(1)),
    ];
    const stages = deriveStages(items, explicitEvents);
    const planning = stages.find((stage) => stage.id === 'planning')!;
    expect(planning.status).toBe('active');
    // Inferred stages still fill in around explicit ones.
    expect(stages.find((stage) => stage.id === 'intent')?.status).toBe('completed');
  });

  it('assigns a default owning agent to every lifecycle stage', () => {
    const items: ThreadItem[] = [
      item('user-message', { content: 'x' }, iso(0)),
      item('tool-call', { toolName: 'filesystem.read' }, iso(1)),
      item('tool-call', { toolName: 'filesystem.write' }, iso(2)),
      item('verification-result', { status: 'passed' }, iso(3)),
      item('final-outcome', { state: 'completed' }, iso(4)),
    ];
    const stages = deriveStages(items, []);
    const byId = new Map(stages.map((stage) => [stage.id, stage]));
    expect(byId.get('intent')?.agentId).toBe('conversation');
    expect(byId.get('investigation')?.agentId).toBe('analyst');
    expect(byId.get('execution')?.agentId).toBe('developer');
    expect(byId.get('verification')?.agentId).toBe('verifier');
    expect(byId.get('complete')?.agentId).toBe('system');
    // Even pending stages carry their owning role.
    expect(byId.get('review')?.agentId).toBe('reviewer');
  });

  it('prefers the actual agent from a tool-call payload over the default', () => {
    const items: ThreadItem[] = [
      item('user-message', { content: 'x' }, iso(0)),
      item('tool-call', { toolName: 'filesystem.write', agentId: 'developer-01' }, iso(1)),
    ];
    const stages = deriveStages(items, []);
    expect(stages.find((stage) => stage.id === 'execution')?.agentId).toBe('developer-01');
  });
});

describe('projectWorkflow + envelopes', () => {
  function replayOf(items: ThreadItem[], turnState = 'running') {
    return {
      thread: {
        id: 'thread-1',
        taskId: 'task-1',
        title: 't',
        status: turnState,
        environmentId: 'env-1',
        createdAt: iso(0),
        updatedAt: iso(0),
        metadata: {},
      },
      turns: [{ id: 'turn-1', threadId: 'thread-1', sequence: 1, state: turnState, input: 'x', startedAt: iso(0) }],
      items,
    };
  }

  it('projects a run into a canonical workflow with runId + status', () => {
    const items: ThreadItem[] = [
      item('harness-run', { runId: 'run-9', agentId: 'dev' }, iso(0)),
      item('user-message', { content: 'x' }, iso(1)),
      item('final-outcome', { state: 'completed' }, iso(5)),
    ];
    const projection = projectWorkflow({
      replay: replayOf(items, 'completed'),
      events: [],
      changes: [
        {
          taskId: 'task-1',
          path: 'a.ts',
          operation: 'create',
          additions: 3,
          deletions: 0,
          hunks: [],
          verificationIds: [],
          observedAt: iso(4),
          preExisting: false,
        },
      ],
    });
    expect(projection.workflowId).toBe('wf:thread-1');
    expect(projection.runId).toBe('run-9');
    expect(projection.status).toBe('completed');
    expect(projection.stages).toHaveLength(8);
    expect(projection.metrics.filesChanged).toBe(1);
    expect(projection.metrics.additions).toBe(3);
  });

  it('produces a monotonic snapshot envelope and incremental stage events', () => {
    const itemsBefore: ThreadItem[] = [item('user-message', { content: 'x' }, iso(0))];
    const before = projectWorkflow({ replay: replayOf(itemsBefore), events: [] });

    const itemsAfter: ThreadItem[] = [
      item('user-message', { content: 'x' }, iso(0)),
      item('tool-call', { toolName: 'filesystem.write' }, iso(1)),
    ];
    const after = projectWorkflow({ replay: replayOf(itemsAfter), events: [] });

    const envelopes = workflowEnvelopes(before, after, 10);
    expect(envelopes.length).toBeGreaterThan(0);
    expect(envelopes[0].sequence).toBe(10);
    expect(envelopes.every((envelope, index) => envelope.sequence === 10 + index)).toBe(true);
    expect(envelopes.some((envelope) => envelope.event.type === 'stage.started')).toBe(true);
    expect(envelopes.at(-1)?.event.type).toBe('snapshot');

    const snapshot = workflowSnapshotEnvelope(after, 100);
    expect(snapshot.sequence).toBe(100);
    expect(snapshot.event.type).toBe('snapshot');
    expect(snapshot.threadId).toBe('thread-1');
  });
});

describe('revision repair loop + swimlanes', () => {
  it('maps revision-request items to the verification stage with retryCount', () => {
    const items: ThreadItem[] = [
      item('user-message', { content: 'x' }, iso(0)),
      item('revision-request', { revisionNumber: 1, feedback: 'tests failed' }, iso(1)),
      item('verification-result', { status: 'passed', confidence: 0.95 }, iso(2)),
      item('final-outcome', { state: 'completed' }, iso(3)),
    ];
    const stages = deriveStages(items, []);
    const verification = stages.find((stage) => stage.id === 'verification')!;
    expect(verification.status).toBe('completed');
    expect(verification.verification?.retryCount).toBe(1);
    expect(verification.verification?.status).toBe('passed');
  });

  it('groups stages into time-ordered agent swimlanes', () => {
    const items: ThreadItem[] = [
      item('user-message', { content: 'x' }, iso(0)),
      item('tool-call', { toolName: 'filesystem.read' }, iso(1)),
      item('tool-call', { toolName: 'filesystem.write' }, iso(2)),
      item('verification-result', { status: 'passed' }, iso(3)),
      item('final-outcome', { state: 'completed' }, iso(4)),
    ];
    const stages = deriveStages(items, []);
    const lanes = deriveSwimlanes(stages, []);
    // conversation (intent) + analyst (investigation) + developer (execution) + verifier + system
    const byAgent = new Map(lanes.map((lane) => [lane.agentId, lane]));
    expect(byAgent.has('conversation')).toBe(true);
    expect(byAgent.get('developer')).toBeDefined();
    expect(byAgent.get('developer')?.segments.some((segment) => segment.stageId === 'execution')).toBe(true);
    expect(byAgent.get('verifier')).toBeDefined();
    // Lanes ordered by role (conversation before developer before verifier).
    expect(lanes[0].agentId).toBe('conversation');
    expect(lanes[lanes.length - 1].agentId).toBe('system');
  });
});

describe('projectWorkflowAcrossThreads (multi-agent aggregation)', () => {
  function replayOf(threadId: string, items: ThreadItem[], turnState = 'completed') {
    return {
      thread: {
        id: threadId,
        taskId: 'task-1',
        title: threadId,
        status: turnState,
        environmentId: 'env-1',
        createdAt: iso(0),
        updatedAt: iso(0),
        metadata: {},
      },
      turns: [
        {
          id: `turn-${threadId}`,
          threadId,
          sequence: 1,
          state: turnState,
          input: 'x',
          startedAt: iso(0),
          completedAt: iso(9),
        },
      ],
      items,
    };
  }

  const plannerItems: ThreadItem[] = [
    item('harness-run', { runId: 'run-planner', agentId: 'planner' }, iso(0)),
    item('user-message', { content: 'plan the work' }, iso(1)),
    item('tool-call', { toolName: 'filesystem.read', agentId: 'planner' }, iso(2)),
    item('tool-call', { toolName: 'plan', agentId: 'planner' }, iso(3)),
    item('tool-result', { toolName: 'plan', status: 'completed' }, iso(4)),
    item('final-outcome', { state: 'completed' }, iso(5)),
  ];

  const developerItems: ThreadItem[] = [
    item('harness-run', { runId: 'run-dev', agentId: 'developer' }, iso(3)),
    item('user-message', { content: 'implement the plan' }, iso(4)),
    item('tool-call', { toolName: 'filesystem.write', input: { path: 'a.ts' }, agentId: 'developer' }, iso(5)),
    item('tool-result', { toolName: 'filesystem.write', status: 'completed' }, iso(6)),
    item('final-outcome', { state: 'completed' }, iso(7)),
  ];

  const verifierItems: ThreadItem[] = [
    item('harness-run', { runId: 'run-verifier', agentId: 'verifier' }, iso(6)),
    item('user-message', { content: 'verify the work' }, iso(7)),
    item('verification-result', { status: 'passed', confidence: 0.95 }, iso(8)),
    item('final-outcome', { state: 'completed' }, iso(9)),
  ];

  it('merges three agent threads into one eight-stage rail with distinct swimlanes', () => {
    const projection = projectWorkflowAcrossThreads({
      threads: [
        { replay: replayOf('thread-planner', plannerItems), events: [] },
        { replay: replayOf('thread-developer', developerItems), events: [] },
        { replay: replayOf('thread-verifier', verifierItems), events: [] },
      ],
    });

    expect(projection.workflowId).toBe('wf:thread-planner');
    expect(projection.stages).toHaveLength(8);
    expect(projection.status).toBe('completed');

    const byId = new Map(projection.stages.map((stage) => [stage.id, stage]));
    expect(byId.get('planning')?.agentId).toBe('planner');
    expect(byId.get('execution')?.agentId).toBe('developer');
    expect(byId.get('verification')?.agentId).toBe('verifier');

    const laneAgents = new Set(projection.swimlanes.map((lane) => lane.agentId));
    expect(laneAgents.has('planner')).toBe(true);
    expect(laneAgents.has('developer')).toBe(true);
    expect(laneAgents.has('verifier')).toBe(true);
    const developerLane = projection.swimlanes.find((lane) => lane.agentId === 'developer')!;
    expect(developerLane.segments.some((segment) => segment.stageId === 'execution')).toBe(true);
    expect(developerLane.segments.some((segment) => segment.stageId === 'planning')).toBe(false);
  });

  it('unions tools and files across threads in the shared stage', () => {
    const projection = projectWorkflowAcrossThreads({
      threads: [
        { replay: replayOf('thread-a', plannerItems), events: [] },
        {
          replay: replayOf('thread-b', [
            item('harness-run', { runId: 'run-b', agentId: 'analyst' }, iso(0)),
            item('user-message', { content: 'investigate' }, iso(1)),
            item('tool-call', { toolName: 'filesystem.search', agentId: 'analyst' }, iso(2)),
          ]),
          events: [],
        },
      ],
    });
    const investigation = projection.stages.find((stage) => stage.id === 'investigation')!;
    expect(investigation.tools).toContain('filesystem.read');
    expect(investigation.tools).toContain('filesystem.search');
  });

  it('merges change projections and computes cross-thread metrics', () => {
    const changes = [
      {
        taskId: 'task-1',
        path: 'a.ts',
        operation: 'create' as const,
        additions: 3,
        deletions: 0,
        hunks: [],
        verificationIds: [],
        observedAt: iso(5),
        preExisting: false,
      },
      {
        taskId: 'task-1',
        path: 'b.ts',
        operation: 'update' as const,
        additions: 1,
        deletions: 1,
        hunks: [],
        verificationIds: [],
        observedAt: iso(6),
        preExisting: false,
      },
    ];
    const projection = projectWorkflowAcrossThreads({
      threads: [
        { replay: replayOf('thread-a', plannerItems), events: [], changes },
        { replay: replayOf('thread-b', developerItems), events: [], changes },
      ],
    });
    expect(projection.changes.files).toHaveLength(2);
    expect(projection.changes.additions).toBe(4);
    expect(projection.changes.deletions).toBe(1);
    expect(projection.metrics.filesChanged).toBe(2);
  });

  it('reports awaiting-approval when any sibling thread blocks on an approval', () => {
    const approvalEvent: EngineeringTruthEvent = event('harness.approval-request', {
      approvalId: 'ap-1',
      toolName: 'shell.run',
      risk: 'high',
      reason: 'Run a command',
    });
    const projection = projectWorkflowAcrossThreads({
      threads: [
        { replay: replayOf('thread-a', plannerItems), events: [] },
        { replay: replayOf('thread-b', developerItems), events: [approvalEvent] },
      ],
    });
    expect(projection.status).toBe('awaiting-approval');
    expect(projection.approvals).toHaveLength(1);
    expect(projection.approvals[0].status).toBe('pending');
  });
});
