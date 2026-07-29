/**
 * UnderstandingAssembler — merges producer contributions into a
 * single immutable snapshot.
 *
 * The assembler has no logic. It takes partial results from every
 * registered producer and merges them into a complete
 * WorkspaceUnderstanding. If two producers contribute the same
 * field, the one with higher confidence wins.
 */

import type { WorkspaceObservation } from './observation';
import type { UnderstandingProducer } from './producer';
import type { WorkspaceUnderstanding } from './understanding';

export interface UnderstandingAssembler {
  assemble(
    observation: WorkspaceObservation,
    producers: readonly UnderstandingProducer[],
  ): Promise<WorkspaceUnderstanding>;
}
