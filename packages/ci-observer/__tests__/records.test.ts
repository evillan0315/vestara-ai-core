import { describe, expect, it } from 'vitest';
import { CIVerificationService } from '../src/completion';
import type { BeginCoordinatorWaitInput, CICoordinator, CICoordinatorWait } from '../src/coordinator';
import { InMemoryCICorrelationStore } from '../src/correlation';
import {
  InMemoryCIDecisionStore,
  InMemoryCIFindingStore,
  InMemoryCIObservationStore,
  InMemoryCIWebhookDeliveryStore,
} from '../src/records';
import {
  SqliteCIDecisionStore,
  SqliteCIFindingStore,
  SqliteCIObservationStore,
  SqliteCIWebhookDeliveryStore,
} from '../src/sqlite-records';
import { InMemoryCITaskGate } from '../src/task-gate';
import { createDb, restart } from './db';
import { buildAndTestJob, COMMIT, desktopBuildJob, REPO, workflowRun } from './fixtures';

class FakeCoordinator implements CICoordinator {
  private readonly waits: CICoordinatorWait[] = [];

  async beginExternalVerificationWait(input: BeginCoordinatorWaitInput): Promise<void> {
    this.waits.push({
      waitRef: input.waitRef,
      taskId: input.taskId,
      repository: input.repository,
      commitSha: input.commitSha,
      branch: input.branch,
      ...(input.runRef !== undefined ? { runRef: input.runRef } : {}),
      suspendedAt: input.suspendedAt ?? 'suspended',
    });
  }
  async resumeExternalVerificationWait(): Promise<void> {}
  async findWaitsByCommit(repository: string, commitSha: string): Promise<readonly CICoordinatorWait[]> {
    return this.waits.filter((wait) => wait.repository === repository && wait.commitSha === commitSha);
  }
  async attachWaitRunRef(): Promise<void> {}
}

function completionJobs() {
  return [
    { job: desktopBuildJob(), steps: desktopBuildJob().steps },
    { job: buildAndTestJob(), steps: buildAndTestJob().steps },
  ];
}

describe('CI records — service persistence (CI-OBS-001E)', () => {
  it('persists the observation and decision produced by a completion review', async () => {
    const records = {
      observations: new InMemoryCIObservationStore(),
      decisions: new InMemoryCIDecisionStore(),
      findings: new InMemoryCIFindingStore(),
    };
    const service = new CIVerificationService({
      correlations: new InMemoryCICorrelationStore(),
      gate: new InMemoryCITaskGate(),
      coordinator: new FakeCoordinator(),
      records,
    });
    await service.registerGovernedPush({
      repository: REPO,
      commitSha: COMMIT,
      branch: 'main',
      originatingWorkflowRunId: 'wf-1',
      originatingTaskId: 'task-1',
      originatingOperationId: 'op-1',
    });
    const result = await service.handleCompletion({ payload: workflowRun(), jobs: completionJobs() });

    const observation = await records.observations.latest();
    expect(observation?.commitSha).toBe(COMMIT);
    expect(observation?.conclusion).toBe(result.observation.conclusion);

    const decision = await records.decisions.latest();
    expect(decision?.action).toBe(result.outcome.action);
    expect(decision?.verdict).toBe(result.decision.promotion.verdict);
    expect(decision?.decisionRef).toContain(result.observation.observationId);
  });

  it('does not fail completion when no record stores are configured', async () => {
    const service = new CIVerificationService({
      correlations: new InMemoryCICorrelationStore(),
      gate: new InMemoryCITaskGate(),
      coordinator: new FakeCoordinator(),
    });
    await service.registerGovernedPush({
      repository: REPO,
      commitSha: COMMIT,
      branch: 'main',
      originatingWorkflowRunId: 'wf-1',
      originatingTaskId: 'task-1',
      originatingOperationId: 'op-1',
    });
    const result = await service.handleCompletion({ payload: workflowRun(), jobs: completionJobs() });
    expect(result.observation.commitSha).toBe(COMMIT);
  });
});

describe('CI records — sqlite stores', () => {
  const observation = {
    observationId: 'obs-1',
    runId: 'run-1',
    commitSha: COMMIT,
    status: 'completed' as const,
    conclusion: 'failed' as const,
    passedChecks: 1,
    failedChecks: 1,
    skippedChecks: 0,
    trigger: 'webhook',
    observedAt: '2026-09-16T00:00:00.000Z',
  };

  it('round-trips observations, decisions, findings and deliveries across restart', async () => {
    const db = await createDb();
    await new SqliteCIObservationStore(db).save(observation);
    await new SqliteCIDecisionStore(db).save({
      decisionId: 'obs-1:review',
      observationId: 'obs-1',
      classification: 'TEST',
      verdict: 'promote',
      action: 'REPAIR_CANDIDATE',
      confidence: 'medium',
      decisionRef: 'obs-1:REPAIR_CANDIDATE',
      decidedAt: '2026-09-16T00:00:00.000Z',
    });
    await new SqliteCIFindingStore(db).save({
      findingId: 'obs-1:prop-1',
      classification: 'TEST',
      verdict: 'promote',
      scopeKey: `${REPO}:${COMMIT}`,
      summary: 'failing test',
      recordedAt: '2026-09-16T00:00:00.000Z',
    });
    await new SqliteCIWebhookDeliveryStore(db).record({
      deliveryId: 'd-1',
      kind: 'completion',
      accepted: true,
      receivedAt: '2026-09-16T00:00:00.000Z',
    });

    const next = await restart(db);
    expect((await new SqliteCIObservationStore(next).latest())?.runId).toBe('run-1');
    expect((await new SqliteCIDecisionStore(next).latest())?.action).toBe('REPAIR_CANDIDATE');
    expect((await new SqliteCIFindingStore(next).list())[0]?.scopeKey).toBe(`${REPO}:${COMMIT}`);
    expect((await new SqliteCIWebhookDeliveryStore(next).recent())[0]?.accepted).toBe(true);
  });
});

describe('CI webhook delivery store (in-memory)', () => {
  it('returns deliveries newest first', async () => {
    const store = new InMemoryCIWebhookDeliveryStore();
    await store.record({ deliveryId: 'a', kind: 'completion', accepted: true, receivedAt: '2026-09-16T00:00:00.000Z' });
    await store.record({
      deliveryId: 'b',
      kind: 'unknown',
      accepted: false,
      reason: 'invalid-signature',
      receivedAt: '2026-09-16T01:00:00.000Z',
    });
    const recent = await store.recent();
    expect(recent[0]?.deliveryId).toBe('b');
  });
});
