/**
 * @vestara/ci-contracts — Layer-0 leaf contracts for CI Observation &
 * Verification (CI-OBS-001B).
 *
 * Provider-neutral vocabulary, lifecycle, identities, evidence, and
 * finding types for representing CI verification state. GitHub Actions
 * and other CI providers are adapters over these contracts.
 *
 * Invariants preserved:
 *   - Failure ≠ Root Cause
 *   - Observation ≠ Hypothesis ≠ Finding
 *   - Claim ≠ Evidence
 *   - UNKNOWN is valid
 *   - Retrieval failure ≠ CI failure
 *   - CI Pass ≠ Objective Verification
 *   - Recommendation ≠ Authority
 *   - Observation must not confer mutation authority
 *
 * No dependencies. No IO. No persistence. No event bus.
 * Types, closed vocabularies, type guards, and pure helpers only.
 */

// ─── Check ──────────────────────────────────────────────────────────
export type { CICheck, CIRawCheckConclusion, CIRawCheckStatus } from './check';
export { hasFailureEvidence, isTerminalCheck } from './check';
// ─── Classification ─────────────────────────────────────────────────
export type { CIClassification } from './classification';
export {
  CI_CLASSIFICATIONS,
  isTransientClassification,
  isUnknownClassification,
  TRANSIENT_CLASSIFICATIONS,
} from './classification';

// ─── Conclusion (terminal) ─────────────────────────────────────────
export type { CIConclusion } from './conclusion';
export {
  CI_CONCLUSIONS,
  COMPLETED_CONCLUSIONS,
  INCONCLUSIVE_CONCLUSIONS,
  isCompletedConclusion,
  isPassedConclusion,
  isUnknownConclusion,
} from './conclusion';
// ─── Evidence ───────────────────────────────────────────────────────
export type { CIFailureEvidence, CIFailureEvidenceKind } from './evidence';
export { CI_FAILURE_EVIDENCE_KINDS, isLogEvidence } from './evidence';
// ─── Finding ────────────────────────────────────────────────────────
export type { CIFinding, CIFindingSeverity, CIFindingStatus } from './finding';
export { CI_FINDING_SEVERITIES, CI_FINDING_STATUSES, isTerminalFinding } from './finding';
// ─── Hypothesis ─────────────────────────────────────────────────────
export type { CIHypothesis, CIHypothesisStatus } from './hypothesis';
export { CI_HYPOTHESIS_STATUSES, isTerminalHypothesis } from './hypothesis';
// ─── Identity ──────────────────────────────────────────────────────
export type { CIAttempt, CICheckId, CICommitId, CIJobId, CIRepositoryRef, CIRunId, CISha } from './identity';
export {
  isValidCIAttempt,
  isValidCICheckId,
  isValidCICommitId,
  isValidCIJobId,
  isValidCIRepositoryRef,
  isValidCIRunId,
  isValidCISha,
  makeCIRepositoryRef,
} from './identity';
// ─── Job ────────────────────────────────────────────────────────────
export type { CIJob, CIRawJobStatus } from './job';
export { isTerminalJob } from './job';
// ─── Observation ────────────────────────────────────────────────────
export type { CIObservation, CIObservationStatus, CIObservationTrigger } from './observation';
export { CI_OBSERVATION_STATUSES, isRetrievalFailure, isTerminalObservation } from './observation';
// ─── Run (top-level entity) ────────────────────────────────────────
export type { CIRawRunConclusion, CIRawRunStatus, CIVerificationRun } from './run';
export { isFailedRun, isPassedRun, isRerun, isTerminalRun } from './run';
// ─── Status (lifecycle) ────────────────────────────────────────────
export type { CIStatus } from './status';
export { CI_STATUSES, isActiveStatus, isNonTerminalStatus, isTerminalStatus } from './status';
