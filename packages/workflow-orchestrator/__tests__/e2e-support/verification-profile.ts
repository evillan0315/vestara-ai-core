/**
 * WFO-E2E-001F — deterministic verification profile.
 *
 * Produces immutable ADR-012 verification evidence snapshots bound to the
 * execution attempt identity. `executionAttemptId` prevents evidence from one
 * failed attempt being attributed to its retry. Checks are deterministic: each
 * check carries a failure fingerprint so regression detection is based on
 * fingerprints, never raw failure counts.
 */

import { type EvidenceSnapshot, snapshotContentHash } from '@vestara/verification-evidence';

export interface VerificationEvidenceIdentity {
  readonly workflowId: string;
  readonly taskId: string;
  readonly executionAttemptId: string;
  readonly repositoryBaselineSha: string;
  readonly repositoryCurrentSha: string;
  readonly verificationProfileId: string;
  readonly verificationScope: string;
  readonly environmentFingerprint: string;
}

export interface VerificationExecution {
  readonly commands: readonly string[];
  readonly environmentFingerprint: string;
  readonly durationMs: number;
}

export interface VerificationCheckResult {
  readonly check: string;
  readonly passed: boolean;
  readonly fingerprint?: string;
}

export interface VerificationResults {
  readonly checks: readonly VerificationCheckResult[];
  readonly failureFingerprints: readonly string[];
  readonly passed: boolean;
}

export type VerificationSnapshot = EvidenceSnapshot<
  VerificationEvidenceIdentity,
  VerificationExecution,
  VerificationResults
>;

export interface RepositoryState {
  readonly currentSha: string;
  readonly changedArtifactHashes: readonly string[];
  readonly changedFiles: readonly string[];
}

export function failureFingerprints(checks: readonly VerificationCheckResult[]): string[] {
  return checks.filter((check) => !check.passed).map((check) => check.fingerprint ?? check.check);
}

export interface VerificationSnapshotInput {
  readonly identity: VerificationEvidenceIdentity;
  readonly execution: VerificationExecution;
  readonly checks: readonly VerificationCheckResult[];
  readonly capturedAt?: string;
}

export const VERIFICATION_SCHEMA_VERSION = 'wfo-e2e-001f';
export const VERIFICATION_EVIDENCE_TYPE = 'workflow-verification';

/** Build an immutable verification snapshot with a deterministic content hash. */
export function verificationSnapshot(input: VerificationSnapshotInput): VerificationSnapshot {
  const failure = failureFingerprints(input.checks);
  const base = {
    schemaVersion: VERIFICATION_SCHEMA_VERSION,
    evidenceType: VERIFICATION_EVIDENCE_TYPE,
    identity: input.identity,
    execution: input.execution,
    results: {
      checks: input.checks,
      failureFingerprints: failure,
      passed: failure.length === 0,
    },
    capturedAt: input.capturedAt ?? new Date().toISOString(),
  };
  return { ...base, contentHash: snapshotContentHash(base) };
}
