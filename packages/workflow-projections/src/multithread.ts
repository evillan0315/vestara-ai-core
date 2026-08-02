/**
 * Multi-thread workflow aggregation — combines the canonical stage projection
 * of every harness thread that shares a workflowId into one AgentWorkflowProjection.
 *
 * Each agent runs its own durable harness thread; stages are merged per id
 * (union tools/files/evidence, min start, max end, status precedence), so the
 * lifecycle rail and swimlanes show real multi-agent execution.
 */

import type { EngineeringTruthEvent } from '@vestara/engineering-event-store';
import type { ThreadReplay } from '@vestara/thread-runtime';
import type { TaskFileChange, VerificationProjection } from '@vestara/tui-protocol';
import { deriveStages } from './derive';
import { deriveApprovals, deriveVerification } from './project';
import { deriveSwimlanes } from './swimlanes';
import type {
  AgentWorkflowProjection,
  ChangeProjection,
  WorkflowApprovalProjection,
  WorkflowMetrics,
  WorkflowStageId,
  WorkflowStageProjection,
  WorkflowStatus,
} from './types';

function record(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function statusPrecedence(stage: WorkflowStageProjection): number {
  switch (stage.status) {
    case 'failed':
      return 4;
    case 'active':
      return 3;
    case 'blocked':
      return 2;
    case 'completed':
      return 1;
    default:
      return 0;
  }
}

/** Canonical owning role per stage — used to prefer the thread that owns a stage. */
const ROLE_BY_STAGE: Readonly<Record<WorkflowStageId, string>> = {
  intent: 'conversation',
  context: 'analyst',
  investigation: 'analyst',
  planning: 'planner',
  execution: 'developer',
  verification: 'verifier',
  review: 'reviewer',
  complete: 'system',
};

/** True when a stage is owned by the agent that ran it (matches canonical role). */
function stageOwnedBy(agentId: string | undefined, stageId: WorkflowStageId): boolean {
  if (!agentId) return false;
  const key = agentId.toLowerCase().replace(/[^a-z]/g, '');
  const role = ROLE_BY_STAGE[stageId];
  return key.includes(role) || (role === 'analyst' && (key.includes('analyst') || key.includes('investigat')));
}

function mergeStages(threadStages: readonly (readonly WorkflowStageProjection[])[]): WorkflowStageProjection[] {
  const merged = new Map<WorkflowStageId, WorkflowStageProjection>();
  for (const stages of threadStages) {
    for (const stage of stages) {
      const prior = merged.get(stage.id);
      if (!prior) {
        merged.set(stage.id, stage);
        continue;
      }
      // A stage that actually ran supersedes a pending placeholder from a
      // sibling thread (e.g. the developer thread's execution stage must win
      // over the planner thread's never-activated execution stage), and the
      // thread whose agent owns the stage wins over a bystander thread.
      const priorOwns = stageOwnedBy(prior.agentId, stage.id);
      const stageOwns = stageOwnedBy(stage.agentId, stage.id);
      const base =
        (stageOwns && !priorOwns) || (!priorOwns && !stageOwns && stage.startedAt && !prior.startedAt) ? stage : prior;
      const other = base === prior ? stage : prior;
      const startedAt = [base.startedAt, other.startedAt].filter(Boolean).sort()[0];
      const completedAt = [base.completedAt, other.completedAt].filter(Boolean).sort().at(-1);
      merged.set(stage.id, {
        ...base,
        status: statusPrecedence(other) > statusPrecedence(base) ? other.status : base.status,
        startedAt: startedAt ?? base.startedAt,
        completedAt: completedAt ?? base.completedAt,
        tools: [...new Set([...base.tools, ...other.tools])],
        files: [...new Set([...base.files, ...other.files])],
        evidenceCount: base.evidenceCount + other.evidenceCount,
        blockingReason: base.blockingReason ?? other.blockingReason,
      });
    }
  }
  return WORKFLOW_STAGE_ORDER.map((id) => merged.get(id)).filter(
    (stage): stage is WorkflowStageProjection => stage !== undefined,
  );
}

const WORKFLOW_STAGE_ORDER: readonly WorkflowStageId[] = [
  'intent',
  'context',
  'investigation',
  'planning',
  'execution',
  'verification',
  'review',
  'complete',
];

export interface MultiThreadWorkflowSource {
  readonly workflowId?: string;
  readonly threads: readonly {
    readonly replay: ThreadReplay;
    readonly events: readonly EngineeringTruthEvent[];
    readonly changes?: readonly TaskFileChange[];
    readonly changeSummary?: { readonly summary: string; readonly additions: number; readonly deletions: number };
    readonly agentNames?: Readonly<Record<string, string>>;
  }[];
}

export function projectWorkflowAcrossThreads(source: MultiThreadWorkflowSource): AgentWorkflowProjection {
  const threadStages = source.threads.map((thread) => deriveStages(thread.replay.items, thread.events));
  const stages = mergeStages(threadStages);
  const events = source.threads.flatMap((thread) => thread.events);
  const approvals: WorkflowApprovalProjection[] = [];
  const seenApprovals = new Set<string>();
  for (const approval of deriveApprovals(events)) {
    if (seenApprovals.has(approval.id)) continue;
    seenApprovals.add(approval.id);
    approvals.push(approval);
  }
  const verification = latestVerification(events);
  const status = workflowStatus(threadStates(source.threads), approvals);
  const activeStage = stages.find((stage) => stage.status === 'active');
  const currentStageId: WorkflowStageId | undefined =
    activeStage?.id ?? (status === 'completed' ? 'complete' : undefined);
  const agentNames = Object.assign({}, ...source.threads.map((thread) => thread.agentNames ?? {}));
  const agents = deriveAgentsFromStages(stages, agentNames);
  const mergedChangeFiles = [
    ...new Map(
      source.threads.flatMap((thread) => thread.changes ?? []).map((file) => [`${file.path}:${file.operation}`, file]),
    ).values(),
  ];
  const changes: ChangeProjection = {
    files: mergedChangeFiles,
    summary:
      source.threads.find((thread) => thread.changeSummary)?.changeSummary?.summary ??
      `${mergedChangeFiles.length} changed`,
    additions: mergedChangeFiles.reduce((sum, file) => sum + file.additions, 0),
    deletions: mergedChangeFiles.reduce((sum, file) => sum + file.deletions, 0),
  };
  const runId =
    source.threads.map((thread) => thread.replay.items.find((item) => item.kind === 'harness-run')).find(Boolean)
      ?.payload &&
    'runId' in record(source.threads[0]?.replay.items.find((item) => item.kind === 'harness-run')?.payload ?? {})
      ? String(record(source.threads[0]?.replay.items.find((item) => item.kind === 'harness-run')?.payload).runId ?? '')
      : '';

  const firstThread = source.threads[0];
  const sharedWorkflowId = record(firstThread?.replay.thread.metadata).workflowId;
  const workflowId =
    typeof sharedWorkflowId === 'string' && sharedWorkflowId
      ? String(sharedWorkflowId)
      : `wf:${firstThread?.replay.thread.id}`;

  return {
    workflowId,
    threadId: firstThread?.replay.thread.id ?? '',
    runId,
    status,
    currentStageId,
    stages,
    agents,
    swimlanes: deriveSwimlanes(stages, agents),
    approvals,
    changes,
    verification,
    metrics: computeMetrics(
      source.threads,
      stages,
      source.threads.flatMap((thread) => thread.changes ?? []),
    ),
  };
}

function threadStates(
  threads: ReadonlyArray<MultiThreadWorkflowSource['threads'][number]>,
): readonly (string | undefined)[] {
  return threads.map((thread) => thread.replay.turns.at(-1)?.state);
}

function workflowStatus(
  turnStates: readonly (string | undefined)[],
  approvals: readonly WorkflowApprovalProjection[],
): WorkflowStatus {
  if (approvals.some((approval) => approval.status === 'pending')) return 'awaiting-approval';
  if (turnStates.includes('completed') && turnStates.every((state) => state === 'completed' || state === undefined))
    return 'completed';
  if (turnStates.includes('failed')) return 'failed';
  if (turnStates.includes('cancelled')) return 'cancelled';
  if (turnStates.includes('blocked')) return 'blocked';
  return 'running';
}

function latestVerification(events: readonly EngineeringTruthEvent[]): VerificationProjection | undefined {
  return deriveVerification(events);
}

function deriveAgentsFromStages(
  stages: readonly WorkflowStageProjection[],
  names?: Readonly<Record<string, string>>,
): AgentWorkflowProjection['agents'] {
  const byId = new Map<
    string,
    { id: string; name: string; status: string; activeTool?: string; filesChanged: number }
  >();
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
    agent.status = stage.status === 'active' ? 'active' : stage.status === 'failed' ? 'failed' : agent.status;
    byId.set(agentId, agent);
  }
  return [...byId.values()].map((agent) => ({ ...agent }));
}

function computeMetrics(
  threads: ReadonlyArray<MultiThreadWorkflowSource['threads'][number]>,
  stages: readonly WorkflowStageProjection[],
  changes: readonly TaskFileChange[],
): WorkflowMetrics {
  const startedAt = threads
    .map((thread) => thread.replay.thread.createdAt)
    .filter(Boolean)
    .sort()[0];
  const completedAt = threads
    .map((thread) => thread.replay.turns.at(-1)?.completedAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  const start = startedAt ? new Date(startedAt).getTime() : Date.now();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const files = new Set([...stages.flatMap((stage) => stage.files), ...changes.map((change) => change.path)]);
  return {
    elapsedMs: Number.isFinite(end - start) ? Math.max(0, end - start) : 0,
    stagesCompleted: stages.filter((stage) => stage.status === 'completed').length,
    toolsInvoked: stages.reduce((sum, stage) => sum + stage.tools.length, 0),
    filesChanged: files.size,
    additions: changes.reduce((sum, change) => sum + change.additions, 0),
    deletions: changes.reduce((sum, change) => sum + change.deletions, 0),
    evidenceCount: stages.reduce((sum, stage) => sum + stage.evidenceCount, 0),
  };
}
