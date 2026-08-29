/**
 * Repository evidence snapshot shapes (ADR-012 reference adapter).
 *
 * Captures what was verified (identity), how it was verified (execution), and
 * what was observed (results). The `verificationScope` records what actually
 * ran — not just what command was requested — so two runs with the same
 * command but different scope are not treated as equivalent.
 */

import type { EvidenceIdentity } from '@vestara/verification-evidence';

export type VerificationProfile = 'changed-path' | 'package' | 'full-suite' | 'release' | 'nightly';

export interface VerificationScope {
  readonly packages: string[];
  readonly applications: string[];
  readonly testsExecuted: string[];
  readonly filesChanged: string[];
}

export interface EnvironmentFingerprint {
  readonly nodeVersion: string;
  readonly platform: string;
  readonly architecture: string;
  readonly packageManagerVersion: string;
  readonly dependencyLockHash: string;
}

export interface RepositoryEvidenceExecution {
  readonly testCommand: string;
  readonly workingDirectory: string;
  readonly verificationProfile: VerificationProfile;
  readonly verificationScope: VerificationScope;
  readonly environmentFingerprint: EnvironmentFingerprint;
}

export interface RepositoryFailure {
  readonly suitePath: string;
  readonly testName: string;
  readonly normalizedMessageHash: string;
  readonly fingerprint: string;
}

export interface RepositoryEvidenceResults {
  readonly testSummary: {
    readonly passed: number;
    readonly failed: number;
    readonly skipped: number;
    readonly total: number;
  };
  readonly failures: RepositoryFailure[];
  readonly buildStatus: 'passed' | 'failed' | 'not-run';
  readonly lintStatus: 'passed' | 'failed' | 'not-run';
  readonly dependencyStatus: 'passed' | 'failed' | 'not-run';
  readonly documentationStatus: 'passed' | 'failed' | 'not-run';
  readonly artifactHashes: Record<string, string>;
}

export type RepositoryEvidenceSnapshot = {
  readonly schemaVersion: string;
  readonly evidenceType: 'repository';
  readonly identity: EvidenceIdentity;
  readonly execution: RepositoryEvidenceExecution;
  readonly results: RepositoryEvidenceResults;
  readonly capturedAt: string;
  readonly contentHash: string;
};
