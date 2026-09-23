import { describe, expect, it } from 'vitest';
import type { ActivityRecord } from '../src/m9-types';
import { ProjectionRuntime } from '../src/m10-projection-runtime';

const interactionId = 'workflow-approval:project-1:task-1:0';

function record(
  sequenceNumber: number,
  type: ActivityRecord['type'],
  actor: ActivityRecord['actor'],
  data: Record<string, unknown>,
  message?: string,
): ActivityRecord {
  return {
    activityId: `activity-${sequenceNumber}` as ActivityRecord['activityId'],
    eventId: `event-${sequenceNumber}`,
    sequenceNumber,
    type,
    timestamp: `2026-09-23T00:00:0${sequenceNumber}.000Z`,
    workflowRunId: 'project-1' as ActivityRecord['workflowRunId'],
    taskId: 'task-1' as ActivityRecord['taskId'],
    actor,
    source: type.startsWith('interaction.') ? 'interaction-app' : 'agent-harness',
    payload: { message, data },
    visibility: 'all',
  };
}

describe('AR-COORD-HUMAN-WAIT-001 Activity Room projection', () => {
  it('reconstructs the same Planner wait and clears it from the shared interaction response', () => {
    const planner = { type: 'agent' as const, id: 'agent-planner', displayName: 'Planner', role: 'planner' };
    const records: ActivityRecord[] = [
      record(1, 'agent.started', planner, {}),
      record(
        2,
        'interaction.presented',
        { type: 'system', id: 'interaction-app', displayName: 'Interaction' },
        { interactionId, presentingParticipantId: planner.id },
        'Awaiting Director approval\nAR-COORD-001 plan ready',
      ),
      record(
        3,
        'interaction.responded',
        { type: 'human', id: 'director', displayName: 'Director' },
        { interactionId, selectedChoiceId: 'workflow.approve' },
        'Director approved',
      ),
    ];

    const live = new ProjectionRuntime().rebuild(records);
    const replay = new ProjectionRuntime().rebuild(records);
    const participantId = 'agent-agent-planner';
    const liveParticipant = live.participants.find((participant) => participant.participantId === participantId);
    const replayParticipant = replay.participants.find((participant) => participant.participantId === participantId);

    expect(liveParticipant?.pendingInteractionId).toBeUndefined();
    expect(liveParticipant?.workState).toBe('available');
    expect(replayParticipant?.pendingInteractionId).toBeUndefined();
    expect(replayParticipant?.workState).toBe('available');
    expect(live.stream.some((item) => item.interaction?.interactionId === interactionId)).toBe(true);
    expect(live.stream.map((item) => item.content)).toContain('Awaiting Director approval\nAR-COORD-001 plan ready');
  });

  it('keeps an unknown reason explicit instead of deriving one from message text', () => {
    const projection = new ProjectionRuntime().rebuild([
      record(
        1,
        'interaction.presented',
        { type: 'system', id: 'interaction-app', displayName: 'Interaction' },
        { interactionId, presentingParticipantId: 'agent-planner' },
        'Awaiting Director approval\nReason unavailable',
      ),
    ]);

    const participant = projection.participants.find((item) => item.participantId === 'agent-agent-planner');
    expect(participant?.workState).toBe('waiting');
    expect(participant?.pendingInteractionId).toBe(interactionId);
    expect(projection.stream[0]?.content).toContain('Reason unavailable');
  });
});
