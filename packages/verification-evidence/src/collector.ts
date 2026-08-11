/**
 * Domain evidence collector contract (ADR-012 extension model).
 *
 * Domain adapters implement this contract to turn raw observations into an
 * immutable `EvidenceSnapshot`. The collector owns what the domain's evidence
 * means; the framework never interprets domain semantics.
 */

import type { EvidenceSnapshot } from './snapshot';

export interface EvidenceCollector<TInput, TSnapshot> {
  collect(input: TInput): Promise<EvidenceSnapshot<unknown, unknown, TSnapshot>>;
}

/** Convenience base for typed collectors. */
export type TypedEvidenceCollector<TInput, TIdentity, TExecution, TResult> = {
  collect(input: TInput): Promise<EvidenceSnapshot<TIdentity, TExecution, TResult>>;
};
