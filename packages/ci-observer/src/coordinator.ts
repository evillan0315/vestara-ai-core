/**
 * CI-OBS-002B2 — Coordinator port.
 *
 * The authoritative workflow task store (workflow-orchestrator `TaskStore`) owns
 * the task/`awaiting-verification` lifecycle. `@vestara/ci-observer` never owns
 * task authority; it requests coordinator transitions through this port.
 *
 * Implementations adapt a concrete coordinator (e.g. TaskStore) without leaking
 * provider or CI vocabulary into it.
 */

/** A coordinator-owned external-verification wait (task + correlation). */
export interface CICoordinatorWait {
  readonly waitRef: string;
  readonly taskId: string;
  readonly repository: string;
  readonly commitSha: string;
  readonly branch: string;
  readonly provider?: string;
  readonly runRef?: string;
  readonly originatingWorkflowRunId?: string;
  readonly originatingOperationId?: string;
  readonly suspendedAt: string;
  readonly resumedAt?: string;
  readonly decisionRef?: string;
}

export interface BeginCoordinatorWaitInput {
  readonly taskId: string;
  readonly verifier: 'ci';
  readonly waitRef: string;
  readonly repository: string;
  readonly commitSha: string;
  readonly branch: string;
  readonly provider?: string;
  readonly runRef?: string;
  readonly originatingWorkflowRunId?: string;
  readonly originatingOperationId?: string;
  readonly suspendedAt?: string;
}

/** Coordinator boundary used by the CI completion loop. */
export interface CICoordinator {
  /** Atomic: task in-progress → awaiting-verification + correlation persisted. */
  beginExternalVerificationWait(input: BeginCoordinatorWaitInput): Promise<void>;
  /** Exactly-once: awaiting-verification → in-progress, citing the decision. */
  resumeExternalVerificationWait(input: { waitRef: string; decisionRef: string; resumedAt?: string }): Promise<void>;
  findWaitsByCommit(repository: string, commitSha: string): Promise<readonly CICoordinatorWait[]>;
  /** Attach the observed provider run identity (first observation wins). */
  attachWaitRunRef(waitRef: string, runRef: string): Promise<void>;
}
