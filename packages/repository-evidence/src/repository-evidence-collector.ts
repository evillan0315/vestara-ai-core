/**
 * Repository evidence collector — turns verification output into an immutable
 * `RepositoryEvidenceSnapshot`. It records what actually ran (scope), not just
 * what was requested, and computes the content hash deterministically.
 */

import type { EvidenceIdentity } from '@vestara/verification-evidence';
import { snapshotContentHash } from '@vestara/verification-evidence';
import { fingerprintFromFailure } from './failure-fingerprint';
import type {
  RepositoryEvidenceExecution,
  RepositoryEvidenceResults,
  RepositoryEvidenceSnapshot,
  VerificationScope,
} from './repository-evidence';

export interface RepositoryEvidenceInput {
  readonly identity: EvidenceIdentity;
  readonly execution: RepositoryEvidenceExecution;
  readonly results: RepositoryEvidenceResults;
}

export function collectRepositoryEvidence(input: RepositoryEvidenceInput): RepositoryEvidenceSnapshot {
  const failures = input.results.failures.map(fingerprintFromFailure);
  const base = {
    schemaVersion: '1.0',
    evidenceType: 'repository' as const,
    identity: input.identity,
    execution: input.execution,
    results: { ...input.results, failures },
    capturedAt: new Date().toISOString(),
  };
  return { ...base, contentHash: snapshotContentHash(base) };
}

export type { RepositoryEvidenceExecution, RepositoryEvidenceResults, RepositoryEvidenceSnapshot, VerificationScope };
