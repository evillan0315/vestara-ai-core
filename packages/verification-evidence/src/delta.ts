/**
 * Evidence delta — the computed comparison between a baseline and a current
 * snapshot. Deltas are derived, never manually asserted (ADR-012).
 */

import type { Comparability } from './comparability';

export interface EvidenceDelta<TChanges> {
  readonly evidenceType: string;
  readonly baselineEvidenceHash: string;
  readonly currentEvidenceHash: string;
  readonly comparability: Comparability;
  readonly changes: TChanges;
}
