/**
 * APE-001 — performance evidence.
 *
 * The comparison plus an ADR-012-gated overall conclusion. Incomparable or
 * partially-comparable evidence yields an indeterminate overall conclusion —
 * never a winner claim. Per-dimension winners remain the transparent answer.
 */

import { type ConfidenceLevel, deriveConclusion, type VerificationConclusion } from '@vestara/verification-evidence';
import { type AgentPerformanceComparison, compareAgentPerformance, performanceComparisonHash } from './comparator';
import type { AgentPerformanceIdentity, AgentPerformanceSnapshot } from './performance-snapshot';
import { AGENT_PERFORMANCE_EVIDENCE_TYPE } from './performance-snapshot';

export interface PerformanceEvidence {
  readonly evidenceType: 'agent-performance-comparison';
  readonly baseline: AgentPerformanceSnapshot;
  readonly current: AgentPerformanceSnapshot;
  readonly comparison: AgentPerformanceComparison;
  readonly conclusion: VerificationConclusion;
  /** Majority winner across comparable dimensions; undefined when inconclusive. */
  readonly overallWinner?: AgentPerformanceIdentity;
  readonly evidenceRefs: readonly string[];
}

export function derivePerformanceEvidence(
  baseline: AgentPerformanceSnapshot,
  current: AgentPerformanceSnapshot,
): PerformanceEvidence {
  const comparison = compareAgentPerformance(baseline, current);
  const conclusion = deriveConclusion({
    comparabilityStatus: comparison.comparability.status,
    changesSummary: summarize(comparison),
    evidenceHashes: [baseline.contentHash, current.contentHash],
    deltaHash: performanceComparisonHash(comparison),
    confidence: confidenceFor(comparison),
  });
  return {
    evidenceType: 'agent-performance-comparison',
    baseline,
    current,
    comparison,
    conclusion,
    overallWinner: majorityWinner(comparison, baseline, current),
    evidenceRefs: [...baseline.execution.verificationEvidenceRefs, ...current.execution.verificationEvidenceRefs],
  };
}

function summarize(comparison: AgentPerformanceComparison): string[] {
  return comparison.changes.dimensions
    .filter((dimension) => dimension.comparable)
    .map((dimension) => {
      const winner = dimension.winner ? `${dimension.winner.role}:${dimension.winner.modelId}` : 'tie';
      return `${dimension.dimension}: ${winner}`;
    });
}

function confidenceFor(comparison: AgentPerformanceComparison): ConfidenceLevel {
  switch (comparison.comparability.status) {
    case 'comparable':
      return 'high';
    case 'partially-comparable':
      return 'medium';
    case 'incomparable':
      return 'low';
  }
}

function majorityWinner(
  comparison: AgentPerformanceComparison,
  baseline: AgentPerformanceSnapshot,
  current: AgentPerformanceSnapshot,
): AgentPerformanceIdentity | undefined {
  if (comparison.comparability.status === 'incomparable') return undefined;
  const winners = comparison.changes.dimensions.filter((dimension) => dimension.winner !== undefined);
  const currentWins = winners.filter((dimension) => dimension.winner?.modelId === current.identity.modelId).length;
  const baselineWins = winners.filter((dimension) => dimension.winner?.modelId === baseline.identity.modelId).length;
  if (currentWins > baselineWins) return current.identity;
  if (baselineWins > currentWins) return baseline.identity;
  return undefined;
}

export { AGENT_PERFORMANCE_EVIDENCE_TYPE };
