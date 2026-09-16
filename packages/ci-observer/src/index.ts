/**
 * @vestara/ci-observer — provider-neutral CI completion vertical slice.
 *
 * Correlates a governed push to its GitHub CI run, suspends the originating
 * task (`running → waiting`, typed reason `ci`), ingests verified GitHub
 * completion webhooks, normalizes through `@vestara/github-ci-adapter`,
 * reviews through the frozen `@vestara/ci-reviewer`, derives a workflow action
 * in this orchestration layer, and resumes the task (`waiting → running`).
 *
 * Boundaries:
 *   - GitHub executes; Vestara adjudicates.
 *   - CI failure ≠ repair authority; CI pass ≠ objective verification.
 *   - Observation ≠ authority; suggestions are diagnostic input only.
 */

export type { CIVerificationAction, CIVerificationOutcome } from './action';
export { deriveVerificationAction } from './action';
export type {
  CICompletionResult,
  CIVerificationServiceDeps,
  GitHubCompletionJob,
  HandleCompletionInput,
  RegisterPushResult,
} from './completion';
export { CIVerificationService } from './completion';
// Coordinator port (authoritative workflow task store boundary)
export type { BeginCoordinatorWaitInput, CICoordinator, CICoordinatorWait } from './coordinator';
export type { CICorrelationRecord, CICorrelationStore, RegisterCorrelationInput } from './correlation';
export { createCICorrelationRecord, deriveCorrelationId, InMemoryCICorrelationStore } from './correlation';
// Durable substrate (registered migrations + sql.js-backed stores)
export { CI_OBSERVER_MIGRATIONS } from './migrations';
export type {
  CIWaitReconcileAction,
  CIWaitReconcileDecision,
  CIWaitReconcileInput,
  CIWaitRunObservation,
} from './reconcile';
export { reconcileWait } from './reconcile';
export { SqliteCICorrelationStore } from './sqlite-correlation-store';
export { SqliteCITaskGate } from './sqlite-task-gate';
export type {
  CITaskGate,
  CITaskResumeRecord,
  CITaskWaitReason,
  CITaskWaitRecord,
  ResumeCITaskInput,
  SuspendCITaskInput,
} from './task-gate';
export { InMemoryCITaskGate } from './task-gate';
export type {
  CIWaitDeadlineAssessment,
  CIWaitDeadlineInput,
  CIWaitDeadlinePolicy,
  CIWaitDeadlineState,
} from './wait-deadline';
export { DEFAULT_CI_WAIT_DEADLINE_MS, evaluateWaitDeadline } from './wait-deadline';
export type {
  ValidateIngressInput,
  WebhookHeaders,
  WebhookIngressDecision,
  WebhookIngressKind,
} from './webhook';
export {
  computeGitHubSignature,
  DeliveryDeduplicator,
  GITHUB_DELIVERY_HEADER,
  GITHUB_EVENT_HEADER,
  GITHUB_SIGNATURE_HEADER,
  readHeader,
  validateWebhookIngress,
  verifyGitHubSignature,
} from './webhook';
