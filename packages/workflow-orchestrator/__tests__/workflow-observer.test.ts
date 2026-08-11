import { describe, expect, it } from 'vitest';
import {
  assessConvergence,
  computeProgressDelta,
  countContradictions,
  DEFAULT_WORKFLOW_OBSERVATION_POLICY,
  DefaultWorkflowObserver,
  type ObservedWorkflowState,
  projectWorkflowState,
  recommendationChanged,
  snapshotHash,
  type WorkflowObservation,
  type WorkflowObservationSnapshot,
} from '../src/observation';

const POLICY = DEFAULT_WORKFLOW_OBSERVATION_POLICY;

function snapshot(overrides: Partial<WorkflowObservationSnapshot> = {}): WorkflowObservationSnapshot {
  return {
    workflowId: 'workflow-123',
    capturedAt: '2026-08-05T00:00:00.000Z',
    objective: { id: 'obj-1', description: 'Create ADR-012', requiredOutputs: [{ kind: 'adr', name: 'ADR-012' }] },
    tasks: [],
    agents: [],
    artifacts: [],
    decisions: [],
    evidence: [],
    blockers: [],
    approvals: [],
    verification: { status: 'not-run' },
    repository: { changedFiles: [], changedArtifactHashes: [], dirty: false },
    conversation: { turnCount: 1, latestTurnRole: 'architect' },
    ...overrides,
  };
}

function adrArtifact(hash = 'abc123') {
  return {
    id: 'art-adr-1',
    kind: 'adr',
    name: 'ADR-012',
    version: 1,
    contentHash: hash,
    createdAt: '2026-08-05T00:00:01.000Z',
  };
}

function stableAdrDecision() {
  return { id: 'dec-adr', title: 'ADR-012 decision', status: 'decided' as const };
}

// ─── State projector ────────────────────────────────────────────

describe('state projector', () => {
  it('projects pending when required inputs (tasks) are missing', () => {
    const current = snapshot({ tasks: [{ id: 't1', summary: 'dep', status: 'pending' }] });
    expect(projectWorkflowState(current, POLICY).state).toBe('pending');
  });

  it('projects ready when inputs exist and the required output is missing', () => {
    const current = snapshot({ decisions: [stableAdrDecision()] });
    const projection = projectWorkflowState(current, POLICY);
    expect(projection.state).toBe('ready');
    expect(projection.missingOutputs).toEqual([{ kind: 'adr', name: 'ADR-012' }]);
  });

  it('projects in-progress while an agent or task is active', () => {
    const active = snapshot({ tasks: [{ id: 't1', summary: 'write', status: 'in-progress' }] });
    expect(projectWorkflowState(active, POLICY).state).toBe('in-progress');
  });

  it('projects awaiting-review after an artifact exists without review', () => {
    const current = snapshot({ artifacts: [adrArtifact()], decisions: [] });
    expect(projectWorkflowState(current, POLICY).state).toBe('awaiting-review');
  });

  it('projects awaiting-verification after review, before verification', () => {
    const current = snapshot({
      artifacts: [adrArtifact()],
      approvals: [{ id: 'ap-1', scope: 'review', status: 'granted' }],
    });
    expect(projectWorkflowState(current, POLICY).state).toBe('awaiting-verification');
  });

  it('projects completed only with outputs, terminal tasks, review, and passing verification', () => {
    const current = snapshot({
      artifacts: [adrArtifact()],
      approvals: [{ id: 'ap-1', scope: 'review', status: 'granted' }],
      verification: { status: 'pass', conclusionRef: 'ver-1' },
      tasks: [{ id: 't1', summary: 'write', status: 'completed' }],
    });
    expect(projectWorkflowState(current, POLICY).state).toBe('completed');
  });

  it('never completes when verification is indeterminate (ADR-012)', () => {
    const current = snapshot({
      artifacts: [adrArtifact()],
      approvals: [{ id: 'ap-1', scope: 'review', status: 'granted' }],
      verification: { status: 'indeterminate' },
      tasks: [{ id: 't1', summary: 'write', status: 'completed' }],
    });
    expect(projectWorkflowState(current, POLICY).state).toBe('indeterminate');
  });

  it('projects blocked when an unresolved blocker exists', () => {
    const current = snapshot({ blockers: [{ id: 'b1', summary: 'missing credentials', status: 'blocking' }] });
    expect(projectWorkflowState(current, POLICY).state).toBe('blocked');
  });

  it('projects indeterminate when evidence is contradictory', () => {
    const current = snapshot({ decisions: [{ ...stableAdrDecision(), status: 'contradicted' }] });
    expect(projectWorkflowState(current, POLICY).state).toBe('indeterminate');
  });

  it('projects indeterminate when evidence is incomplete (no declared outputs)', () => {
    const current = snapshot({ objective: { id: 'obj-1', description: 'x', requiredOutputs: [] } });
    expect(projectWorkflowState(current, POLICY).state).toBe('indeterminate');
  });
});

// ─── Progress delta ─────────────────────────────────────────────

describe('progress delta', () => {
  it('counts artifact creation as material progress', () => {
    const previous = snapshot({});
    const current = snapshot({ artifacts: [adrArtifact()] });
    const progress = computeProgressDelta(previous, current);
    expect(progress.artifactChanges).toBe(1);
    expect(progress.materialProgress).toBe(true);
    expect(progress.materialDimensions).toContain('artifact');
  });

  it('counts repository mutation as material progress', () => {
    const previous = snapshot({});
    const current = snapshot({
      repository: { changedFiles: ['a.md'], changedArtifactHashes: ['hash-1'], dirty: true },
    });
    expect(computeProgressDelta(previous, current).repositoryChanges).toBe(1);
  });

  it('counts a new decision as material progress', () => {
    const previous = snapshot({ decisions: [] });
    const current = snapshot({ decisions: [stableAdrDecision()] });
    expect(computeProgressDelta(previous, current).decisionChanges).toBe(1);
  });

  it('counts a verification change as material progress', () => {
    const previous = snapshot({ verification: { status: 'not-run' } });
    const current = snapshot({ verification: { status: 'pass', conclusionRef: 'ver-1' } });
    expect(computeProgressDelta(previous, current).verificationChanges).toBe(1);
  });

  it('treats an acknowledgement-only turn as no progress', () => {
    const previous = snapshot({
      decisions: [stableAdrDecision()],
      conversation: { turnCount: 1, latestTurnRole: 'architect' },
    });
    const current = snapshot({
      decisions: [stableAdrDecision()],
      conversation: { turnCount: 2, latestTurnRole: 'reviewer' },
    });
    const progress = computeProgressDelta(previous, current);
    expect(progress).toMatchObject({
      artifactChanges: 0,
      decisionChanges: 0,
      evidenceChanges: 0,
      materialProgress: false,
    });
  });

  it('ignores token growth without domain changes', () => {
    const previous = snapshot({ decisions: [stableAdrDecision()] });
    const current = snapshot({
      decisions: [stableAdrDecision()],
      conversation: { turnCount: 3, cumulativeOutputTokens: 10_000 },
    });
    expect(computeProgressDelta(previous, current).materialProgress).toBe(false);
  });

  it('treats an identical artifact content hash as no progress', () => {
    const previous = snapshot({ artifacts: [adrArtifact('hash-x')] });
    const current = snapshot({ artifacts: [adrArtifact('hash-x')] });
    expect(computeProgressDelta(previous, current).artifactChanges).toBe(0);
  });

  it('treats a changed artifact content hash as progress', () => {
    const previous = snapshot({ artifacts: [adrArtifact('hash-x')] });
    const current = snapshot({ artifacts: [adrArtifact('hash-y')] });
    expect(computeProgressDelta(previous, current).artifactChanges).toBe(1);
  });
});

// ─── Convergence detector ───────────────────────────────────────

describe('convergence detector', () => {
  function assess(
    previous: WorkflowObservationSnapshot | undefined,
    current: WorkflowObservationSnapshot,
    prevAssessment?: Parameters<typeof assessConvergence>[0]['previousAssessment'],
  ) {
    const progress = computeProgressDelta(previous, current);
    return assessConvergence({
      previous,
      previousAssessment: prevAssessment,
      current,
      progress,
      policy: POLICY,
      missingOutputs: current.objective.requiredOutputs.filter(
        (required) =>
          !current.artifacts.some((artifact) => artifact.kind === required.kind && artifact.name === required.name),
      ),
    });
  }

  it('reports progressing on a productive turn', () => {
    const previous = snapshot({});
    const current = snapshot({ artifacts: [adrArtifact()] });
    expect(assess(previous, current).status).toBe('progressing');
  });

  it('reports stable for stable decisions plus an acknowledgement', () => {
    const previous = snapshot({ decisions: [stableAdrDecision()] });
    const current = snapshot({
      decisions: [stableAdrDecision()],
      conversation: { turnCount: 2, latestTurnRole: 'reviewer' },
    });
    const result = assess(previous, current);
    expect(result.status).toBe('stable');
    expect(result.consecutiveNoProgressTurns).toBe(1);
    expect(result.stableDecisionCount).toBe(1);
  });

  it('reports stagnant on repeated no-progress turns beyond the threshold', () => {
    const turn1 = snapshot({
      decisions: [stableAdrDecision()],
      conversation: { turnCount: 1, latestTurnRole: 'architect' },
    });
    const turn2 = snapshot({
      decisions: [stableAdrDecision()],
      conversation: { turnCount: 2, latestTurnRole: 'reviewer' },
    });
    const prior = assess(turn1, turn2);
    expect(prior.status).toBe('stable');
    const turn3 = snapshot({
      decisions: [stableAdrDecision()],
      conversation: { turnCount: 3, latestTurnRole: 'reviewer' },
    });
    const next = assess(turn2, turn3, prior);
    expect(next.consecutiveNoProgressTurns).toBe(2);
    expect(next.status).toBe('stagnant');
  });

  it('prevents stable classification when a contradiction remains', () => {
    const previous = snapshot({ decisions: [stableAdrDecision()] });
    const current = snapshot({ decisions: [{ ...stableAdrDecision(), status: 'contradicted' }] });
    const result = assess(previous, current);
    expect(result.status).not.toBe('stable');
    expect(result.unresolvedContradictions).toBe(1);
  });

  it('resets the no-progress counter on task progress', () => {
    const turn1 = snapshot({
      decisions: [stableAdrDecision()],
      conversation: { turnCount: 1, latestTurnRole: 'architect' },
    });
    const turn2 = snapshot({
      decisions: [stableAdrDecision()],
      conversation: { turnCount: 2, latestTurnRole: 'reviewer' },
    });
    const baseline = assess(turn1, turn2);
    expect(baseline.consecutiveNoProgressTurns).toBe(1);
    const current = snapshot({
      decisions: [stableAdrDecision()],
      artifacts: [adrArtifact('hash-2')],
      conversation: { turnCount: 3, latestTurnRole: 'reviewer' },
    });
    const result = assess(turn2, current, baseline);
    expect(result.consecutiveNoProgressTurns).toBe(0);
    expect(result.status).toBe('progressing');
  });
});

// ─── Observer ───────────────────────────────────────────────────

describe('DefaultWorkflowObserver', () => {
  const observer = new DefaultWorkflowObserver();

  function observe(
    previous: WorkflowObservationSnapshot | undefined,
    current: WorkflowObservationSnapshot,
    options: { policy?: typeof POLICY; previousAssessment?: unknown } = {},
  ): WorkflowObservation {
    return observer.observe({
      workflowId: current.workflowId,
      previous,
      previousAssessment: options.previousAssessment as never,
      current,
      policy: options.policy ?? POLICY,
    });
  }

  it('is deterministic and replayable for identical inputs', () => {
    const previous = snapshot({ decisions: [stableAdrDecision()] });
    const current = snapshot({
      decisions: [stableAdrDecision()],
      conversation: { turnCount: 2, latestTurnRole: 'reviewer' },
    });
    const first = JSON.stringify(observe(previous, current));
    const second = JSON.stringify(observe(previous, current));
    expect(first).toBe(second);
  });

  it('performs zero provider calls', () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error('observer must not call a provider');
    }) as typeof fetch;
    try {
      const result = observe(undefined, snapshot({ artifacts: [adrArtifact()] }));
      expect(result.currentState).toBe('awaiting-review');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('never mutates the input snapshot', () => {
    const current = snapshot({ artifacts: [adrArtifact()] });
    const before = JSON.stringify(current);
    observe(undefined, current);
    expect(JSON.stringify(current)).toBe(before);
  });

  it('matches the ADR acceptance example', () => {
    const previous = snapshot({
      decisions: [stableAdrDecision()],
      conversation: { turnCount: 1, latestTurnRole: 'architect' },
    });
    const current = snapshot({
      decisions: [stableAdrDecision()],
      conversation: { turnCount: 2, latestTurnRole: 'reviewer' },
    });
    const observation = observe(previous, current);
    expect(observation.currentState).toBe('ready');
    expect(observation.recommendedState).toBe('ready');
    expect(observation.recommendedAction).toBe('request-artifact');
    expect(observation.shouldContinueConversation).toBe(false);
    expect(observation.progress).toMatchObject({
      decisionChanges: 0,
      artifactChanges: 0,
      evidenceChanges: 0,
      materialProgress: false,
    });
    expect(observation.convergence).toMatchObject({
      status: 'stable',
      consecutiveNoProgressTurns: 1,
      unresolvedContradictions: 0,
    });
    expect(observation.missingOutputs).toEqual([{ kind: 'adr', name: 'ADR-012' }]);
    expect(observation.confidence).toBe('high');
  });

  it('routes implementation completion to verification, not discussion', () => {
    const previous = snapshot({
      artifacts: [adrArtifact('hash-1')],
      approvals: [{ id: 'ap-1', scope: 'review', status: 'granted' }],
    });
    const current = snapshot({
      artifacts: [adrArtifact('hash-2')],
      approvals: [{ id: 'ap-1', scope: 'review', status: 'granted' }],
    });
    const observation = observe(previous, current);
    expect(observation.recommendedAction).toBe('request-verification');
    expect(observation.recommendedState).toBe('awaiting-verification');
    expect(observation.shouldContinueConversation).toBe(false);
  });

  it('never recommends completion for indeterminate verification', () => {
    const current = snapshot({
      artifacts: [adrArtifact()],
      approvals: [{ id: 'ap-1', scope: 'review', status: 'granted' }],
      verification: { status: 'indeterminate' },
      tasks: [{ id: 't1', summary: 'write', status: 'completed' }],
    });
    const observation = observe(undefined, current);
    expect(observation.recommendedAction).toBe('escalate');
    expect(observation.recommendedState).toBe('indeterminate');
    expect(observation.recommendedAction).not.toBe('complete');
  });

  it('recommends pause when the cost budget is exceeded', () => {
    const current = snapshot({
      decisions: [stableAdrDecision()],
      conversation: { turnCount: 4, estimatedCost: 12 },
    });
    const observation = observe(
      snapshot({ decisions: [stableAdrDecision()], conversation: { turnCount: 3, estimatedCost: 10 } }),
      current,
      { policy: { ...POLICY, maxEstimatedCost: 10 } },
    );
    expect(observation.cost.budgetStatus).toBe('exceeded');
    expect(observation.recommendedAction).toBe('pause-conversation');
    expect(observation.shouldContinueConversation).toBe(false);
  });

  it('continues conversation when a decision is unresolved', () => {
    const previous = snapshot({ decisions: [] });
    const current = snapshot({ decisions: [{ id: 'dec-adr', title: 'ADR-012 decision', status: 'proposed' }] });
    const observation = observe(previous, current);
    expect(observation.progress.decisionChanges).toBeGreaterThan(0);
    expect(observation.shouldContinueConversation).toBe(true);
  });

  it('reports a stable snapshot hash', () => {
    const current = snapshot({ decisions: [stableAdrDecision()] });
    expect(snapshotHash(current)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('carries evidence references', () => {
    const current = snapshot({
      evidence: [{ ref: 'ev-1', kind: 'review' }],
      verification: { status: 'pass', conclusionRef: 'ver-1' },
    });
    const observation = observe(undefined, current);
    expect(observation.evidenceRefs).toContain('ev-1');
    expect(observation.evidenceRefs).toContain('ver-1');
  });
});

// ─── Event dedup ────────────────────────────────────────────────

describe('recommendationChanged', () => {
  function observation(patch: Partial<WorkflowObservation>): WorkflowObservation {
    return {
      workflowId: 'w1',
      observedAt: '2026-08-05T00:00:00.000Z',
      currentState: 'ready',
      recommendedState: 'ready',
      recommendedAction: 'request-artifact',
      progress: {
        artifactChanges: 0,
        repositoryChanges: 0,
        decisionChanges: 0,
        evidenceChanges: 0,
        blockerChanges: 0,
        approvalChanges: 0,
        taskStateChanges: 0,
        verificationChanges: 0,
        materialProgress: false,
        materialDimensions: [],
      },
      convergence: {
        status: 'stable',
        consecutiveNoProgressTurns: 1,
        stableDecisionCount: 1,
        unresolvedContradictions: 0,
        reasonCodes: ['architecture-stable'],
      },
      cost: { reasoningTurns: 2, executionTurns: 0, budgetStatus: 'within-budget' },
      confidence: 'high',
      reasons: [],
      blockers: [],
      missingOutputs: [{ kind: 'adr', name: 'ADR-012' }],
      evidenceRefs: [],
      sourceSnapshotHash: 'a'.repeat(64),
      shouldContinueConversation: false,
      ...patch,
    };
  }

  it('does not emit when the recommendation is unchanged', () => {
    const a = observation({});
    const b = observation({});
    expect(recommendationChanged(a, b)).toBe(false);
  });

  it('emits when the recommended action changes', () => {
    const a = observation({ recommendedAction: 'request-artifact' });
    const b = observation({ recommendedAction: 'request-verification' });
    expect(recommendationChanged(a, b)).toBe(true);
  });

  it('emits on the first observation', () => {
    expect(recommendationChanged(undefined, observation({}))).toBe(true);
  });
});

describe('countContradictions', () => {
  it('counts contradicted decisions and contradicting evidence', () => {
    const current = snapshot({
      decisions: [{ ...stableAdrDecision(), status: 'contradicted' }],
      evidence: [{ ref: 'ev-1', contradicts: 'dec-adr' }],
    });
    expect(countContradictions(current)).toBe(2);
  });
});

// ─── Type sanity ────────────────────────────────────────────────

describe('observed state vocabulary', () => {
  const ALL: readonly ObservedWorkflowState[] = [
    'pending',
    'ready',
    'in-progress',
    'awaiting-review',
    'awaiting-verification',
    'blocked',
    'completed',
    'failed',
    'cancelled',
    'indeterminate',
  ];
  it('supports the full explicit state model', () => {
    expect(ALL).toHaveLength(10);
    expect(new Set(ALL).size).toBe(10);
  });
});
