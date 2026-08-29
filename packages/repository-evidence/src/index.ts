/**
 * @vestara/repository-evidence — repository verification evidence adapter
 * (ADR-012 reference implementation).
 *
 * The first domain consumer of the verification evidence kernel. Collects
 * repository verification observations into immutable snapshots and compares
 * them with repository-specific semantics: failure fingerprints, actual
 * verification scope, and environment dimensions.
 *
 * Architecture Traceability:
 *   ADR: docs/ADR/ADR-012-verification-evidence-framework.md
 */

export { environmentChanged, environmentFingerprint, lockfileHash } from './environment-fingerprint';
export {
  compareFailures,
  type FailureDelta,
  failureFingerprint,
  fingerprintFromFailure,
  normalizeFailureMessage,
} from './failure-fingerprint';
export type {
  EnvironmentFingerprint,
  RepositoryEvidenceExecution,
  RepositoryEvidenceResults,
  RepositoryEvidenceSnapshot,
  RepositoryFailure,
  VerificationProfile,
  VerificationScope,
} from './repository-evidence';
export type { RepositoryEvidenceInput } from './repository-evidence-collector';
export { collectRepositoryEvidence } from './repository-evidence-collector';
export type { RepositoryComparisonResult, RepositoryEvidenceChanges } from './repository-evidence-comparator';
export { deltaHash, RepositoryEvidenceComparator } from './repository-evidence-comparator';
