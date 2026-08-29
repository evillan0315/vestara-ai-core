/**
 * WFO-001 — normalized observation snapshots.
 *
 * The observer consumes normalized facts (assembled by adapters from workflow,
 * event-store, telemetry, artifact, and verification projections), never raw
 * logs. The snapshot is the replay unit: two snapshots of the same workflow are
 * comparable and deterministic.
 */

import type { TaskStatus } from '../types';

/** A required workflow output (e.g. an ADR markdown file named `ADR-012`). */
export interface RequiredWorkflowOutput {
  readonly kind: string;
  readonly name?: string;
}

export interface WorkflowObjectiveObservation {
  readonly id: string;
  readonly description: string;
  readonly requiredOutputs: readonly RequiredWorkflowOutput[];
}

export interface WorkflowTaskObservation {
  readonly id: string;
  readonly summary: string;
  /** Reuses the authoritative orchestrator task status; the observer never re-derives it. */
  readonly status: TaskStatus;
  readonly assignedAgentId?: string;
  readonly revisionCount?: number;
  readonly lastError?: string;
}

export interface WorkflowAgentObservation {
  readonly id: string;
  readonly role: string;
  readonly status: 'idle' | 'active' | 'working' | 'waiting' | 'completed' | 'failed';
}

export interface WorkflowArtifactObservation {
  readonly id: string;
  readonly kind: string;
  readonly name?: string;
  readonly version: number;
  readonly contentHash?: string;
  readonly createdAt?: string;
}

export interface WorkflowDecisionObservation {
  readonly id: string;
  readonly title: string;
  readonly status: 'proposed' | 'decided' | 'approved' | 'rejected' | 'contradicted' | 'superseded';
}

export interface WorkflowEvidenceObservation {
  readonly ref: string;
  readonly kind?: string;
  readonly summary?: string;
  /** Reference to a decision/evidence this observation contradicts (unresolved). */
  readonly contradicts?: string;
}

export interface WorkflowBlockerObservation {
  readonly id: string;
  readonly summary: string;
  readonly status: 'open' | 'blocking' | 'resolved';
}

export interface WorkflowApprovalObservation {
  readonly id: string;
  readonly scope: string;
  readonly status: 'requested' | 'granted' | 'denied' | 'resolved';
}

export interface WorkflowVerificationObservation {
  readonly status: 'not-run' | 'pass' | 'fail' | 'indeterminate';
  readonly conclusionRef?: string;
}

export interface WorkflowRepositoryObservation {
  readonly changedFiles: readonly string[];
  readonly changedArtifactHashes: readonly string[];
  readonly commitSha?: string;
  readonly dirty: boolean;
}

export interface WorkflowConversationObservation {
  readonly turnCount: number;
  readonly latestTurnId?: string;
  readonly latestTurnRole?: string;
  readonly cumulativeInputTokens?: number;
  readonly cumulativeOutputTokens?: number;
  readonly estimatedCost?: number;
  /** Adapter-provided breakdown; absent → derived from turnCount. */
  readonly reasoningTurns?: number;
  readonly executionTurns?: number;
}

/** A normalized, replayable snapshot of one workflow at one point in time. */
export interface WorkflowObservationSnapshot {
  readonly workflowId: string;
  readonly capturedAt: string;
  readonly objective: WorkflowObjectiveObservation;
  readonly tasks: readonly WorkflowTaskObservation[];
  readonly agents: readonly WorkflowAgentObservation[];
  readonly artifacts: readonly WorkflowArtifactObservation[];
  readonly decisions: readonly WorkflowDecisionObservation[];
  readonly evidence: readonly WorkflowEvidenceObservation[];
  readonly blockers: readonly WorkflowBlockerObservation[];
  readonly approvals: readonly WorkflowApprovalObservation[];
  readonly verification: WorkflowVerificationObservation;
  readonly repository: WorkflowRepositoryObservation;
  readonly conversation: WorkflowConversationObservation;
  /**
   * Field-level provenance set by the assembler. Present when the snapshot was
   * assembled from authoritative sources; derived/defaulted/missing fields are
   * flagged so approximations are never presented as authoritative facts.
   */
  readonly provenance?: WorkflowObservationProvenance;
}

export type ObservationFieldSource = 'authoritative' | 'derived' | 'defaulted' | 'missing';

export interface ObservationFieldProvenance {
  readonly source: ObservationFieldSource;
  readonly evidenceRefs: readonly string[];
  readonly reason?: string;
}

export interface WorkflowObservationProvenance {
  readonly tasks: ObservationFieldProvenance;
  readonly agents: ObservationFieldProvenance;
  readonly artifacts: ObservationFieldProvenance;
  readonly decisions: ObservationFieldProvenance;
  readonly evidence: ObservationFieldProvenance;
  readonly blockers: ObservationFieldProvenance;
  readonly approvals: ObservationFieldProvenance;
  readonly verification: ObservationFieldProvenance;
  readonly repository: ObservationFieldProvenance;
  readonly conversation: ObservationFieldProvenance;
}

/**
 * Verification conclusion consumed through a small adapter (WFO-001). Never a
 * mandatory dependency; where a conclusion exists it is projected into the
 * snapshot's `verification` block. ADR-012: an indeterminate conclusion must
 * never permit completion.
 */
export interface VerificationConclusionObservation {
  readonly status: 'pass' | 'fail' | 'indeterminate';
  readonly regressionIntroduced: boolean | null;
  readonly confidence: 'low' | 'medium' | 'high';
  readonly evidenceRefs: readonly string[];
}

export function snapshotTaskActive(task: WorkflowTaskObservation): boolean {
  return (
    task.status === 'in-progress' ||
    task.status === 'assigned' ||
    task.status === 'reviewing' ||
    task.status === 'testing' ||
    task.status === 'retrying' ||
    task.status === 'awaiting-approval'
  );
}

export function snapshotAgentActive(agent: WorkflowAgentObservation): boolean {
  return agent.status === 'active' || agent.status === 'working';
}
