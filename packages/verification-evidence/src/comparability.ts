/**
 * Comparability — evaluated before any conclusion (ADR-012 core invariant).
 *
 * Evidence that cannot be compared must produce an indeterminate conclusion,
 * never pass or fail. Partial comparability narrows the dimensions that may
 * legitimately feed a conclusion and lowers confidence.
 */

export type ComparabilityStatus = 'comparable' | 'partially-comparable' | 'incomparable';

export interface Comparability {
  readonly status: ComparabilityStatus;
  readonly reasons: string[];
  /** Dimensions whose comparison is valid (e.g. 'failure-fingerprint'). */
  readonly comparableDimensions: string[];
  /** Dimensions that differ enough to invalidate comparison on that axis. */
  readonly incomparableDimensions: string[];
}
