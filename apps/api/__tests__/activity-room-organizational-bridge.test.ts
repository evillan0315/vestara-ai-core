import { describe, expect, it } from 'vitest';
import { createActivityRoom } from '../src/activity-room.js';
import { startActivityRoomOrganizationalBridge } from '../src/bridges/activity-room-organizational-bridge.js';

interface FakeEvent {
  readonly id: string;
  readonly type: string;
  readonly timestamp: string;
  readonly actor?: { id: string; role?: string };
  readonly payload: Record<string, unknown>;
}

function fakeEventBus() {
  let handler: ((evt: FakeEvent) => void | Promise<void>) | undefined;
  return {
    subscribe: (_pattern: string, h: (evt: FakeEvent) => void | Promise<void>) => {
      handler = h;
      return () => {
        handler = undefined;
      };
    },
    emit: (evt: FakeEvent) => handler?.(evt),
  };
}

const threadStore = {
  getThread(id: string) {
    if (id === 'thread-1') return { metadata: { workflowId: 'wf-1', agentId: 'agent-planner', role: 'planner' } };
    if (id === 'thread-dev')
      return { metadata: { workflowId: 'wf-dev', agentId: 'agent-developer', role: 'developer' } };
    return undefined;
  },
};

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 10));
}

describe('activity-room organizational bridge', () => {
  it('projects workflow start, acceptance boundary, and harness turns into the room', async () => {
    const room = createActivityRoom();
    const bus = fakeEventBus();
    const unsubscribe = startActivityRoomOrganizationalBridge({
      eventBus: bus as never,
      threadStore: threadStore as never,
      room,
    });

    await bus.emit({
      id: 'evt-1',
      type: 'workflow.started',
      timestamp: '2026-08-12T10:00:00.000Z',
      payload: { workflowId: 'wf-1', goal: 'A visual change approved by the Director must survive reload.' },
    });
    await bus.emit({
      id: 'evt-2',
      type: 'acceptance.boundary',
      timestamp: '2026-08-12T10:01:00.000Z',
      payload: {
        workflowId: 'wf-1',
        boundary: {
          objective: 'A visual change approved by the Director must survive reload.',
          obligations: ['the approved change is reconstructed after reload'],
          materialUncertainties: [],
          derivedBy: 'planner',
          conditional: false,
        },
      },
    });
    await bus.emit({
      id: 'evt-3',
      type: 'harness.turn.started',
      timestamp: '2026-08-12T10:02:00.000Z',
      actor: { id: 'agent-planner', role: 'planner' },
      payload: { threadId: 'thread-1', turnId: 'turn-1', runId: 'run-1' },
    });
    await flush();

    const { records } = await room.store.list({});
    const kinds = records.map((record) => record.kind);
    // The room now shows the organization: workflow start, acceptance boundary,
    // and the planner's stage turn — not only the Director's messages.
    expect(kinds).toContain('workflow');
    expect(kinds).toContain('acceptance');
    expect(kinds).toContain('agent-message');

    const acceptance = records.find((record) => record.kind === 'acceptance');
    expect(acceptance?.workflowId).toBe('wf-1');

    const turn = records.find((record) => record.kind === 'agent-message');
    if (turn?.kind === 'agent-message') {
      expect(turn.agentId).toBe('agent-planner');
      expect(turn.workflowId).toBe('wf-1');
    }

    unsubscribe();
  });

  it('projects correlated live execution activity (tool + progress) for the right participant', async () => {
    const room = createActivityRoom();
    const bus = fakeEventBus();
    const unsubscribe = startActivityRoomOrganizationalBridge({
      eventBus: bus as never,
      threadStore: threadStore as never,
      room,
    });

    await bus.emit({
      id: 'evt-exec-1',
      type: 'opencode.execution.activity',
      timestamp: '2026-08-12T10:05:00.000Z',
      actor: { id: 'agent-developer', role: 'developer' },
      payload: {
        threadId: 'thread-dev',
        turnId: 'turn-dev',
        type: 'tool.started',
        state: 'active',
        activity: 'filesystem.write theme.tsx',
        at: '2026-08-12T10:05:00.000Z',
        sessionId: 'ses-dev',
      },
    });
    await flush();

    const { records } = await room.store.list({});
    const toolRecord = records.find((record) => record.kind === 'agent-message');
    if (toolRecord?.kind === 'agent-message') {
      expect(toolRecord.agentId).toBe('agent-developer');
      expect(toolRecord.messageKind).toBe('tool-call');
      expect(toolRecord.toolName).toContain('filesystem.write');
      expect(toolRecord.workflowId).toBe('wf-dev');
    }

    unsubscribe();
  });
});
