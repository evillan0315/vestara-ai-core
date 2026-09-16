import type { PriorRecord } from '@vestara/ci-reviewer';
import { describe, expect, it } from 'vitest';
import { CIVerificationService } from '../src/completion';
import { InMemoryCICorrelationStore } from '../src/correlation';
import { InMemoryCITaskGate } from '../src/task-gate';
import { buildAndTestJob, COMMIT, desktopBuildJob, REPO, RUN_ID, workflowRun } from './fixtures';

/** Known architectural HOLD recorded before this run (F4). */
const F4_PRIOR: PriorRecord = {
  priorId: 'finding://f4-m11a-activity-record-shape',
  kind: 'finding',
  recordedStatus: 'hold',
  scopeKeys: { commitSha: COMMIT },
  summaryOrRef: 'F4 HOLD — M11A read-model vs canonical Activity Room record shape',
};

function buildService() {
  const correlations = new InMemoryCICorrelationStore();
  const gate = new InMemoryCITaskGate();
  return { correlations, gate, service: new CIVerificationService({ correlations, gate }) };
}

describe('CI completion vertical slice — F4 dogfood fixture', () => {
  it('correlates the governed push, waits, and resumes on correlated completion', async () => {
    const { gate, service } = buildService();

    const { correlation, wait } = await service.registerGovernedPush({
      repository: REPO,
      commitSha: COMMIT,
      branch: 'main',
      workflowName: 'CI',
      originatingWorkflowRunId: 'wf-run-598',
      originatingTaskId: 'task-598',
      originatingOperationId: 'op-push-598',
    });

    // running → waiting (typed reason ci)
    expect(wait.status).toBe('waiting');
    expect(wait.reason).toBe('ci');
    expect(await gate.getStatus('task-598')).toBe('waiting');

    const result = await service.handleCompletion({
      payload: workflowRun(),
      jobs: [
        { job: desktopBuildJob(), steps: desktopBuildJob().steps },
        { job: buildAndTestJob(), steps: buildAndTestJob().steps },
      ],
      priors: [F4_PRIOR],
    });

    // Correlation survives the completion boundary and attaches the run id.
    expect(result.correlation.correlationId).toBe(correlation.correlationId);
    expect(result.correlation.workflowRunId).toBe(String(RUN_ID));

    // Canonical observation: terminal failed, captured via webhook.
    expect(result.observation.conclusion).toBe('failed');
    expect(result.observation.trigger).toBe('webhook');
    expect(result.observation.failedChecks).toBeGreaterThan(0);

    // Only the genuine failed build step yields evidence; the cancelled
    // Fast tests step is not a root-cause failure.
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].stepName).toBe('Build Workspace UI desktop shell');

    // AgentOrigin does not appear in clean CI (stale local artifact only).
    expect(JSON.stringify(result.evidence)).not.toMatch(/AgentOrigin/);

    // Reviewer record is valid and cites the known F4 HOLD.
    expect(result.violations).toEqual([]);
    const cited =
      result.decision.promotion.reconsiders === F4_PRIOR.priorId ||
      result.decision.hypotheses.some((hypothesis) => hypothesis.reconsiders === F4_PRIOR.priorId);
    expect(cited).toBe(true);

    // Adjudication is HOLD — no invented M11A compatibility patch.
    expect(result.outcome.action).toBe('HOLD');

    // waiting → running, citing the decision.
    const resumed = await service.resumeFromDecision(result);
    expect(resumed.from).toBe('waiting');
    expect(resumed.status).toBe('running');
    expect(resumed.decisionRef).toContain('HOLD');
    expect(await gate.getStatus('task-598')).toBe('running');
    expect(await gate.getWait(correlation.correlationId)).toBeUndefined();
  });

  it('treats a cancelled run as inconclusive evidence, not failure', async () => {
    const { service } = buildService();
    await service.registerGovernedPush({
      repository: REPO,
      commitSha: COMMIT,
      branch: 'main',
      originatingWorkflowRunId: 'wf-run-598',
      originatingTaskId: 'task-598',
      originatingOperationId: 'op-push-598',
    });

    const result = await service.handleCompletion({
      payload: workflowRun({ conclusion: 'cancelled' }),
      jobs: [{ job: buildAndTestJob(), steps: buildAndTestJob().steps }],
    });

    expect(result.observation.conclusion).toBe('cancelled');
    expect(result.evidence).toHaveLength(0);
    expect(result.outcome.action).toBe('HOLD');
    expect(result.outcome.reason).toMatch(/cancelled/i);
    expect(result.violations).toEqual([]);
  });

  it('holds a failure with no evidence (absence of evidence is not a classification)', async () => {
    const { service } = buildService();
    await service.registerGovernedPush({
      repository: REPO,
      commitSha: COMMIT,
      branch: 'main',
      originatingWorkflowRunId: 'wf-run-598',
      originatingTaskId: 'task-598',
      originatingOperationId: 'op-push-598',
    });

    const result = await service.handleCompletion({ payload: workflowRun(), jobs: [] });

    expect(result.observation.conclusion).toBe('failed');
    expect(result.evidence).toEqual([]);
    expect(result.violations).toEqual([]);
    expect(result.outcome.action).toBe('HOLD');
  });
});
