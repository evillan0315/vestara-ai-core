/**
 * Workflow participant projection — the real agents participating in a real
 * workflow, with real current execution state (post-ORB substrate milestone).
 *
 * Execution state and acceptance state are derived SEPARATELY and never
 * collapsed into one badge: an agent can be `completed` while the workflow's
 * acceptance is `conditional` (Run 3's lesson). Participant state comes from
 * durable organizational state (the workflow's stage threads + the room's
 * activity records), not from polling the private OpenCode session.
 */

import type { ActivityRecord } from '@vestara/activity-projection';
import type { VestaraExecutionState } from '@vestara/opencode-runtime';
import type { AcceptanceBoundary } from '@vestara/workspace';

export interface WorkflowParticipant {
  readonly workflowId: string;
  readonly role: string;
  readonly agentId: string;
  readonly threadId: string;
  readonly executionState: VestaraExecutionState;
  readonly lastActivityAt?: string;
  readonly lastActivity?: string;
}

export type AcceptanceStateStatus = 'satisfied' | 'not-satisfied' | 'conditional' | 'indeterminate' | 'unset';

export interface WorkflowAcceptanceState {
  readonly status: AcceptanceStateStatus;
  readonly objective?: string;
  readonly obligations: readonly string[];
  readonly materialUncertainties: readonly string[];
}

export interface WorkflowParticipantProjection {
  readonly workflowId: string;
  readonly acceptanceState: WorkflowAcceptanceState;
  readonly participants: readonly WorkflowParticipant[];
}

export interface ParticipantProjectionInput {
  readonly workflowId: string;
  readonly threads: ReadonlyArray<{
    readonly id: string;
    readonly status: string;
    readonly metadata: Readonly<Record<string, unknown>>;
  }>;
  /** Activity records for the workflow, newest first. */
  readonly records: readonly ActivityRecord[];
  readonly boundary?: AcceptanceBoundary;
}

function threadIdOf(record: ActivityRecord): string | undefined {
  return (record as { threadId?: string }).threadId;
}

function threadExecutionState(
  status: string,
  records: readonly ActivityRecord[],
  threadId: string,
): VestaraExecutionState {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'blocked':
      return 'waiting';
    case 'archived':
      return 'waiting';
    case 'active': {
      // A pre-created stage thread whose turn has not begun is WAITING, not
      // active. A turn in progress is active (reasoning once a model response
      // is recorded).
      const started = records.some((record) => threadIdOf(record) === threadId);
      if (!started) return 'waiting';
      const latest = records.find((record) => threadIdOf(record) === threadId);
      if (latest?.kind === 'agent-message' && latest.messageKind === 'model-response') return 'reasoning';
      return 'active';
    }
    default:
      return 'queued';
  }
}

function lastActivityFor(records: readonly ActivityRecord[], threadId: string) {
  const latest = records.find((record) => threadIdOf(record) === threadId);
  if (!latest) return { lastActivityAt: undefined, lastActivity: undefined };
  let activity: string | undefined;
  if (latest.kind === 'agent-message') {
    activity = latest.toolName ?? latest.content.slice(0, 120);
  } else if (latest.kind === 'workflow') {
    activity = latest.reason;
  }
  return { lastActivityAt: latest.timestamp, lastActivity: activity };
}

function acceptanceStateFor(
  boundary: AcceptanceBoundary | undefined,
  participants: readonly WorkflowParticipant[],
): WorkflowAcceptanceState {
  if (!boundary) {
    return { status: 'unset', obligations: [], materialUncertainties: [] };
  }
  if (boundary.conditional) {
    return {
      status: 'conditional',
      objective: boundary.objective,
      obligations: boundary.obligations.map((o) => o.description),
      materialUncertainties: boundary.materialUncertainties,
    };
  }
  const allCompleted = participants.length > 0 && participants.every((p) => p.executionState === 'completed');
  if (!allCompleted)
    return {
      status: 'indeterminate',
      objective: boundary.objective,
      obligations: boundary.obligations.map((o) => o.description),
      materialUncertainties: [],
    };
  return {
    status: 'satisfied',
    objective: boundary.objective,
    obligations: boundary.obligations.map((o) => o.description),
    materialUncertainties: [],
  };
}

/** Derive the participant projection from durable organizational state. */
export function projectWorkflowParticipants(input: ParticipantProjectionInput): WorkflowParticipantProjection {
  const sorted = [...input.threads].sort(
    (a, b) => Number(a.metadata.stageIndex ?? 0) - Number(b.metadata.stageIndex ?? 0),
  );
  const participants = sorted.map((thread) => {
    const latest = lastActivityFor(input.records, thread.id);
    return {
      workflowId: input.workflowId,
      role: String(thread.metadata.role ?? 'developer'),
      agentId: String(thread.metadata.agentId ?? 'agent'),
      threadId: thread.id,
      executionState: threadExecutionState(thread.status, input.records, thread.id),
      ...latest,
    };
  });
  return {
    workflowId: input.workflowId,
    acceptanceState: acceptanceStateFor(input.boundary, participants),
    participants,
  };
}
