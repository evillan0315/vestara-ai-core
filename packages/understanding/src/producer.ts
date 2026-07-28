/**
 * UnderstandingProducer — one semantic dimension, one producer.
 *
 * Every producer owns exactly one field of WorkspaceUnderstanding.
 * They never mutate — they contribute partial results that the
 * UnderstandingAssembler merges into the final snapshot.
 *
 * Each producer reports:
 *   - id: unique identifier for metrics and traceability
 *   - produce(): partial understanding fields
 *   - confidence: how certain the producer is about its output
 *
 * Producers are independently evaluable. The evaluation harness
 * can report accuracy per producer, making engineering priorities
 * evidence-driven.
 */

import type { WorkspaceObservation } from './observation';
import type { WorkspaceUnderstanding } from './understanding';

type DeepPartial<T> = T extends object
  ? { [P in keyof T]?: DeepPartial<T[P]> }
  : T;

export interface ProducerResult {
  readonly fields: DeepPartial<WorkspaceUnderstanding>;
  readonly confidence: number;
  readonly evidence: readonly string[];
}

export interface UnderstandingProducer {
  readonly id: string;

  produce(observation: WorkspaceObservation): Promise<ProducerResult>;
}
