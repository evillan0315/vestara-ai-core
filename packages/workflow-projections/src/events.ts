/**
 * Incremental workflow event envelopes. A client connects, receives a
 * snapshot envelope, then applies stage/agent/tool/change/approval/
 * verification deltas. Each envelope carries a monotonic sequence so stale
 * refreshes can never overwrite newer state.
 */

import type { AgentWorkflowProjection, WorkflowEvent, WorkflowEventEnvelope, WorkflowStageId } from './types';

export function workflowSnapshotEnvelope(
  projection: AgentWorkflowProjection,
  sequence: number,
): WorkflowEventEnvelope<{ type: 'snapshot'; projection: AgentWorkflowProjection }> {
  return envelope(projection, { type: 'snapshot', projection }, sequence);
}

export function envelope<TEvent extends WorkflowEvent>(
  projection: Pick<AgentWorkflowProjection, 'workflowId' | 'threadId' | 'runId'>,
  event: TEvent,
  sequence: number,
): WorkflowEventEnvelope<TEvent> {
  return {
    sequence,
    workflowId: projection.workflowId,
    threadId: projection.threadId,
    runId: projection.runId,
    timestamp: new Date().toISOString(),
    event,
  };
}

function stageEvents(previous: AgentWorkflowProjection, current: AgentWorkflowProjection): WorkflowEvent[] {
  const events: WorkflowEvent[] = [];
  const prevByStage = new Map<WorkflowStageId, (typeof current.stages)[number]>(
    previous.stages.map((stage) => [stage.id, stage]),
  );
  for (const stage of current.stages) {
    const prior = prevByStage.get(stage.id);
    if (!prior) {
      events.push({ type: 'stage.started', stageId: stage.id, stage });
      continue;
    }
    if (prior.status !== stage.status) {
      if (prior.status === 'pending' && stage.status === 'active') {
        events.push({ type: 'stage.started', stageId: stage.id, stage });
      } else if (stage.status === 'completed' || stage.status === 'failed' || stage.status === 'blocked') {
        events.push({ type: 'stage.completed', stageId: stage.id, stage });
      } else {
        events.push({ type: 'stage.updated', stageId: stage.id, stage });
      }
    } else if (JSON.stringify(prior) !== JSON.stringify(stage)) {
      events.push({ type: 'stage.updated', stageId: stage.id, stage });
    }
  }
  return events;
}

function approvalEvents(previous: AgentWorkflowProjection, current: AgentWorkflowProjection): WorkflowEvent[] {
  const events: WorkflowEvent[] = [];
  const prior = new Map(previous.approvals.map((approval) => [approval.id, approval]));
  for (const approval of current.approvals) {
    const before = prior.get(approval.id);
    if (!before) {
      events.push({ type: 'approval.requested', approval });
    } else if (before.status !== approval.status) {
      events.push({ type: 'approval.resolved', approval });
    }
  }
  return events;
}

/**
 * Diff two projections into incremental workflow events, sequenced from
 * `startSequence` upward. Uses `current.sequenceHint` (the max engineering
 * event sequence consumed) when available to keep envelope sequences
 * monotonic across reconnect.
 */
export function workflowEnvelopes(
  previous: AgentWorkflowProjection,
  current: AgentWorkflowProjection,
  startSequence: number,
): WorkflowEventEnvelope[] {
  const events: WorkflowEvent[] = [];
  events.push(...stageEvents(previous, current));
  events.push(...approvalEvents(previous, current));
  if (JSON.stringify(previous.verification) !== JSON.stringify(current.verification) && current.verification) {
    events.push({ type: 'verification.updated', verification: current.verification });
  }
  if (JSON.stringify(previous.changes) !== JSON.stringify(current.changes)) {
    events.push({ type: 'change.updated', changes: current.changes });
  }
  if (previous.status !== current.status && isTerminal(current.status)) {
    events.push({ type: 'completed', projection: current });
  }

  const envelopes: WorkflowEventEnvelope[] = [];
  let sequence = startSequence;
  for (const event of events) {
    envelopes.push(envelope(current, event, sequence++));
  }
  // Always emit a snapshot tail so a client can reconcile after partial drops.
  envelopes.push(workflowSnapshotEnvelope(current, sequence++));
  return envelopes;
}

function isTerminal(status: string): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'blocked';
}
