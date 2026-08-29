/**
 * Confidence — derived from evidence quality, not assumed from the existence
 * of evidence (ADR-012 core invariant 5).
 */

export type ConfidenceLevel = 'low' | 'medium' | 'high';

export interface Confidence {
  readonly level: ConfidenceLevel;
  readonly reasons: string[];
}
