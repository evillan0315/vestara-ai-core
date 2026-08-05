/**
 * Canonical workflow projection — builds AgentWorkflowProjection from the
 * durable thread replay + engineering events + change projection.
 */

import type { EngineeringTruthEvent } from '@vestara/engineering-event-store';
import type { ThreadReplay } from '@vestara/thread-runtime';
import type { TaskFileChange, VerificationProjection } from '@vestara/tui-protocol';
import { deriveStages } from './derive';
import { deriveSwimlanes } from './swimlanes';
import type {
  AgentWorkflowProjection,
  ChangeProjection,
  WorkflowAgentProjection,
  WorkflowApprovalProjection,
  WorkflowMetrics,
  WorkflowOutcome,
  WorkflowStageId,
  WorkflowStatus,
} from './types';

function record(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export interface WorkflowSource {
  readonly replay: ThreadReplay;
  readonly events: readonly EngineeringTruthEvent[];
  readonly changes?: readonly TaskFileChange[];
  readonly changeSummary?: { readonly summary: string; readonly additions: number; readonly deletions: number };
  readonly agentNames?: Readonly<Record<string, string>>;
}

export function projectWorkflow(source: WorkflowSource): AgentWorkflowProjection {
  const thread = source.replay.thread;
  const items = source.replay.items;
  const turn = source.replay.turns.at(-1);
  const stages = deriveStages(items, source.events);
  const approvals = deriveApprovals(source.events);
  const verification = deriveVerification(source.events);
  const status = workflowStatus(turn?.state, approvals);
  const runItem = items.find((item) => item.kind === 'harness-run');
  const runId = String(record(runItem?.payload).runId ?? '');
  const activeStage = stages.find((stage) => stage.status === 'active');
  const currentStageId: WorkflowStageId | undefined =
    activeStage?.id ?? (status === 'completed' ? 'complete' : undefined);
  const changes: ChangeProjection = {
    files: source.changes ?? [],
    summary: source.changeSummary?.summary ?? `${source.changes?.length ?? 0} changed`,
    additions: source.changeSummary?.additions ?? source.changes?.reduce((sum, file) => sum + file.additions, 0) ?? 0,
    deletions: source.changeSummary?.deletions ?? source.changes?.reduce((sum, file) => sum + file.deletions, 0) ?? 0,
  };
  const agents = deriveAgents(stages, source.agentNames);
  return {
    workflowId: `wf:${thread.id}`,
    threadId: thread.id,
    runId,
    status,
    outcome: deriveOutcome(turn?.state, status),
    currentStageId,
    stages,
    agents,
    swimlanes: deriveSwimlanes(stages, agents),
    approvals,
    changes,
    verification,
    metrics: computeMetrics(source, stages),
  };
}

function workflowStatus(
  turnState: string | undefined,
  approvals: readonly WorkflowApprovalProjection[],
): WorkflowStatus {
  if (approvals.some((approval) => approval.status === 'pending')) return 'awaiting-approval';
  switch (turnState) {
    case 'completed':
      return 'completed';
    case 'blocked':
      return 'blocked';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'running';
  }
}

function deriveOutcome(turnState: string | undefined, status: WorkflowStatus): WorkflowOutcome {
  if (status === 'cancelled') return 'cancelled';
  if (status === 'failed') return 'failed';
  if (status === 'completed') return 'succeeded';
  if (turnState === 'failed') return 'failed';
  return 'aborted';
}

export function deriveApprovals(events: readonly EngineeringTruthEvent[]): WorkflowApprovalProjection[] {
  const approvals = new Map<string, WorkflowApprovalProjection>();
  for (const event of events) {
    const payload = record(event.payload);
    if (event.type === 'harness.approval-request') {
      const id = String(payload.approvalId ?? event.id);
      approvals.set(id, {
        id,
        tool: String(payload.toolName ?? 'tool'),
        risk: String(payload.risk ?? 'unknown'),
        reason: String(payload.reason ?? 'Approval required'),
        resources: Array.isArray(payload.affectedResources) ? payload.affectedResources.map(String) : [],
        status: 'pending',
      });
    }
    if (event.type === 'harness.approval-decision') {
      const id = String(payload.approvalId ?? '');
      const prior = approvals.get(id);
      if (prior) approvals.set(id, { ...prior, status: payload.approved === true ? 'approved' : 'denied' });
    }
  }
  return [...approvals.values()];
}

export function deriveVerification(events: readonly EngineeringTruthEvent[]): VerificationProjection | undefined {
  const latest = events
    .filter((event) => event.type === 'harness.verification-result' || event.type.includes('verification.completed'))
    .at(-1);
  if (!latest) return undefined;
  const payload = record(latest.payload);
  return {
    runId: String(latest.verificationRunId ?? `verification-${latest.turnId ?? ''}`),
    status: String(payload.status ?? 'inconclusive'),
    confidence: typeof payload.confidence === 'number' ? payload.confidence : undefined,
    checks: Array.isArray(payload.checks)
      ? payload.checks.map((check) => {
          const item = record(check);
          return {
            id: String(item.id ?? item.name),
            name: String(item.name ?? item.id),
            status: String(item.status ?? 'not-run'),
            summary: String(item.summary ?? ''),
          };
        })
      : [],
    uncoveredRisks: Array.isArray(payload.uncoveredRisks) ? payload.uncoveredRisks.map(String) : [],
    evidenceIds: Array.isArray(payload.evidence)
      ? payload.evidence.map((item) => String(record(item).id ?? '')).filter(Boolean)
      : [],
  };
}

function deriveAgents(
  stages: ReturnType<typeof deriveStages>,
  names?: Readonly<Record<string, string>>,
): WorkflowAgentProjection[] {
  interface MutableAgent {
    id: string;
    name: string;
    status: string;
    activeTool?: string;
    filesChanged: number;
  }
  const byId = new Map<string, MutableAgent>();
  for (const stage of stages) {
    const agentId = stage.agentId ?? 'agent';
    const agent = byId.get(agentId) ?? {
      id: agentId,
      name: names?.[agentId] ?? agentId,
      status: 'idle',
      filesChanged: 0,
    };
    if (stage.tools.length > 0) agent.activeTool = stage.tools.at(-1);
    agent.filesChanged = Math.max(agent.filesChanged, stage.files.length);
    agent.status =
      stage.status === 'active'
        ? 'active'
        : stage.status === 'failed'
          ? 'failed'
          : stage.status === 'completed'
            ? 'completed'
            : agent.status;
    byId.set(agentId, agent);
  }
  return [...byId.values()].map((agent) => ({ ...agent }));
}

function computeMetrics(source: WorkflowSource, stages: ReturnType<typeof deriveStages>): WorkflowMetrics {
  const thread = source.replay.thread;
  const turn = source.replay.turns.at(-1);
  const startedAt = new Date(turn?.startedAt ?? thread.createdAt).getTime();
  const endedAt = turn?.completedAt ? new Date(turn.completedAt).getTime() : Date.now();
  const files = new Set(source.changes?.map((change) => change.path) ?? []);
  return {
    elapsedMs: Number.isFinite(endedAt - startedAt) ? Math.max(0, endedAt - startedAt) : 0,
    stagesCompleted: stages.filter((stage) => stage.status === 'completed').length,
    toolsInvoked: stages.reduce((sum, stage) => sum + stage.tools.length, 0),
    filesChanged: files.size,
    additions: source.changes?.reduce((sum, change) => sum + change.additions, 0) ?? 0,
    deletions: source.changes?.reduce((sum, change) => sum + change.deletions, 0) ?? 0,
    evidenceCount: stages.reduce((sum, stage) => sum + stage.evidenceCount, 0),
  };
}
