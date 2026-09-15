/**
 * CI-OBS-001B — CIHypothesis — a proposed explanation for a CI failure.
 *
 * Hypotheses are not findings. A hypothesis is a claim that requires
 * evidence to confirm or reject. The hypothesis memory (CI-OBS-001E)
 * prevents re-investigating already-tested hypotheses.
 *
 * Invariants:
 *   - Hypothesis ≠ Finding ≠ Observation
 *   - New contradictory evidence must be capable of reopening a rejected hypothesis
 *   - Never convert a historical finding into a universal truth
 */

/** Status of a hypothesis within the investigation lifecycle. */
export type CIHypothesisStatus = 'proposed' | 'investigating' | 'confirmed' | 'rejected' | 'inconclusive';

/** Closed vocabulary — all valid hypothesis statuses. */
export const CI_HYPOTHESIS_STATUSES: readonly CIHypothesisStatus[] = [
  'proposed',
  'investigating',
  'confirmed',
  'rejected',
  'inconclusive',
];

/** True when the hypothesis is in a terminal state. Pure. */
export function isTerminalHypothesis(status: CIHypothesisStatus): boolean {
  return status === 'confirmed' || status === 'rejected' || status === 'inconclusive';
}

/** A proposed explanation for a CI failure. */
export interface CIHypothesis {
  /** Unique hypothesis identifier. */
  readonly hypothesisId: string;

  /** Human-readable statement of the hypothesis. */
  readonly statement: string;

  /** Current investigation status. */
  readonly status: CIHypothesisStatus;

  /** Evidence that supports or contradicts this hypothesis. */
  readonly evidenceIds: readonly string[];

  /** Classification associated with this hypothesis, if classified. */
  readonly classification?: string;

  /** When this hypothesis was proposed. ISO-8601. */
  readonly proposedAt: string;

  /** When this hypothesis was last updated. ISO-8601. */
  readonly updatedAt: string;

  /** Commit SHA when this hypothesis was tested (for historical tracking). */
  readonly testedAtCommit?: string;

  /** Human-readable explanation of why the hypothesis was confirmed or rejected. */
  readonly resolution?: string;
}
