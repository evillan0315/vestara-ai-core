/**
 * APE-001 — performance comparator.
 *
 * Compares two immutable performance snapshots under ADR-012 comparability
 * rules. Incomparable evidence yields an indeterminate overall conclusion —
 * never a winner claim. Each dimension is compared metric-by-metric so "which
 * model is better" is transparent and auditable, not a weighted composite.
 */

import {
  type Comparability,
  type EvidenceComparator,
  type EvidenceDelta,
  hashJson,
} from '@vestara/verification-evidence';
import type { AgentPerformanceIdentity, AgentPerformanceSnapshot } from './performance-snapshot';
import { AGENT_PERFORMANCE_EVIDENCE_TYPE } from './performance-snapshot';
import type { AgentPerformanceResults, PerformanceDimension } from './performance-types';

export type MetricDirection = 'higher' | 'lower';

export interface PerformanceMetricComparison {
  readonly metric: string;
  readonly baselineValue: number;
  readonly currentValue: number;
  readonly better: 'baseline' | 'current' | 'tie' | 'incomparable';
}

export interface PerformanceDimensionResult {
  readonly dimension: PerformanceDimension;
  readonly comparable: boolean;
  readonly winner?: AgentPerformanceIdentity;
  readonly metrics: readonly PerformanceMetricComparison[];
  readonly reasons: readonly string[];
}

export interface PerformanceChanges {
  readonly dimensions: readonly PerformanceDimensionResult[];
}

export type AgentPerformanceComparison = EvidenceDelta<PerformanceChanges>;

interface DimensionMetric {
  readonly metric: string;
  readonly value: (results: AgentPerformanceResults) => number;
  readonly direction: MetricDirection;
}

const DIMENSION_METRICS: Readonly<Record<PerformanceDimension, readonly DimensionMetric[]>> = {
  compliance: [
    { metric: 'scope-adherence', value: (r) => r.compliance.scopeAdherence, direction: 'higher' },
    { metric: 'policy-compliance', value: (r) => r.compliance.policyCompliance, direction: 'higher' },
    { metric: 'workflow-discipline', value: (r) => r.compliance.workflowDiscipline, direction: 'higher' },
    {
      metric: 'artifact-completion',
      value: (r) =>
        r.compliance.requiredArtifactsTotal > 0
          ? r.compliance.requiredArtifactsCompleted / r.compliance.requiredArtifactsTotal
          : 0,
      direction: 'higher',
    },
    { metric: 'unauthorized-actions', value: (r) => r.compliance.unauthorizedActionAttempts, direction: 'lower' },
  ],
  effectiveness: [
    {
      metric: 'verification-outcome',
      value: (r) =>
        r.effectiveness.verificationOutcome === 'pass' ? 2 : r.effectiveness.verificationOutcome === 'fail' ? 1 : 0,
      direction: 'higher',
    },
    { metric: 'regressions', value: (r) => r.effectiveness.regressionsIntroduced, direction: 'lower' },
    { metric: 'review-findings', value: (r) => r.effectiveness.reviewFindings, direction: 'lower' },
    { metric: 'accepted-artifacts', value: (r) => r.effectiveness.acceptedArtifacts, direction: 'higher' },
    { metric: 'rejected-artifacts', value: (r) => r.effectiveness.rejectedArtifacts, direction: 'lower' },
    { metric: 'human-corrections', value: (r) => r.effectiveness.humanCorrections, direction: 'lower' },
  ],
  conversation: [
    { metric: 'material-progress-ratio', value: (r) => r.conversation.materialProgressRatio, direction: 'higher' },
    { metric: 'no-progress-ratio', value: (r) => r.conversation.noProgressRatio, direction: 'lower' },
    { metric: 'reasoning-turns', value: (r) => r.conversation.reasoningTurns, direction: 'lower' },
    { metric: 'execution-turns', value: (r) => r.conversation.executionTurns, direction: 'lower' },
    { metric: 'turns-per-artifact', value: (r) => r.conversation.turnsPerArtifact, direction: 'lower' },
  ],
  economic: [
    { metric: 'estimated-cost', value: (r) => r.economic.estimatedCost, direction: 'lower' },
    {
      metric: 'unnecessary-reasoning-cost',
      value: (r) => r.economic.unnecessaryReasoningCost ?? 0,
      direction: 'lower',
    },
  ],
  opportunity: [
    { metric: 'opportunities-discovered', value: (r) => r.opportunity.opportunitiesDiscovered, direction: 'higher' },
    { metric: 'opportunities-accepted', value: (r) => r.opportunity.opportunitiesAccepted, direction: 'higher' },
    { metric: 'duplicate-discoveries', value: (r) => r.opportunity.duplicateDiscoveries, direction: 'lower' },
    { metric: 'independent-observations', value: (r) => r.opportunity.independentObservations, direction: 'higher' },
  ],
};

const NON_EFFECTIVENESS_DIMENSIONS: readonly PerformanceDimension[] = [
  'compliance',
  'conversation',
  'economic',
  'opportunity',
];

/**
 * ADR-012 comparability. A role mismatch, workflow-scope mismatch, or
 * self-comparison is incomparable. Without a real verification conclusion on
 * both runs, the effectiveness dimension is incomparable (the rest may still be
 * partially comparable).
 */
export function evaluatePerformanceComparability(
  baseline: AgentPerformanceSnapshot,
  current: AgentPerformanceSnapshot,
): Comparability {
  const incomparableDimensions: PerformanceDimension[] = [];

  if (baseline.identity.role !== current.identity.role) {
    return incomparable(`roles differ: ${baseline.identity.role} vs ${current.identity.role}`);
  }
  if (baseline.execution.workflowScope !== current.execution.workflowScope) {
    return incomparable('workflows are not the same scope');
  }
  if (
    baseline.identity.modelId === current.identity.modelId &&
    baseline.identity.providerId === current.identity.providerId
  ) {
    return incomparable('comparison requires distinct models');
  }

  const reasons: string[] = [];
  const comparableDimensions: PerformanceDimension[] = [...NON_EFFECTIVENESS_DIMENSIONS];

  const bothConcluded = (results: AgentPerformanceResults): boolean => {
    const outcome = results.effectiveness.verificationOutcome;
    return outcome === 'pass' || outcome === 'fail';
  };
  if (bothConcluded(baseline.results) && bothConcluded(current.results)) {
    comparableDimensions.push('effectiveness');
  } else {
    incomparableDimensions.push('effectiveness');
    reasons.push('engineering effectiveness is not comparable without a verification conclusion on both runs');
  }

  if (incomparableDimensions.length === 0) {
    return { status: 'comparable', reasons, comparableDimensions, incomparableDimensions };
  }
  return { status: 'partially-comparable', reasons, comparableDimensions, incomparableDimensions };
}

/**
 * Pure, synchronous comparison of two performance snapshots.
 */
export function compareAgentPerformance(
  baseline: AgentPerformanceSnapshot,
  current: AgentPerformanceSnapshot,
): AgentPerformanceComparison {
  const comparability = evaluatePerformanceComparability(baseline, current);
  const dimensions = compareDimensions(baseline, current, comparability);
  return {
    evidenceType: AGENT_PERFORMANCE_EVIDENCE_TYPE,
    baselineEvidenceHash: baseline.contentHash,
    currentEvidenceHash: current.contentHash,
    comparability,
    changes: { dimensions },
  };
}

function compareDimensions(
  baseline: AgentPerformanceSnapshot,
  current: AgentPerformanceSnapshot,
  comparability: Comparability,
): readonly PerformanceDimensionResult[] {
  const comparable = new Set(comparability.comparableDimensions);
  return (Object.keys(DIMENSION_METRICS) as PerformanceDimension[]).map((dimension) => {
    if (!comparable.has(dimension)) {
      return {
        dimension,
        comparable: false,
        metrics: DIMENSION_METRICS[dimension].map((metric) => ({
          metric: metric.metric,
          baselineValue: metric.value(baseline.results),
          currentValue: metric.value(current.results),
          better: 'incomparable' as const,
        })),
        reasons: ['dimension is not comparable under ADR-012'],
      };
    }

    const metrics: PerformanceMetricComparison[] = DIMENSION_METRICS[dimension].map((metric) => {
      const baselineValue = metric.value(baseline.results);
      const currentValue = metric.value(current.results);
      const better = betterOf(baselineValue, currentValue, metric.direction);
      return { metric: metric.metric, baselineValue, currentValue, better };
    });

    const currentWins = metrics.filter((metric) => metric.better === 'current').length;
    const baselineWins = metrics.filter((metric) => metric.better === 'baseline').length;
    const winner =
      currentWins > baselineWins ? current.identity : baselineWins > currentWins ? baseline.identity : undefined;
    const reasons = [
      ...metrics
        .filter((metric) => metric.better !== 'tie')
        .map(
          (metric) =>
            `${metric.better === 'current' ? 'current' : 'baseline'} better on ${metric.metric} (${metric.baselineValue} → ${metric.currentValue})`,
        ),
    ];
    return { dimension, comparable: true, winner, metrics, reasons };
  });
}

function betterOf(baseline: number, current: number, direction: MetricDirection): 'baseline' | 'current' | 'tie' {
  if (direction === 'higher') return baseline > current ? 'baseline' : current > baseline ? 'current' : 'tie';
  return baseline < current ? 'baseline' : current < baseline ? 'current' : 'tie';
}

function incomparable(reason: string): Comparability {
  return {
    status: 'incomparable',
    reasons: [reason],
    comparableDimensions: [],
    incomparableDimensions: ['compliance', 'effectiveness', 'conversation', 'economic', 'opportunity'],
  };
}

/** VEF kernel contract adapter: an async comparator over performance snapshots. */
export class AgentPerformanceComparator implements EvidenceComparator<AgentPerformanceResults, PerformanceChanges> {
  async compare(
    baseline: AgentPerformanceSnapshot,
    current: AgentPerformanceSnapshot,
  ): Promise<AgentPerformanceComparison> {
    return compareAgentPerformance(baseline, current);
  }
}

/** Deterministic hash of a performance comparison (evidence identity). */
export function performanceComparisonHash(comparison: AgentPerformanceComparison): string {
  return hashJson(comparison);
}
