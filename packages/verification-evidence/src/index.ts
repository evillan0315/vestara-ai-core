/**
 * @vestara/verification-evidence — verification evidence kernel (ADR-012)
 *
 * Immutable evidence snapshots, comparability evaluation, derived deltas, and
 * justified conclusions. The kernel is domain-agnostic: domain adapters
 * implement `EvidenceCollector` and `EvidenceComparator`, and the framework
 * owns provenance, comparability, confidence, and conclusion derivation.
 *
 * Architecture Traceability:
 *   ADR: docs/ADR/ADR-012-verification-evidence-framework.md
 */

export type { EvidenceCollector, TypedEvidenceCollector } from './collector';
export type { Comparability, ComparabilityStatus } from './comparability';
export type { EvidenceComparator } from './comparator';
export {
  deriveConclusion,
  type VerificationConclusion,
  type VerificationConclusionStatus,
} from './conclusion';
export type { Confidence, ConfidenceLevel } from './confidence';
export type { EvidenceDelta } from './delta';
export {
  EvidenceError,
  MismatchedEvidenceTypeError,
  MissingBaselineError,
} from './errors';
export { canonicalJson, hashJson, snapshotContentHash } from './hash';
export type { EvidenceIdentity, EvidenceSnapshot } from './snapshot';
