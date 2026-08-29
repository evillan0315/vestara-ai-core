/**
 * Evidence comparator contract (ADR-012 extension model).
 *
 * A domain comparator turns a baseline and current snapshot into an
 * `EvidenceDelta`. The framework guarantees comparability is evaluated before
 * conclusions; the domain comparator defines what a change means for its
 * subsystem.
 */

import type { EvidenceDelta } from './delta';
import type { EvidenceSnapshot } from './snapshot';

export interface EvidenceComparator<TSnapshot, TChanges> {
  compare(
    baseline: EvidenceSnapshot<unknown, unknown, TSnapshot>,
    current: EvidenceSnapshot<unknown, unknown, TSnapshot>,
  ): Promise<EvidenceDelta<TChanges>>;
}
