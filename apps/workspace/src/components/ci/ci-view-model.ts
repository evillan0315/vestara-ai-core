/**
 * CI-UI-002 — Reusable CI presentation model.
 *
 * Maps the accepted CI-OBS backend projection into render-safe view state for
 * the Settings → Integrations → Continuous Integration surface. The same
 * presentation is intended for Activity Room, Execution, and Workflow views,
 * so it lives in `components/ci` rather than under Settings.
 *
 * Authority boundaries preserved (never blurred by this model):
 *   - GitHub CI status ≠ Vestara verification decision.
 *   - CI pass ≠ objective verification.
 *   - Observation ≠ authorization.
 *   - CI failure ≠ repair authority.
 *   - Push authority ≠ merge authority.
 *   - Missing backend data → `unavailable` (HOLD), never fabricated.
 *
 * Canonical vocabularies consumed from `@vestara/ci-contracts` (frozen
 * CI-OBS-001B): `CIStatus`, `CIConclusion`, `CIClassification`. The reviewer
 * verdict and orchestration action unions mirror frozen CI-OBS-001D-001 and
 * CI-OBS-002A; they are re-validated against canonical values in tests rather
 * than re-declared as CI authority.
 */

import type { CIClassification, CIConclusion, CIStatus } from '@vestara/ci-contracts';

// ─── Availability ───────────────────────────────────────────────────

/**
 * Whether a value/panel has an authoritative backend source.
 *
 * `unavailable` is a first-class HOLD: the accepted backend does not yet
 * expose the information, so the UI must say so instead of inventing state.
 */
export type CIAvailability = 'available' | 'unavailable' | 'unknown';

// ─── Vocabularies (mirrors of frozen contracts) ─────────────────────

/** Mirrors CI-OBS-001D-001 reviewer promotion verdict. */
export type CIVerdict = 'promote' | 'hold' | 'reject' | 'unknown';

/** Mirrors CI-OBS-002A orchestration-layer verification action. */
export type CIVerificationAction = 'HOLD' | 'REPAIR_CANDIDATE' | 'PROCEED_TO_VERIFICATION';

/**
 * Vestara-side verification disposition derived from the reviewer action.
 *
 * `pending-verification` explicitly means "CI concluded, Vestara has not
 * verified the objective" — it is never rendered as verified.
 */
export type CIVerificationDisposition =
  | 'awaiting-ci'
  | 'pending-verification'
  | 'hold'
  | 'repair-candidate'
  | 'inconclusive'
  | 'unavailable';

// ─── Correlation ────────────────────────────────────────────────────

/**
 * Structural projection of `TaskStore` `ExternalVerificationWait`
 * (CI-OBS-002B2 coordinator port). The backend is authoritative; this is a
 * read-only shape for display.
 */
export interface CIWaitProjection {
  readonly taskId: string;
  readonly taskSummary?: string;
  readonly taskStatus?: string;
  readonly waitRef: string;
  readonly verifier?: 'ci';
  readonly provider?: string;
  readonly runRef?: string;
  readonly repository: string;
  readonly commitSha: string;
  readonly branch: string;
  readonly originatingWorkflowRunId?: string;
  readonly originatingOperationId?: string;
  readonly suspendedAt: string;
  readonly resumedAt?: string;
  readonly decisionRef?: string;
  /** Governed deadline assessment (H7) from the read boundary. */
  readonly deadline?: CIWaitDeadlineView;
}

/** Governed wait deadline assessment. */
export interface CIWaitDeadlineView {
  readonly state: 'active' | 'resolved' | 'stale' | 'unknown';
  readonly deadlineMs: number;
  readonly ageMs?: number;
  readonly reason: string;
}

/** Correlation diagnostics for one governed push ↔ CI wait. */
export interface CICorrelationView {
  readonly correlationId: string;
  readonly taskId: string;
  readonly repository: string;
  readonly branch: string;
  readonly commitSha: string;
  readonly provider: CIStringField;
  readonly workflowRunId: CIStringField;
  readonly originatingWorkflowRunId: CIStringField;
  readonly originatingOperationId: CIStringField;
  readonly suspendedAt: CIStringField;
  readonly resumedAt: CIStringField;
  readonly decisionRef: CIStringField;
}

/** A value that knows whether the backend actually supplied it. */
export type CIStringField =
  | { readonly availability: 'available'; readonly value: string }
  | { readonly availability: 'unavailable'; readonly reason?: string };

export function field(value: string | undefined, reason?: string): CIStringField {
  return value !== undefined && value !== ''
    ? { availability: 'available', value }
    : { availability: 'unavailable', ...(reason !== undefined ? { reason } : {}) };
}

/** Build correlation diagnostics from a coordinator-owned wait. */
export function correlationFromWait(wait: CIWaitProjection): CICorrelationView {
  return {
    correlationId: wait.waitRef,
    taskId: wait.taskId,
    repository: wait.repository,
    branch: wait.branch,
    commitSha: wait.commitSha,
    provider: field(wait.provider, 'Provider not attached yet'),
    workflowRunId: field(wait.runRef, 'CI run identity not observed yet'),
    originatingWorkflowRunId: field(wait.originatingWorkflowRunId, 'Not supplied by the coordinator'),
    originatingOperationId: field(wait.originatingOperationId, 'Not supplied by the coordinator'),
    suspendedAt: field(wait.suspendedAt),
    resumedAt: field(wait.resumedAt, 'Wait not resumed'),
    decisionRef: field(wait.decisionRef, 'No decision cited yet'),
  };
}

// ─── Wait ───────────────────────────────────────────────────────────

/** One authoritative external-verification wait (task + correlation). */
export interface CIWaitView {
  readonly taskId: string;
  readonly taskSummary: string;
  readonly taskStatus: string;
  /** `true` while `awaiting-verification` and not yet resumed. */
  readonly suspended: boolean;
  readonly deadline?: CIWaitDeadlineView;
  readonly correlation: CICorrelationView;
}

export function waitToView(wait: CIWaitProjection): CIWaitView {
  return {
    taskId: wait.taskId,
    taskSummary: wait.taskSummary ?? wait.taskId,
    taskStatus: wait.taskStatus ?? 'awaiting-verification',
    suspended: wait.resumedAt === undefined,
    ...(wait.deadline !== undefined ? { deadline: wait.deadline } : {}),
    correlation: correlationFromWait(wait),
  };
}

// ─── GitHub CI status ───────────────────────────────────────────────

/**
 * GitHub Actions state as observed through the adapter.
 *
 * `status`/`conclusion` are canonical (CI-OBS-001B); `providerStatus` /
 * `providerConclusion` are raw provenance for diagnostics only.
 */
export interface CIGitHubCIView {
  readonly availability: CIAvailability;
  readonly status?: CIStatus;
  readonly conclusion?: CIConclusion;
  readonly providerStatus?: string;
  readonly providerConclusion?: string;
  readonly runId?: string;
  readonly workflowName?: string;
  readonly commitSha?: string;
  /** True when the observation itself failed (retrieval failure ≠ CI failure). */
  readonly retrievalFailure?: boolean;
  readonly retrievalError?: string;
  readonly observedAt?: string;
  readonly reason?: string;
}

// ─── Vestara verification ───────────────────────────────────────────

/** Vestara-side verification decision — distinct from GitHub CI status. */
export interface CIVestaraVerificationView {
  readonly availability: CIAvailability;
  readonly disposition: CIVerificationDisposition;
  readonly verdict?: CIVerdict;
  readonly classification?: CIClassification;
  readonly action?: CIVerificationAction;
  readonly decisionRef?: string;
  readonly reason?: string;
  readonly decidedAt?: string;
}

// ─── Webhook health ─────────────────────────────────────────────────

/**
 * Webhook ingress health. Health is NEVER inferred from the absence of
 * events: no delivery read boundary means `unknown`, not `healthy`.
 */
export interface CIWebhookHealthView {
  readonly state: 'configured' | 'receiving' | 'error' | 'unknown';
  readonly detail?: string;
  readonly lastDeliveryAt?: string;
  readonly signatureConfigured?: boolean;
}

// ─── Lifecycle trace ────────────────────────────────────────────────

export type CILifecycleStageId =
  | 'workflow-task'
  | 'awaiting-verification'
  | 'github-ci'
  | 'ci-observation'
  | 'vestara-verification'
  | 'resumed';

export type CILifecycleStageState = 'complete' | 'active' | 'pending' | 'unknown' | 'unavailable';

export interface CILifecycleStage {
  readonly id: CILifecycleStageId;
  readonly label: string;
  readonly state: CILifecycleStageState;
  readonly detail?: string;
}

/**
 * Project the accepted CI lifecycle:
 *   Workflow Task → awaiting-verification → GitHub CI → CI Observation
 *   → Vestara Verification → resumed
 *
 * Stages with no backend source are `unavailable` (HOLD), not fabricated.
 */
export function buildLifecycle(
  wait: CIWaitView,
  github: CIGitHubCIView,
  verification: CIVestaraVerificationView,
): readonly CILifecycleStage[] {
  const resumed = wait.correlation.resumedAt.availability === 'available';
  const githubStage = lifecycleForGitHub(github);
  const observationStage: CILifecycleStage = github.availability === 'available'
    ? { id: 'ci-observation', label: 'CI Observation', state: 'complete', detail: 'Observation captured' }
    : {
        id: 'ci-observation',
        label: 'CI Observation',
        state: 'unavailable',
        detail: 'No observation read boundary is exposed by the backend',
      };

  return [
    {
      id: 'workflow-task',
      label: 'Workflow Task',
      state: 'complete',
      detail: wait.taskId,
    },
    {
      id: 'awaiting-verification',
      label: 'Awaiting verification',
      state: resumed ? 'complete' : wait.suspended ? 'active' : 'unknown',
      detail: resumed
        ? `Resumed ${wait.correlation.resumedAt.availability === 'available' ? wait.correlation.resumedAt.value : ''}`.trim()
        : wait.suspended
          ? 'Task suspended while GitHub executes'
          : 'Task is not in an external-verification wait',
    },
    githubStage,
    observationStage,
    lifecycleForVerification(verification),
    {
      id: 'resumed',
      label: 'Resumed',
      state: resumed ? 'complete' : 'pending',
      detail: resumed
        ? wait.correlation.decisionRef.availability === 'available'
          ? wait.correlation.decisionRef.value
          : 'Decision cited'
        : 'Waiting for a verified external completion',
    },
  ];
}

function lifecycleForGitHub(github: CIGitHubCIView): CILifecycleStage {
  if (github.availability !== 'available') {
    return {
      id: 'github-ci',
      label: 'GitHub CI',
      state: 'unavailable',
      detail: github.reason ?? 'No CI observation read boundary is exposed by the backend',
    };
  }
  if (github.status === 'completed') {
    return { id: 'github-ci', label: 'GitHub CI', state: 'complete', detail: github.conclusion ?? 'completed' };
  }
  if (github.status === 'running' || github.status === 'queued') {
    return { id: 'github-ci', label: 'GitHub CI', state: 'active', detail: github.status };
  }
  return { id: 'github-ci', label: 'GitHub CI', state: 'unknown', detail: github.status ?? 'unknown' };
}

function lifecycleForVerification(verification: CIVestaraVerificationView): CILifecycleStage {
  if (verification.availability !== 'available' || verification.disposition === 'unavailable') {
    return {
      id: 'vestara-verification',
      label: 'Vestara Verification',
      state: 'unavailable',
      detail: 'Reviewer decision is not exposed for retrieval',
    };
  }
  if (verification.disposition === 'awaiting-ci') {
    return {
      id: 'vestara-verification',
      label: 'Vestara Verification',
      state: 'pending',
      detail: 'Waiting for GitHub CI to reach terminal state',
    };
  }
  return {
    id: 'vestara-verification',
    label: 'Vestara Verification',
    state: 'complete',
    detail: verification.reason ?? verification.disposition,
  };
}

// ─── Disposition ────────────────────────────────────────────────────

/**
 * Map the orchestration action to a Vestara disposition.
 *
 * A `PROCEED_TO_VERIFICATION` action means the CI passed and the objective is
 * now pending Vestara verification — never that it is verified.
 */
export function dispositionFromAction(action: CIVerificationAction | undefined): CIVerificationDisposition {
  switch (action) {
    case 'PROCEED_TO_VERIFICATION':
      return 'pending-verification';
    case 'REPAIR_CANDIDATE':
      return 'repair-candidate';
    case 'HOLD':
      return 'hold';
    default:
      return 'unavailable';
  }
}

// ─── Presentation helpers (pure, token-mapped) ──────────────────────

export type CITone = 'positive' | 'negative' | 'warning' | 'info' | 'neutral' | 'unknown';

/** Semantic tone for a canonical CI status. Pure. */
export function toneForStatus(status: CIStatus | undefined): CITone {
  switch (status) {
    case 'completed':
      return 'neutral';
    case 'running':
      return 'info';
    case 'queued':
      return 'warning';
    case 'discovered':
      return 'neutral';
    default:
      return 'unknown';
  }
}

/**
 * Semantic tone for a terminal conclusion. `passed` is positive for GitHub CI
 * only — the Vestara card intentionally renders it as pending, not verified.
 */
export function toneForConclusion(conclusion: CIConclusion | undefined): CITone {
  switch (conclusion) {
    case 'passed':
      return 'positive';
    case 'failed':
      return 'negative';
    case 'cancelled':
      return 'neutral';
    case 'timed_out':
      return 'warning';
    case 'skipped':
      return 'neutral';
    default:
      return 'unknown';
  }
}

/** Semantic tone for a Vestara verification disposition. Pure. */
export function toneForDisposition(disposition: CIVerificationDisposition): CITone {
  switch (disposition) {
    case 'pending-verification':
      return 'info';
    case 'hold':
      return 'warning';
    case 'repair-candidate':
      return 'negative';
    case 'awaiting-ci':
      return 'neutral';
    case 'inconclusive':
      return 'unknown';
    default:
      return 'unknown';
  }
}

const VERDICT_LABELS: Record<CIVerdict, string> = {
  promote: 'Promoted',
  hold: 'HOLD',
  reject: 'Rejected',
  unknown: 'UNKNOWN',
};

export function labelForVerdict(verdict: CIVerdict | undefined): string {
  return verdict ? VERDICT_LABELS[verdict] : 'Not recorded';
}

const ACTION_LABELS: Record<CIVerificationAction, string> = {
  HOLD: 'HOLD',
  REPAIR_CANDIDATE: 'Repair candidate',
  PROCEED_TO_VERIFICATION: 'Proceed to verification',
};

export function labelForAction(action: CIVerificationAction | undefined): string {
  return action ? ACTION_LABELS[action] : 'Not recorded';
}

const DISPOSITION_LABELS: Record<CIVerificationDisposition, string> = {
  'awaiting-ci': 'Awaiting CI',
  'pending-verification': 'Pending Vestara verification',
  hold: 'HOLD — decision deferred',
  'repair-candidate': 'Repair candidate (not authorized)',
  inconclusive: 'Inconclusive',
  unavailable: 'Not available',
};

export function labelForDisposition(disposition: CIVerificationDisposition): string {
  return DISPOSITION_LABELS[disposition];
}

/** Human label for a canonical CI status. Pure. */
export function labelForStatus(status: CIStatus | undefined): string {
  if (!status) return 'Not observed';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/** Human label for a canonical conclusion. Pure. */
export function labelForConclusion(conclusion: CIConclusion | undefined): string {
  if (!conclusion) return 'No conclusion';
  return conclusion
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** Relative time label. Pure w.r.t. the supplied `now`. */
export function relativeTime(iso: string | undefined, now: number = Date.now()): string {
  if (!iso) return 'Never';
  const ms = now - new Date(iso).getTime();
  if (Number.isNaN(ms)) return 'Unknown';
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Short commit SHA for dense rows (never mutates the canonical value). */
export function shortSha(sha: string): string {
  return sha.length > 10 ? sha.slice(0, 10) : sha;
}
