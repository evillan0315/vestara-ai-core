/**
 * CI-OBS-001B — CIFinding — a structured conclusion drawn from CI evidence.
 *
 * A finding is not a root cause determination. It is a classified
 * observation backed by evidence. Findings can be reviewed, rejected,
 * or superseded by new evidence.
 *
 * Invariants:
 *   - Finding ≠ Root Cause
 *   - Observation must not confer mutation authority
 *   - Recommendation ≠ Authority
 *   - Claim ≠ Evidence
 */

import type { CIClassification } from './classification';
import type { CICommitId } from './identity';

/** Status of a finding in the review lifecycle. */
export type CIFindingStatus = 'open' | 'investigating' | 'classified' | 'rejected' | 'superseded';

/** Closed vocabulary — all valid finding statuses. */
export const CI_FINDING_STATUSES: readonly CIFindingStatus[] = [
  'open',
  'investigating',
  'classified',
  'rejected',
  'superseded',
];

/** Severity of a finding — informational only, not authoritative. */
export type CIFindingSeverity = 'critical' | 'major' | 'minor' | 'info';

/** Closed vocabulary — all valid finding severities. */
export const CI_FINDING_SEVERITIES: readonly CIFindingSeverity[] = ['critical', 'major', 'minor', 'info'];

/** True when the finding is in a terminal state. Pure. */
export function isTerminalFinding(status: CIFindingStatus): boolean {
  return status === 'rejected' || status === 'superseded';
}

/** A structured conclusion drawn from CI evidence. */
export interface CIFinding {
  /** Unique finding identifier. */
  readonly findingId: string;

  /** Human-readable title. */
  readonly title: string;

  /** Detailed description of the finding. */
  readonly description: string;

  /** Current status in the review lifecycle. */
  readonly status: CIFindingStatus;

  /** Classification of the failure category. */
  readonly classification: CIClassification;

  /** Severity — informational, not authoritative. */
  readonly severity: CIFindingSeverity;

  /** Evidence IDs supporting this finding. */
  readonly evidenceIds: readonly string[];

  /** Commit when this finding was produced (provider-neutral identity). */
  readonly commitSha: CICommitId;

  /** Confidence level in this finding. */
  readonly confidence: 'low' | 'medium' | 'high';

  /** When this finding was created. ISO-8601. */
  readonly createdAt: string;

  /** When this finding was last updated. ISO-8601. */
  readonly updatedAt: string;

  /** Optional: recommendation for next steps. Not authority. */
  readonly recommendation?: string;

  /** Optional: IDs of findings this supersedes. */
  readonly supersedes?: readonly string[];

  /** Optional: IDs of related findings. */
  readonly relatedFindingIds?: readonly string[];
}
