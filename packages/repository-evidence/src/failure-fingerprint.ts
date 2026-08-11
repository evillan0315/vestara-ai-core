/**
 * Failure fingerprinting — stable identifiers for individual test failures.
 *
 * A fingerprint identifies a failure by its suite path, test name, and
 * normalized message hash. Comparing fingerprints (not counts) detects added,
 * resolved, and unchanged failures even when the total count is the same.
 */

import type { RepositoryFailure } from './repository-evidence';

/** Normalize a failure message to remove run-specific noise (timestamps, ids). */
export function normalizeFailureMessage(message: string): string {
  return message
    .replace(/\/\d{4}-\d{2}-\d{2}T[^/]*/g, '/<timestamp>')
    .replace(/[a-f0-9]{7,40}/gi, '<hash>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function failureFingerprint(suitePath: string, testName: string, normalizedMessage: string): string {
  return `${suitePath}::${testName}::${normalizedMessage}`;
}

export function fingerprintFromFailure(failure: Omit<RepositoryFailure, 'fingerprint'>): RepositoryFailure {
  return {
    ...failure,
    fingerprint: failureFingerprint(failure.suitePath, failure.testName, failure.normalizedMessageHash),
  };
}

export interface FailureDelta {
  readonly addedFailures: RepositoryFailure[];
  readonly resolvedFailures: RepositoryFailure[];
  readonly unchangedFailures: RepositoryFailure[];
  readonly fingerprintChanged: boolean;
  readonly addedCount: number;
  readonly resolvedCount: number;
  readonly unchangedCount: number;
}

/** Compare two failure sets by fingerprint. Returns identity-level changes. */
export function compareFailures(
  baseline: readonly RepositoryFailure[],
  current: readonly RepositoryFailure[],
): FailureDelta {
  const baselineSet = new Map(baseline.map((f) => [f.fingerprint, f]));
  const currentSet = new Map(current.map((f) => [f.fingerprint, f]));
  const addedFailures = current.filter((f) => !baselineSet.has(f.fingerprint));
  const resolvedFailures = baseline.filter((f) => !currentSet.has(f.fingerprint));
  const unchangedFailures = current.filter((f) => baselineSet.has(f.fingerprint));
  return {
    addedFailures,
    resolvedFailures,
    unchangedFailures,
    fingerprintChanged: addedFailures.length > 0 || resolvedFailures.length > 0,
    addedCount: addedFailures.length,
    resolvedCount: resolvedFailures.length,
    unchangedCount: unchangedFailures.length,
  };
}
