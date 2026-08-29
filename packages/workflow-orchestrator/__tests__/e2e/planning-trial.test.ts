import { describe, expect, it } from 'vitest';
import {
  type AgentGeneratedPlan,
  hasBlockingFindings,
  type PlanReviewResult,
  type PlanTrialContext,
  PlanTrialRunner,
  resolveRealAgentProfile,
  type TrialInvocationRequest,
  type TrialInvocationResult,
  type TrialModelProvider,
  UnavailableTrialProvider,
} from '../e2e-support/real-agent';

class FakeTrialModelProvider implements TrialModelProvider {
  readonly id = 'fake';
  readonly calls: Array<{ role: string; sessionId: string; prompt: string }> = [];
  private readonly counters = new Map<string, number>();

  constructor(
    private readonly script: Readonly<Record<string, string>>,
    private readonly failAs?: (request: TrialInvocationRequest) => TrialInvocationResult,
  ) {}

  async invoke(request: TrialInvocationRequest): Promise<TrialInvocationResult> {
    this.calls.push({ role: request.role, sessionId: request.sessionId, prompt: request.prompt });
    const index = this.counters.get(request.role) ?? 0;
    this.counters.set(request.role, index + 1);
    if (this.failAs) return this.failAs(request);
    const text = this.script[`${request.role}:${index}`];
    if (text === undefined) throw new Error(`unexpected ${request.role} invocation #${index}`);
    return { text, sessionId: request.sessionId, providerStatus: 'completed' };
  }
}

function plan(overrides: Partial<AgentGeneratedPlan> = {}): AgentGeneratedPlan {
  return {
    summary: 'Add a versioned API endpoint',
    assumptions: [],
    steps: [
      {
        id: 's1',
        description: 'Add /api/system/info route with tests and docs',
        assignedRole: 'engineer',
        dependencies: [],
        expectedArtifacts: ['route', 'tests', 'docs'],
        verificationRequirements: ['targeted tests'],
      },
    ],
    affectedPaths: ['src'],
    outOfScope: ['infra'],
    requiredApprovals: [],
    risks: [],
    completionCriteria: ['tests pass'],
    ...overrides,
  };
}

function approveReview(): PlanReviewResult {
  return { conclusion: 'approved', findings: [], evidenceRefs: ['repo:sha-1'] };
}

function changeRequest(findings?: PlanReviewResult['findings']): PlanReviewResult {
  return {
    conclusion: 'changes-requested',
    findings: findings ?? [
      {
        id: 'f1',
        severity: 'warning',
        category: 'verification',
        message: 'missing verification for step s1',
        evidenceRefs: ['repo:sha-1'],
        affectedPlanStepIds: ['s1'],
      },
    ],
    evidenceRefs: ['repo:sha-1'],
  };
}

const context: PlanTrialContext = {
  objective: 'Add a versioned API endpoint that returns service metadata, add tests, document it, and verify.',
  repositorySummary: 'small node service',
  relevantAdrs: [],
  packageBoundaries: ['src'],
  verificationRequirements: ['targeted tests', 'build'],
  permittedScope: ['src'],
};

const profile = resolveRealAgentProfile('deepseekV4FlashOpenCodeGo');

function runTrial(provider: TrialModelProvider, controlState: Record<string, number> = {}) {
  return new PlanTrialRunner({ now: () => '2026-08-06T00:00:00.000Z' }).run({
    workflowId: 'wf-1',
    profile,
    provider,
    context,
    controlState,
  });
}

describe('WFO-E2E-002B governed Planner + Reviewer trial', () => {
  it('1. a valid first-pass plan is reviewed and stops at human-approval readiness', async () => {
    const provider = new FakeTrialModelProvider({
      'planner:0': JSON.stringify(plan()),
      'reviewer:0': JSON.stringify(approveReview()),
    });
    const result = await runTrial(provider);

    expect(result.conclusion).toBe('awaiting-human-approval');
    expect(result.stoppedBeforeExecution).toBe(true);
    expect(provider.calls.map((call) => call.role)).toEqual(['planner', 'reviewer']);
    expect(result.planArtifact?.immutable).toBe(true);
    expect(result.planArtifact?.version).toBe(1);
    expect(result.planVersions).toHaveLength(1);
    // Cost and token usage recorded on every invocation.
    for (const record of result.invocations) {
      expect(record.invocation.inputTokens).toBeGreaterThan(0);
      expect(record.invocation.outputTokens).toBeGreaterThan(0);
      expect(record.invocation.modelId).toBe('deepseek-v4-flash');
      expect(record.invocation.materialProgress).toBe(true);
    }
    // No repository mutation is possible — the runner has no file surface.
    expect(result.invocations.every((record) => record.invocation.producedArtifactIds.length === 0)).toBe(true);
  });

  it('2. reviewer-requested changes produce a new immutable plan version before approval', async () => {
    const provider = new FakeTrialModelProvider({
      'planner:0': JSON.stringify(plan({ steps: [{ ...plan().steps[0]!, verificationRequirements: [] }] })),
      'reviewer:0': JSON.stringify(changeRequest()),
      'planner:1': JSON.stringify(plan()),
      'reviewer:1': JSON.stringify(approveReview()),
    });
    const result = await runTrial(provider);

    expect(result.planVersions).toHaveLength(2);
    expect(result.planVersions[0]?.version).toBe(1);
    expect(result.planVersions[1]?.version).toBe(2);
    expect(result.planVersions[0]?.planHash).not.toBe(result.planVersions[1]?.planHash); // v1 immutable, v2 is new
    expect(result.conclusion).toBe('awaiting-human-approval');

    // The revision Planner prompt carries only the structured findings.
    const revisionPrompt = provider.calls[2]?.prompt ?? '';
    expect(revisionPrompt).toContain('Revision required');
    expect(revisionPrompt).toContain('missing verification');
    expect(revisionPrompt).not.toContain('Planner reasoning');
  });

  it('3. malformed Planner output retries once with schema-only feedback, then indeterminate — no Reviewer call', async () => {
    const provider = new FakeTrialModelProvider({
      'planner:0': '{ "summary": "truncated" ',
      'planner:1': 'not json at all',
    });
    const result = await runTrial(provider);

    expect(result.conclusion).toBe('indeterminate');
    expect(provider.calls.map((call) => call.role)).toEqual(['planner', 'planner']); // 1 call + 1 constrained retry, no reviewer
    const first = result.invocations[0]!;
    expect(first.invocation.schemaValidation).toBe('invalid');
    expect(first.invocation.retryCount).toBe(1);
    expect(first.invocation.materialProgress).toBe(false); // invalid output is never material progress
    expect(first.errors.length).toBeGreaterThan(0);
    // The retry prompt identifies schema defects only, never a semantic repair.
    expect(provider.calls[1]?.prompt).toContain('Validation failed (schema defects only)');
  });

  it('4. an unavailable provider or credential yields a controlled advisory failure', async () => {
    const provider = new UnavailableTrialProvider('OPENCODE_SERVER_PASSWORD missing');
    const result = await runTrial(provider);

    expect(result.conclusion).toBe('indeterminate');
    expect(result.controls.reasons).toContain('provider or credential unavailable');
    expect(result.invocations[0]?.invocation.providerStatus).toBe('unavailable');
    // No secret value leaks into evidence or reasons.
    expect(JSON.stringify(result)).not.toMatch(/sk-[a-z0-9]|password\s*[:=]\s*\S+/i);
    // The workflow remains recoverable with a working provider.
    const recovered = await runTrial(
      new FakeTrialModelProvider({
        'planner:0': JSON.stringify(plan()),
        'reviewer:0': JSON.stringify(approveReview()),
      }),
    );
    expect(recovered.conclusion).toBe('awaiting-human-approval');
  });

  it('5. a model-call limit halts further calls and never treats a partial plan as approved', async () => {
    const provider = new FakeTrialModelProvider({
      'planner:0': JSON.stringify(plan()),
      'reviewer:0': JSON.stringify(approveReview()),
    });
    const result = await runTrial(provider, { modelCalls: profile.maximumModelCalls - 1 });

    expect(result.controls.status).toBe('stop');
    expect(result.controls.reasons).toContain('maximum model-call count reached');
    expect(provider.calls).toHaveLength(1); // reviewer never invoked
    expect(result.conclusion).toBe('indeterminate'); // no partial plan approved
    expect(result.invocations[0]?.invocation.modelId).toBe('deepseek-v4-flash');
  });

  it('6. an indeterminate reviewer result can never become approval', async () => {
    const provider = new FakeTrialModelProvider({
      'planner:0': JSON.stringify(plan()),
      'reviewer:0': JSON.stringify({ conclusion: 'indeterminate', findings: [], evidenceRefs: [] }),
    });
    const result = await runTrial(provider);

    expect(result.conclusion).toBe('indeterminate');
    expect(result.conclusion).not.toBe('approved');
    expect(result.conclusion).not.toBe('awaiting-human-approval');
    expect(result.stoppedBeforeExecution).toBe(true); // no repository mutation is possible

    // A blocking finding prevents approval regardless of the stated conclusion.
    const blocked = await runTrial(
      new FakeTrialModelProvider({
        'planner:0': JSON.stringify(plan()),
        'reviewer:0': JSON.stringify({
          ...approveReview(),
          findings: [
            {
              id: 'f',
              severity: 'blocking',
              category: 'scope',
              message: 'out of scope',
              evidenceRefs: [],
              affectedPlanStepIds: [],
            },
          ],
        }),
      }),
    );
    expect(hasBlockingFindings(blocked.review!)).toBe(true);
    expect(blocked.conclusion).toBe('changes-requested');
  });
});
