import type { CICompletionResult } from '@vestara/ci-observer';
import { describe, expect, it } from 'vitest';
import { ciCompletionActivity } from '../src/ci-activity.js';

function completion(over: { conclusion: string; action: string }): CICompletionResult {
  const observation = {
    observationId: 'obs-1',
    runId: 'run-1',
    commitSha: 'abc',
    status: 'completed',
    conclusion: over.conclusion,
    passedChecks: 1,
    failedChecks: 1,
    skippedChecks: 0,
    trigger: 'webhook',
    observedAt: '2026-09-16T00:00:00.000Z',
    provenance: [],
  };
  const decision = {
    classification: 'TEST',
    hypotheses: [],
    promotion: {
      verdict: 'promote',
      evidenceRefs: ['e1'],
      contradictionRefs: [],
      rationale: 'supported',
      limitations: [],
      confidence: 'medium',
      verificationState: { kind: 'ci-terminal', conclusion: over.conclusion },
    },
  };
  return {
    correlation: {
      correlationId: 'ci-corr:r:abc:task-1',
      repository: 'r',
      commitSha: 'abc',
      branch: 'vestara/task-1',
      originatingWorkflowRunId: 'wf-1',
      originatingTaskId: 'task-1',
      originatingOperationId: 'op-1',
      createdAt: '2026-09-16T00:00:00.000Z',
    },
    observation,
    evidence: [],
    decision,
    outcome: { action: over.action, reason: 'reviewer promoted', observation, decision },
    violations: [],
  } as unknown as CICompletionResult;
}

describe('CI activity projection (CI-OBS-001F)', () => {
  it('projects a failed CI run as a failed verification finding', () => {
    const record = ciCompletionActivity(completion({ conclusion: 'failed', action: 'REPAIR_CANDIDATE' }));
    expect(record.kind).toBe('verification');
    expect(record.outcome).toBe('failed');
    expect(record.effect).toBe('recommendation');
    expect(record.taskId).toBe('task-1');
    expect(record.correlationId).toBe('ci-corr:r:abc:task-1');
    expect(record.verificationRunId).toBe('obs-1');
    expect(record.checks[0]?.status).toBe('failed');
    expect(record.actor.id).toBe('github-actions');
  });

  it('does not claim verification for a passing CI run (CI pass ≠ objective verification)', () => {
    const record = ciCompletionActivity(completion({ conclusion: 'passed', action: 'PROCEED_TO_VERIFICATION' }));
    expect(record.outcome).toBe('passed');
    expect(record.effect).toBe('finding');
    expect(record.reason).toContain('PROCEED_TO_VERIFICATION');
    expect(record.reason).not.toMatch(/objective is verified/i);
  });

  it('treats cancelled/timed-out runs as inconclusive, never failed', () => {
    for (const conclusion of ['cancelled', 'timed_out', 'skipped', 'unknown']) {
      const record = ciCompletionActivity(completion({ conclusion, action: 'HOLD' }));
      expect(record.outcome).toBe('inconclusive');
      expect(record.effect).toBe('hold');
    }
  });
});
