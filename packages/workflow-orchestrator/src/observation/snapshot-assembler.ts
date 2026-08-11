/**
 * WFO-001C — snapshot assembly.
 *
 * The assembler is the only integration-heavy component. It adapts existing
 * authoritative projections (orchestrator project/task/artifact/lock stores)
 * into normalized observation snapshots. The observer stays pure and never
 * queries stores directly.
 */

import { createHash } from 'node:crypto';
import type { ProjectSnapshot, WorkflowArtifact, WorkflowTask } from '../types';
import type {
  ObservationFieldProvenance,
  RequiredWorkflowOutput,
  WorkflowAgentObservation,
  WorkflowApprovalObservation,
  WorkflowArtifactObservation,
  WorkflowBlockerObservation,
  WorkflowConversationObservation,
  WorkflowDecisionObservation,
  WorkflowEvidenceObservation,
  WorkflowObservationProvenance,
  WorkflowObservationSnapshot,
  WorkflowRepositoryObservation,
  WorkflowTaskObservation,
  WorkflowVerificationObservation,
} from './workflow-snapshot';

export interface ProjectSnapshotProvider {
  snapshot(workflowId: string): Promise<ProjectSnapshot>;
}

/** Optional authoritative sources for facts the orchestrator stores do not hold. */
export interface WorkflowObservationSourceAdapters {
  conversation?(workflowId: string): Promise<WorkflowConversationObservation>;
  repository?(workflowId: string): Promise<WorkflowRepositoryObservation>;
  decisions?(workflowId: string): Promise<readonly WorkflowDecisionObservation[]>;
  evidence?(workflowId: string): Promise<readonly WorkflowEvidenceObservation[]>;
  requiredOutputs?(workflowId: string, snapshot: ProjectSnapshot): Promise<readonly RequiredWorkflowOutput[]>;
}

export interface WorkflowObservationSnapshotAssembler {
  assemble(workflowId: string): Promise<WorkflowObservationSnapshot>;
}

const DEFAULT_REQUIRED_OUTPUTS: readonly RequiredWorkflowOutput[] = [
  { kind: 'analysis' },
  { kind: 'plan' },
  { kind: 'verification' },
];

const EMPTY_CONVERSATION: WorkflowConversationObservation = { turnCount: 0 };
const EMPTY_REPOSITORY: WorkflowRepositoryObservation = { changedFiles: [], changedArtifactHashes: [], dirty: false };

const ACTIVE_TASK_STATUSES = new Set(['assigned', 'in-progress', 'needs-review', 'reviewing', 'testing', 'retrying']);

/**
 * Adapts `WorkflowOrchestrator.snapshot(projectId)` into a normalized
 * observation snapshot. Tasks/artifacts/blockers/approvals/verification are
 * derived from orchestrator stores; conversation/repository/decisions/evidence
 * come from injected adapters (defaulting to empty) because the orchestrator
 * does not own them.
 */
export class OrchestratorWorkflowObservationAssembler implements WorkflowObservationSnapshotAssembler {
  constructor(
    private readonly projects: ProjectSnapshotProvider,
    private readonly adapters: WorkflowObservationSourceAdapters = {},
  ) {}

  async assemble(workflowId: string): Promise<WorkflowObservationSnapshot> {
    const snapshot = await this.projects.snapshot(workflowId);
    const [conversation, repository, decisions, evidence, requiredOutputs] = await Promise.all([
      this.adapters.conversation?.(workflowId) ?? Promise.resolve(EMPTY_CONVERSATION),
      this.adapters.repository?.(workflowId) ?? Promise.resolve(EMPTY_REPOSITORY),
      this.adapters.decisions?.(workflowId) ?? Promise.resolve([]),
      this.adapters.evidence?.(workflowId) ?? Promise.resolve([]),
      this.adapters.requiredOutputs?.(workflowId, snapshot) ?? Promise.resolve(DEFAULT_REQUIRED_OUTPUTS),
    ]);

    const tasks = snapshot.tasks.map(taskObservation);
    const agents = agentObservations(snapshot);
    const artifacts = snapshot.artifacts.map(artifactObservation);
    const blockers = blockerObservations(snapshot);
    const approvals = approvalObservations(snapshot);
    const verification = verificationObservation(snapshot);

    return {
      workflowId,
      capturedAt: new Date().toISOString(),
      objective: { id: workflowId, description: snapshot.project.goal, requiredOutputs },
      tasks,
      agents,
      artifacts,
      decisions: [...decisions],
      evidence: [...evidence],
      blockers,
      approvals,
      verification,
      repository,
      conversation,
      provenance: provenanceOf({
        snapshot,
        tasks,
        agents,
        artifacts,
        blockers,
        approvals,
        verification,
        conversation,
        repository,
        decisions,
        evidence,
      }),
    };
  }
}

function provenanceOf(context: {
  snapshot: ProjectSnapshot;
  tasks: readonly WorkflowTaskObservation[];
  agents: readonly WorkflowAgentObservation[];
  artifacts: readonly WorkflowArtifactObservation[];
  blockers: readonly WorkflowBlockerObservation[];
  approvals: readonly WorkflowApprovalObservation[];
  verification: WorkflowVerificationObservation;
  conversation: WorkflowConversationObservation;
  repository: WorkflowRepositoryObservation;
  decisions: readonly WorkflowDecisionObservation[];
  evidence: readonly WorkflowEvidenceObservation[];
}): WorkflowObservationProvenance {
  const { snapshot } = context;
  return {
    tasks: derived(
      'task state derived from the orchestrator task store',
      context.tasks.map((task) => `task:${task.id}`),
    ),
    agents: derived(
      'agent state derived from active task assignments',
      context.agents.map((agent) => `agent:${agent.id}`),
    ),
    artifacts: derived(
      'artifact state derived from the orchestrator artifact store',
      context.artifacts.map((artifact) => `artifact:${artifact.id}`),
    ),
    blockers: derived(
      'blockers derived from blocked task status — not a formal workflow blocker',
      context.blockers.map((blocker) => `blocker:${blocker.id}`),
    ),
    approvals: derived(
      'approvals derived from plan/task status — does not preserve who approved or validity',
      context.approvals.map((approval) => `approval:${approval.id}`),
    ),
    verification: derived(
      'verification derived from verification artifact + project phase — not an ADR-012 conclusion object',
      verificationEvidenceRefs(snapshot),
    ),
    decisions:
      context.decisions.length > 0
        ? {
            source: 'authoritative',
            evidenceRefs: context.decisions.map((decision) => `decision:${decision.id}`),
            reason: 'decision adapter',
          }
        : missing('no decision adapter — no decision evidence observed'),
    evidence:
      context.evidence.length > 0
        ? {
            source: 'authoritative',
            evidenceRefs: context.evidence.map((item) => item.ref),
            reason: 'evidence adapter',
          }
        : missing('no evidence adapter — no evidence refs observed'),
    repository:
      context.repository === EMPTY_REPOSITORY
        ? { source: 'defaulted', evidenceRefs: [], reason: 'no repository adapter — repository state is defaulted' }
        : {
            source: 'authoritative',
            evidenceRefs: context.repository.changedArtifactHashes,
            reason: 'repository adapter',
          },
    conversation:
      context.conversation === EMPTY_CONVERSATION
        ? { source: 'defaulted', evidenceRefs: [], reason: 'no telemetry adapter — conversation metrics are defaulted' }
        : { source: 'authoritative', evidenceRefs: [], reason: 'telemetry adapter' },
  };
}

function derived(reason: string, evidenceRefs: readonly string[]): ObservationFieldProvenance {
  return { source: 'derived', evidenceRefs, reason };
}

function missing(reason: string): ObservationFieldProvenance {
  return { source: 'missing', evidenceRefs: [], reason };
}

function verificationEvidenceRefs(snapshot: ProjectSnapshot): string[] {
  return snapshot.artifacts
    .filter((artifact) => artifact.kind === 'verification')
    .map((artifact) => `verification:${artifact.id}`);
}

function taskObservation(task: WorkflowTask): WorkflowTaskObservation {
  return {
    id: task.id,
    summary: task.summary,
    status: task.status,
    assignedAgentId: task.assignedAgentId,
    revisionCount: task.revisionCount,
    lastError: task.lastError,
  };
}

function artifactObservation(artifact: WorkflowArtifact): WorkflowArtifactObservation {
  return {
    id: artifact.id,
    kind: artifact.kind,
    version: artifact.version,
    contentHash: createHash('sha256').update(JSON.stringify(artifact.body)).digest('hex'),
    createdAt: artifact.createdAt,
  };
}

function agentObservations(snapshot: ProjectSnapshot): WorkflowAgentObservation[] {
  const agents: WorkflowAgentObservation[] = [];
  const seen = new Set<string>();
  for (const task of snapshot.tasks) {
    if (task.assignedAgentId && ACTIVE_TASK_STATUSES.has(task.status) && !seen.has(task.assignedAgentId)) {
      seen.add(task.assignedAgentId);
      agents.push({ id: task.assignedAgentId, role: 'worker', status: 'working' });
    }
  }
  return agents;
}

function blockerObservations(snapshot: ProjectSnapshot): WorkflowBlockerObservation[] {
  return snapshot.tasks
    .filter((task) => task.status === 'blocked')
    .map((task) => ({
      id: `blocker:${task.id}`,
      summary: task.lastError ?? `Task ${task.id} is blocked`,
      status: 'blocking' as const,
    }));
}

function approvalObservations(snapshot: ProjectSnapshot): WorkflowApprovalObservation[] {
  const approvals: WorkflowApprovalObservation[] = [];
  const plan = snapshot.plan;
  if (plan && (plan.status === 'approved' || plan.approvalId)) {
    approvals.push({ id: `approval:plan:${plan.id}`, scope: 'plan-approval', status: 'granted' });
  }
  for (const task of snapshot.tasks) {
    if (task.status === 'awaiting-approval') {
      approvals.push({ id: `approval:task:${task.id}`, scope: 'task-approval', status: 'requested' });
    }
    if (task.status === 'approved') {
      approvals.push({ id: `review:task:${task.id}`, scope: 'task-review', status: 'granted' });
    }
  }
  return approvals;
}

function verificationObservation(snapshot: ProjectSnapshot): WorkflowVerificationObservation {
  const verifications = snapshot.artifacts.filter((artifact) => artifact.kind === 'verification');
  const latest = verifications[verifications.length - 1];
  if (!latest) return { status: 'not-run' };
  return {
    status: snapshot.project.phase === 'completed' ? 'pass' : 'fail',
    conclusionRef: latest.id,
  };
}
