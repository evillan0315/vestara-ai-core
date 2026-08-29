/**
 * PCS-026 §8 — derived confidence scoring.
 *
 * Confidence is a product over six dimensions (coverage, success, integrity,
 * independence, replayability, freshness). Every factor carries a rationale;
 * `limitations` surface what was not captured. A verifier can never return a
 * score without exposing why.
 */

import type {
  ConfidenceDimension,
  ConfidenceFactor,
  ConfidenceLevel,
  VerificationCheckResult,
  VerificationConfidence,
} from './types';

export interface ConfidenceInput {
  readonly checks: readonly VerificationCheckResult[];
  readonly evidenceCount: number;
  readonly distinctEvidenceRefs: number;
  readonly replayableCount: number;
  readonly createdAt: string;
  readonly profileChecksExpected?: number;
  readonly freshnessWindowHours?: number;
}

export interface ConfidenceEngineOptions {
  readonly freshnessWindowHours?: number;
}

const DEFAULT_FRESHNESS_WINDOW_HOURS = 24;

export class ConfidenceEngine {
  private readonly freshnessWindowHours: number;

  constructor(options: ConfidenceEngineOptions = {}) {
    this.freshnessWindowHours = options.freshnessWindowHours ?? DEFAULT_FRESHNESS_WINDOW_HOURS;
  }

  compute(input: ConfidenceInput): VerificationConfidence {
    const factors = this.factors(input);
    const score = factors.reduce((product, factor) => product * factor.score, 1);
    return {
      score: round3(score),
      level: levelFor(score),
      factors,
      limitations: this.limitations(input),
    };
  }

  private factors(input: ConfidenceInput): ConfidenceFactor[] {
    const total = input.checks.length;
    const ran = input.checks.filter((check) => check.status !== 'skipped').length;
    const passed = input.checks.filter((check) => check.status === 'passed').length;
    const expected = Math.max(total, input.profileChecksExpected ?? total);

    return [
      factor('profile-coverage', ran / Math.max(1, expected), `ran ${ran}/${expected} profile checks`),
      factor('check-success', total > 0 ? passed / Math.max(1, ran) : 0, `${passed}/${ran} run checks passed`),
      factor(
        'evidence-integrity',
        total > 0 ? input.checks.filter((check) => check.evidenceRefs.length > 0).length / total : 0,
        `${input.checks.filter((check) => check.evidenceRefs.length > 0).length}/${total} checks backed by evidence`,
      ),
      factor(
        'evidence-independence',
        total > 0 ? input.distinctEvidenceRefs / Math.max(1, total) : 0,
        `${input.distinctEvidenceRefs} distinct content-addressed evidence items`,
      ),
      factor(
        'replayability',
        input.evidenceCount > 0 ? input.replayableCount / input.evidenceCount : 0,
        `${input.replayableCount}/${input.evidenceCount} evidence items replayable`,
      ),
      factor(
        'freshness',
        freshnessScore(input.createdAt, this.freshnessWindowHours),
        `within ${this.freshnessWindowHours}h freshness window`,
      ),
    ];
  }

  private limitations(input: ConfidenceInput): string[] {
    const limitations: string[] = [];
    if (input.checks.length === 0) limitations.push('no verification checks ran');
    if (input.checks.every((check) => check.status === 'skipped')) limitations.push('all checks were skipped');
    if (input.evidenceCount === 0) limitations.push('no content-addressed evidence collected');
    if (input.checks.some((check) => check.evidenceRefs.length === 0)) {
      limitations.push('some checks have no backing evidence');
    }
    return limitations;
  }
}

function factor(dimension: ConfidenceDimension, score: number, rationale: string): ConfidenceFactor {
  return { dimension, score: round3(clamp01(score)), weight: 1, rationale };
}

function freshnessScore(createdAt: string, windowHours: number): number {
  const ageMs = Math.max(0, Date.now() - new Date(createdAt).getTime());
  const windowMs = windowHours * 60 * 60 * 1000;
  return windowMs > 0 ? Math.max(0, 1 - ageMs / windowMs) : 0;
}

export function levelFor(score: number): ConfidenceLevel {
  if (score >= 0.9) return 'very-high';
  if (score >= 0.75) return 'high';
  if (score >= 0.5) return 'moderate';
  return 'low';
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
