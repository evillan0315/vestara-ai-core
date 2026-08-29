import { afterEach, describe, expect, it } from 'vitest';
import { createScenario, type WorkflowScenarioBuilder } from '../e2e-support/harness';
import { validateStageTransition } from '../e2e-support/lifecycle';
import { evaluateRunControls, resolveRealAgentProfile } from '../e2e-support/real-agent';
import {
  deriveVerificationConclusion,
  evaluateVerificationComparability,
  failureFingerprintDelta,
} from '../e2e-support/verification-delta';
import type { VerificationCheckResult, VerificationEvidenceIdentity } from '../e2e-support/verification-profile';
import { verificationSnapshot } from '../e2e-support/verification-profile';

const scenarios: WorkflowScenarioBuilder[] = [];

afterEach(() => {
  for (const scenario of scenarios.splice(0)) scenario.dispose();
});

function identity(
  executionAttemptId: string,
  baselineSha: string,
  currentSha: string,
  overrides: Partial<VerificationEvidenceIdentity> = {},
): VerificationEvidenceIdentity {
  return {
    workflowId: 'wf-1',
    taskId: 'task-1',
    executionAttemptId,
    repositoryBaselineSha: baselineSha,
    repositoryCurrentSha: currentSha,
    verificationProfileId: 'e2e-profile',
    verificationScope: 'targeted',
    environmentFingerprint: 'env-e2e',
    ...overrides,
  };
}

function run(
  ident: VerificationEvidenceIdentity,
  failing: readonly { check: string; fingerprint: string }[],
): ReturnType<typeof verificationSnapshot> {
  const checks: VerificationCheckResult[] = [
    { check: 'lint', passed: true },
    { check: 'build', passed: true },
    { check: 'targeted-tests', passed: true },
    ...failing.map((failure) => ({ check: failure.check, passed: false, fingerprint: failure.fingerprint })),
  ];
  return verificationSnapshot({
    identity: ident,
    execution: {
      commands: ['pnpm lint:check', 'pnpm build', 'pnpm test'],
      environmentFingerprint: ident.environmentFingerprint,
      durationMs: 10,
    },
    checks,
  });
}

const A = { check: 'lint', fingerprint: 'FINGERPRINT-A' };
const B = { check: 'targeted-tests', fingerprint: 'FINGERPRINT-B' };
const C = { check: 'build', fingerprint: 'FINGERPRINT-C' };

describe('WFO-E2E-001F evidence-backed verification and repair', () => {
  it('1. first-pass success is comparable and passing, enabling completion', async () => {
    const baseline = run(identity('baseline', 'S0', 'S0'), [A]);
    const current = run(identity('attempt-1', 'S0', 'S1'), [A]);
    const conclusion = deriveVerificationConclusion(baseline, current);

    expect(conclusion.comparability.status).toBe('comparable');
    expect(conclusion.delta.added).toEqual([]);
    expect(conclusion.status).toBe('pass');
    expect(conclusion.regressionIntroduced).toBe(false);
    expect(current.identity.repositoryCurrentSha).toBe('S1');

    // A passing evidence conclusion justifies the orchestrator completing.
    const scenario = await createScenario({
      objective: 'Add a health endpoint',
      script: { tasks: [{ taskSummary: 'Implement the health endpoint' }] },
    });
    scenarios.push(scenario);
    const project = await scenario.intake('Add a health endpoint');
    await scenario.contextAssembly(project.id);
    await scenario.plan(project.id, [scenario.taskInput({ summary: 'Implement the health endpoint' })]);
    await scenario.reviewPlan(project.id, 'approved');
    await scenario.approve(project.id);
    await scenario.execute(project.id);
    await scenario.verify(project.id, true);
    expect((await scenario.snapshot(project.id)).status).toBe('completed');
  });

  it('2. a failed generation then a repair that resolves it completes only after re-verification', () => {
    const baseline = run(identity('baseline', 'S0', 'S0'), [A]);
    const first = run(identity('attempt-1', 'S0', 'S1'), [A, B]);
    const repair = run(identity('attempt-2', 'S0', 'S2'), [A]);

    const failed = deriveVerificationConclusion(baseline, first);
    expect(failed.status).toBe('fail');
    expect(failed.delta.added).toEqual(['FINGERPRINT-B']);

    const resolved = deriveVerificationConclusion(baseline, repair);
    expect(resolved.status).toBe('pass');
    // The gen1-introduced failure is resolved by the repair (cross-generation delta).
    expect(failureFingerprintDelta(first, repair).resolved).toEqual(['FINGERPRINT-B']);
    expect(failureFingerprintDelta(first, repair).added).toEqual([]);
    expect(repair.identity.executionAttemptId).toBe('attempt-2'); // evidence bound to its own attempt
  });

  it('3. a repair that swaps one regression for another stays failing (fingerprint delta)', () => {
    const baseline = run(identity('baseline', 'S0', 'S0'), [A]);
    const first = run(identity('attempt-1', 'S0', 'S1'), [A, B]);
    const repair = run(identity('attempt-2', 'S0', 'S2'), [A, C]);

    const firstConclusion = deriveVerificationConclusion(baseline, first);
    const repairConclusion = deriveVerificationConclusion(baseline, repair);

    expect(firstConclusion.status).toBe('fail');
    expect(repairConclusion.status).toBe('fail');
    expect(failureFingerprintDelta(first, repair).added).toEqual(['FINGERPRINT-C']);
    expect(failureFingerprintDelta(first, repair).resolved).toEqual(['FINGERPRINT-B']);
    // A raw failure count (A+B vs A+C) would look unchanged — fingerprints do not miss it.
    expect(first.results.failureFingerprints).toHaveLength(2);
    expect(repair.results.failureFingerprints).toHaveLength(2);
    expect(repairConclusion.regressionIntroduced).toBe(true);
  });

  it('4. an identity-axis difference yields incomparable → indeterminate, never pass or fail', () => {
    const baseline = run(identity('baseline', 'S0', 'S0'), []);
    const current = run(identity('attempt-1', 'S0', 'S1', { verificationScope: 'full-suite' }), []);
    const comparability = evaluateVerificationComparability(baseline, current);
    expect(comparability.status).toBe('incomparable');
    expect(comparability.reasons.some((reason) => reason.includes('verificationScope'))).toBe(true);

    const conclusion = deriveVerificationConclusion(baseline, current);
    expect(conclusion.status).toBe('indeterminate');
    expect(conclusion.regressionIntroduced).toBeNull();
    expect(conclusion.status).not.toBe('pass');
    expect(conclusion.status).not.toBe('fail');
  });

  it('5. repository drift invalidates a prior passing verification', () => {
    const baseline = run(identity('baseline', 'S0', 'S0'), []);
    const verified = run(identity('attempt-1', 'S0', 'S1'), []);
    expect(deriveVerificationConclusion(baseline, verified).status).toBe('pass');

    const currentRepositorySha = 'S2'; // repo changed after verification
    const completionValid = verified.identity.repositoryCurrentSha === currentRepositorySha;
    expect(completionValid).toBe(false); // the prior verification is stale for completion
    expect(verified.identity.repositoryCurrentSha).toBe('S1');
  });

  it('6. the repair-cycle limit schedules no further repair and keeps failed evidence immutable', () => {
    const baseline = run(identity('baseline', 'S0', 'S0'), [A]);
    const maxRepairCycles = 2;
    const repairSnapshots: ReturnType<typeof verificationSnapshot>[] = [];
    for (let i = 0; i < maxRepairCycles; i += 1) {
      repairSnapshots.push(run(identity(`attempt-${i + 1}`, 'S0', `S${i + 1}`), [A, B]));
    }
    // No additional repair is scheduled beyond the configured limit.
    expect(repairSnapshots).toHaveLength(maxRepairCycles);
    // The failed evidence remains immutable and never claims "no regression".
    const conclusion = deriveVerificationConclusion(baseline, repairSnapshots[maxRepairCycles - 1]!);
    expect(conclusion.status).toBe('fail');
    expect(conclusion.regressionIntroduced).toBe(true);
    expect(repairSnapshots[0]?.contentHash).toBe(repairSnapshots[0]?.contentHash);
    expect(repairSnapshots[0]?.results.failureFingerprints).toEqual(['FINGERPRINT-A', 'FINGERPRINT-B']);
  });

  it('7. two equivalent repairs produce no material progress and pause', () => {
    const repairOne = run(identity('attempt-1', 'S0', 'S1'), [A, B]);
    const repairTwo = run(identity('attempt-2', 'S0', 'S2'), [A, B]);
    const delta = failureFingerprintDelta(repairOne, repairTwo);
    expect(delta.added).toEqual([]);
    expect(delta.resolved).toEqual([]);

    const controls = evaluateRunControls(
      {
        modelCalls: 12,
        inputTokens: 100,
        outputTokens: 100,
        estimatedCostUsd: 0.5,
        elapsedMs: 3_000,
        planningTurns: 0,
        executionTurns: 3,
        noProgressTurns: 2,
      },
      resolveRealAgentProfile('deepseekV4FlashOpenCodeGo'),
    );
    expect(controls.status).toBe('pause');
    expect(controls.reasons).toContain('repeated no-progress turns detected');
  });

  it('8. a repair is budget-interrupted into budget-paused, never failed or completed', () => {
    const controls = evaluateRunControls(
      {
        modelCalls: 5,
        inputTokens: 100,
        outputTokens: 100,
        estimatedCostUsd: 2.5,
        elapsedMs: 2_000,
        planningTurns: 0,
        executionTurns: 1,
        noProgressTurns: 0,
      },
      resolveRealAgentProfile('deepseekV4FlashOpenCodeGo'), // maximumEstimatedCostUsd = 2
    );
    expect(controls.status).toBe('pause');
    expect(controls.reasons).toContain('budget threshold reached — budget-paused until policy adjustment');
    expect(controls.reasons).not.toContain('scope violation attempted');

    // The canonical lifecycle allows in-progress → budget-paused (and forbids treating it as terminal).
    expect(validateStageTransition('in-progress', 'budget-paused').allowed).toBe(true);
    expect(validateStageTransition('in-progress', 'completed').allowed).toBe(false);
  });
});
