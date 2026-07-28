/**
 * Evaluation types — the measurement framework for understanding quality.
 *
 * Every assertion evaluation produces a result with:
 *   status: pass | fail | error
 *   confidence: how certain the engine was
 *   observationSources: provenance trace back to observation fields
 *
 * Metrics aggregate across entries.
 */

import type { Corpus, CorpusEntry } from './corpus';

// ─── Per-Assertion Result ────────────────────────────────────

export type AssertionStatus = 'pass' | 'fail' | 'error' | 'missing';

export interface AssertionResult {
  readonly field: string;
  readonly expected: string;
  readonly actual: string | null;
  readonly status: AssertionStatus;
  readonly confidence: number;
  readonly observationSources: readonly string[];
  readonly detail: string | null;
}

export interface EntryResult {
  readonly entry: CorpusEntry;
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly errors: number;
  readonly missing: number;
  readonly assertions: readonly AssertionResult[];
  readonly traceabilityScore: number;
}

// ─── Entry Metrics ──────────────────────────────────────────

export interface EntryMetrics {
  readonly accuracy: number;
  readonly coverage: number;
  readonly avgConfidence: number;
  readonly traceability: number;
}

// ─── Aggregate Metrics ──────────────────────────────────────

export interface ProducerMetric {
  readonly producer: string;
  readonly accuracy: number;
  readonly avgConfidence: number;
  readonly assertionCount: number;
}

export interface EvaluationReport {
  readonly timestamp: string;
  readonly totalEntries: number;
  readonly totalAssertions: number;
  readonly passed: number;
  readonly failed: number;
  readonly errors: number;
  readonly missing: number;
  readonly metrics: {
    readonly overallAccuracy: number;
    readonly overallCoverage: number;
    readonly avgConfidence: number;
    readonly traceability: number;
    readonly regressionCount: number;
    readonly producerMetrics: readonly ProducerMetric[];
  };
  readonly entries: readonly EntryResult[];
  readonly regressions: readonly AssertionResult[];
}

export interface EvaluationHarness {
  /** Run the full corpus and return a report. */
  evaluate(corpus: Corpus, previousReport?: EvaluationReport): Promise<EvaluationReport>;
}
