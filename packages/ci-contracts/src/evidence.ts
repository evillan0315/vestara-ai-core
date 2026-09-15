/**
 * CI-OBS-001B — CIFailureEvidence — raw evidence of a CI failure.
 *
 * Evidence is what was observed, not why it happened. The adapter
 * retrieves this from the CI provider (e.g. failed step logs). Evidence
 * is content-addressed where possible and carries provenance.
 *
 * Invariant: Claim ≠ Evidence. Evidence does not explain — it records.
 */

/** A single piece of failure evidence. */
export interface CIFailureEvidence {
  /** Unique evidence identifier (content hash or provider-generated). */
  readonly evidenceId: string;

  /** What kind of evidence this is. */
  readonly kind: CIFailureEvidenceKind;

  /** Human-readable summary of the evidence. */
  readonly summary: string;

  /** Raw log content or excerpt, if available. */
  readonly logContent?: string;

  /** Step/job name where the failure occurred. */
  readonly stepName?: string;

  /** Exit code, if available. */
  readonly exitCode?: number;

  /** URL to the full evidence in the provider's UI. Provenance. */
  readonly url?: string;

  /** When this evidence was captured. ISO-8601. */
  readonly capturedAt: string;
}

/** Kinds of CI failure evidence. Closed vocabulary. */
export type CIFailureEvidenceKind =
  | 'log-excerpt'
  | 'error-message'
  | 'stack-trace'
  | 'test-output'
  | 'build-output'
  | 'screenshot'
  | 'artifact';

/** Closed vocabulary — all valid failure evidence kinds. */
export const CI_FAILURE_EVIDENCE_KINDS: readonly CIFailureEvidenceKind[] = [
  'log-excerpt',
  'error-message',
  'stack-trace',
  'test-output',
  'build-output',
  'screenshot',
  'artifact',
];

/** True when the evidence kind is a text-based log. Pure. */
export function isLogEvidence(kind: CIFailureEvidenceKind): boolean {
  return (
    kind === 'log-excerpt' ||
    kind === 'error-message' ||
    kind === 'stack-trace' ||
    kind === 'test-output' ||
    kind === 'build-output'
  );
}
