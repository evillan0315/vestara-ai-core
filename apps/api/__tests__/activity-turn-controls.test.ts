import { describe, expect, it, vi } from 'vitest';
import { activityTurnControls } from '../src/activity-turn-controls';

const record = (id: string) =>
  ({
    id,
    sequence: 1,
    timestamp: new Date().toISOString(),
    actor: { type: 'human', id: 'director', displayName: 'Director' },
    kind: 'agent-message',
    agentId: 'agent-assistant',
    messageKind: 'steering',
    content: 'Correction',
    evidenceRefs: [],
  }) as const;

describe('Activity turn controls', () => {
  it('queues one steer request and deduplicates a retry', () => {
    const runQueued = vi.fn(async () => {});
    const control = activityTurnControls.start({
      activityId: 'activity-queue-1',
      agentId: 'agent-assistant',
      runQueued,
    });
    control.bindConversation('conversation-queue-1');

    expect(activityTurnControls.enqueue('conversation-queue-1', 'client-turn-1', record('steer-1'))).toMatchObject({
      status: 'queued',
      queuedCount: 1,
    });
    expect(
      activityTurnControls.enqueue('conversation-queue-1', 'client-turn-1', record('steer-duplicate')),
    ).toMatchObject({
      status: 'duplicate',
      queuedCount: 1,
    });
    expect(runQueued).not.toHaveBeenCalled();
  });

  it('rejects steering for a different conversation', () => {
    const control = activityTurnControls.start({
      activityId: 'activity-wrong-session-1',
      agentId: 'agent-assistant',
      runQueued: async () => {},
    });
    control.bindConversation('conversation-authoritative-1');

    expect(activityTurnControls.canQueue('conversation-other-1', 'client-turn-2')).toBe(false);
    expect(activityTurnControls.enqueue('conversation-other-1', 'client-turn-2', record('steer-2'))).toEqual({
      status: 'unavailable',
      reason: 'active-turn-unavailable',
    });
  });

  it('requests stop through the bound control and reports unavailable after settlement', () => {
    const control = activityTurnControls.start({
      activityId: 'activity-stop-1',
      agentId: 'agent-assistant',
      runQueued: async () => {},
    });
    control.bindConversation('conversation-stop-1');

    expect(activityTurnControls.requestStop('conversation-stop-1')).toEqual({
      status: 'requested',
      conversationId: 'conversation-stop-1',
    });
    expect(control.controller.signal.aborted).toBe(true);
    activityTurnControls.finish('conversation-stop-1', 'cancelled');
    expect(activityTurnControls.requestStop('conversation-stop-1')).toEqual({
      status: 'unavailable',
      conversationId: 'conversation-stop-1',
    });
  });

  it('keeps the authoritative conversation binding discoverable across UI reloads', () => {
    const control = activityTurnControls.start({
      activityId: 'activity-reload-1',
      agentId: 'agent-assistant',
      runQueued: async () => {},
    });
    control.bindConversation('conversation-reload-1');

    expect(activityTurnControls.list()).toContainEqual({
      activityId: 'activity-reload-1',
      agentId: 'agent-assistant',
      conversationId: 'conversation-reload-1',
      status: 'running',
      queuedCount: 0,
    });
  });
});
