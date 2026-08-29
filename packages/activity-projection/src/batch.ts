import type { ActivityRecord } from './contracts';

/**
 * A contiguous span of activity history. Grouping history into batches (instead
 * of only individual records) makes replay, export, evidence bundles, session
 * archives, and timeline diffs natural consumers of the same history API.
 */
export interface ActivityBatch {
  /** Sequence of the first record in the batch, or 0 for an empty batch. */
  readonly firstSequence: number;
  /** Sequence of the last record in the batch, or 0 for an empty batch. */
  readonly lastSequence: number;
  readonly records: readonly ActivityRecord[];
}

/**
 * Groups already-ordered records into a batch, computing the sequence span.
 * The input order is preserved unchanged; an empty input yields an empty batch
 * with a 0/0 span.
 */
export function toActivityBatch(records: readonly ActivityRecord[]): ActivityBatch {
  const first = records[0];
  const last = records.at(-1);
  return {
    firstSequence: first?.sequence ?? 0,
    lastSequence: last?.sequence ?? 0,
    records,
  };
}
