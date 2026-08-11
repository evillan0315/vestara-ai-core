import { describe, expect, it } from 'vitest';
import {
  AgentPerformanceComparator,
  type AgentPerformanceResults,
  type AgentPerformanceSnapshot,
  type AgentRole,
  compareAgentPerformance,
  derivePerformanceEvidence,
  evaluatePerformanceComparability,
  performanceSnapshot,
} from '../src/index';

const CAPTURED_AT = '2026-08-06T00:00:00.000Z';

const BASE_RESULTS: AgentPerformanceResults = {
  compliance: {
    scopeAdherence: 1,
    policyCompliance: 1,
    workflowDiscipline: 1,
    unauthorizedActionAttempts: 0,
    requiredArtifactsCompleted: 3,
    requiredArtifactsTotal: 3,
  },
  effectiveness: {
    verificationOutcome: 'pass',
    regressionsIntroduced: 0,
    reviewFindings: 1,
    acceptedArtifacts: 3,
    rejectedArtifacts: 0,
    humanCorrections: 0,
  },
  conversation: {
    reasoningTurns: 4,
    executionTurns: 2,
    materialProgressRatio: 0.8,
    noProgressRatio: 0.1,
    turnsPerArtifact: 2,
  },
  economic: { estimatedCost: 1.2, costPerVerifiedArtifact: 0.4, unnecessaryReasoningCost: 0.1 },
  opportunity: {
    opportunitiesDiscovered: 2,
    opportunitiesAccepted: 1,
    duplicateDiscoveries: 0,
    independentObservations: 1,
  },
};

function snapshot(
  identity: { role: AgentRole; modelId: string; providerId?: string },
  results: AgentPerformanceResults,
  scope = 'scope-1',
): AgentPerformanceSnapshot {
  return performanceSnapshot({
    identity: {
      role: identity.role,
      providerId: identity.providerId ?? 'provider-a',
      modelId: identity.modelId,
    },
    execution: {
      workflowId: 'wf-1',
      workflowScope: scope,
      verificationEvidenceRefs: ['ver-1'],
      observationHash: 'obs-1',
    },
    results,
    capturedAt: CAPTURED_AT,
  });
}

describe('performance snapshot', () => {
  it('is deterministic for identical inputs', () => {
    const a = snapshot({ role: 'architect', modelId: 'model-a' }, BASE_RESULTS);
    const b = snapshot({ role: 'architect', modelId: 'model-a' }, BASE_RESULTS);
    expect(a.contentHash).toBe(b.contentHash);
    expect(a.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes the content hash when results change', () => {
    const a = snapshot({ role: 'architect', modelId: 'model-a' }, BASE_RESULTS);
    const b = snapshot(
      { role: 'architect', modelId: 'model-a' },
      { ...BASE_RESULTS, economic: { ...BASE_RESULTS.economic, estimatedCost: 0.8 } },
    );
    expect(a.contentHash).not.toBe(b.contentHash);
  });
});

describe('comparability (ADR-012)', () => {
  it('is incomparable for a role mismatch', () => {
    const baseline = snapshot({ role: 'architect', modelId: 'model-a' }, BASE_RESULTS);
    const current = snapshot({ role: 'engineer', modelId: 'model-b' }, BASE_RESULTS);
    const comparability = evaluatePerformanceComparability(baseline, current);
    expect(comparability.status).toBe('incomparable');
    expect(comparability.comparableDimensions).toEqual([]);
  });

  it('is incomparable for a workflow-scope mismatch', () => {
    const baseline = snapshot({ role: 'architect', modelId: 'model-a' }, BASE_RESULTS, 'scope-1');
    const current = snapshot({ role: 'architect', modelId: 'model-b' }, BASE_RESULTS, 'scope-2');
    expect(evaluatePerformanceComparability(baseline, current).status).toBe('incomparable');
  });

  it('is incomparable for a self-comparison', () => {
    const baseline = snapshot({ role: 'architect', modelId: 'model-a' }, BASE_RESULTS);
    const current = snapshot({ role: 'architect', modelId: 'model-a' }, BASE_RESULTS);
    expect(evaluatePerformanceComparability(baseline, current).status).toBe('incomparable');
  });

  it('is partially-comparable when a verification conclusion is missing', () => {
    const baseline = snapshot({ role: 'architect', modelId: 'model-a' }, BASE_RESULTS);
    const current = snapshot(
      { role: 'architect', modelId: 'model-b' },
      { ...BASE_RESULTS, effectiveness: { ...BASE_RESULTS.effectiveness, verificationOutcome: 'not-run' } },
    );
    const comparability = evaluatePerformanceComparability(baseline, current);
    expect(comparability.status).toBe('partially-comparable');
    expect(comparability.incomparableDimensions).toContain('effectiveness');
    expect(comparability.comparableDimensions).toContain('compliance');
  });

  it('is comparable when both runs have verification conclusions', () => {
    const baseline = snapshot({ role: 'architect', modelId: 'model-a' }, BASE_RESULTS);
    const current = snapshot(
      { role: 'architect', modelId: 'model-b' },
      { ...BASE_RESULTS, economic: { ...BASE_RESULTS.economic, estimatedCost: 0.8 } },
    );
    expect(evaluatePerformanceComparability(baseline, current).status).toBe('comparable');
  });
});

describe('comparator', () => {
  it('picks the current model per dimension on metric-by-metric evidence', () => {
    const baseline = snapshot({ role: 'architect', modelId: 'model-a' }, BASE_RESULTS);
    const current = snapshot(
      { role: 'architect', modelId: 'model-b' },
      {
        ...BASE_RESULTS,
        compliance: { ...BASE_RESULTS.compliance, scopeAdherence: 0.6 },
        economic: { ...BASE_RESULTS.economic, estimatedCost: 0.8, unnecessaryReasoningCost: 0.02 },
      },
    );

    const comparison = compareAgentPerformance(baseline, current);
    const economic = comparison.changes.dimensions.find((dimension) => dimension.dimension === 'economic');
    const compliance = comparison.changes.dimensions.find((dimension) => dimension.dimension === 'compliance');
    expect(economic?.winner?.modelId).toBe('model-b'); // lower cost wins
    expect(compliance?.winner?.modelId).toBe('model-a'); // higher adherence wins
    expect(economic?.metrics.find((metric) => metric.metric === 'estimated-cost')?.better).toBe('current');
  });

  it('prefers a passing verification outcome', () => {
    const baseline = snapshot(
      { role: 'engineer', modelId: 'model-a' },
      {
        ...BASE_RESULTS,
        effectiveness: { ...BASE_RESULTS.effectiveness, verificationOutcome: 'fail', regressionsIntroduced: 2 },
      },
    );
    const current = snapshot({ role: 'engineer', modelId: 'model-b' }, BASE_RESULTS);
    const comparison = compareAgentPerformance(baseline, current);
    const effectiveness = comparison.changes.dimensions.find((dimension) => dimension.dimension === 'effectiveness');
    expect(effectiveness?.winner?.modelId).toBe('model-b');
  });

  it('never emits a winner when evidence is incomparable (ADR-012)', () => {
    const baseline = snapshot({ role: 'architect', modelId: 'model-a' }, BASE_RESULTS);
    const current = snapshot({ role: 'engineer', modelId: 'model-b' }, BASE_RESULTS);
    const evidence = derivePerformanceEvidence(baseline, current);
    expect(evidence.conclusion.status).toBe('indeterminate');
    expect(evidence.overallWinner).toBeUndefined();
  });

  it('produces a majority overall winner for a comparable comparison', () => {
    const baseline = snapshot({ role: 'architect', modelId: 'model-a' }, BASE_RESULTS);
    const current = snapshot(
      { role: 'architect', modelId: 'model-b' },
      {
        ...BASE_RESULTS,
        compliance: { ...BASE_RESULTS.compliance, scopeAdherence: 0.4, policyCompliance: 0.5 },
        economic: { ...BASE_RESULTS.economic, estimatedCost: 0.6, unnecessaryReasoningCost: 0.01 },
        conversation: { ...BASE_RESULTS.conversation, reasoningTurns: 2, materialProgressRatio: 0.9 },
      },
    );
    const evidence = derivePerformanceEvidence(baseline, current);
    expect(evidence.conclusion.status).toBe('pass'); // comparable → valid conclusion
    expect(evidence.overallWinner?.modelId).toBe('model-b');
  });

  it('implements the VEF comparator contract (async delta)', async () => {
    const baseline = snapshot({ role: 'architect', modelId: 'model-a' }, BASE_RESULTS);
    const current = snapshot(
      { role: 'architect', modelId: 'model-b' },
      { ...BASE_RESULTS, economic: { ...BASE_RESULTS.economic, estimatedCost: 0.8 } },
    );
    const comparator = new AgentPerformanceComparator();
    const delta = await comparator.compare(baseline, current);
    expect(delta.evidenceType).toBe('agent-performance');
    expect(delta.baselineEvidenceHash).toBe(baseline.contentHash);
    expect(delta.currentEvidenceHash).toBe(current.contentHash);
    expect(delta.comparability.status).toBe('comparable');
    expect(delta.changes.dimensions.length).toBe(5);
  });
});
