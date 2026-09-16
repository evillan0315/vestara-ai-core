/**
 * CI-OBS-002B2 — Coordinator delegation proof.
 *
 * When a coordinator is present, the service requests authoritative task
 * transitions instead of owning task authority. This test uses a recording
 * fake coordinator; the real workflow-orchestrator TaskStore integration is
 * proven in `packages/workflow-orchestrator/__tests__/external-verification-wait.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import { CIVerificationService } from '../src/completion';
import type { BeginCoordinatorWaitInput, CICoordinator, CICoordinatorWait } from '../src/coordinator';
import { InMemoryCICorrelationStore } from '../src/correlation';
import { InMemoryCITaskGate } from '../src/task-gate';
import { buildAndTestJob, COMMIT, desktopBuildJob, REPO, workflowRun } from './fixtures';

class RecordingCoordinator implements CICoordinator {
  readonly began: BeginCoordinatorWaitInput[] = [];
  readonly resumed: Array<{ waitRef: string; decisionRef: string }> = [];
  readonly attached: Array<{ waitRef: string; runRef: string }> = [];
  private readonly waits: CICoordinatorWait[] = [];

  async beginExternalVerificationWait(input: BeginCoordinatorWaitInput): Promise<void> {
    this.began.push(input);
    this.waits.push({
      waitRef: input.waitRef,
      taskId: input.taskId,
      repository: input.repository,
      commitSha: input.commitSha,
      branch: input.branch,
      ...(input.runRef !== undefined ? { runRef: input.runRef } : {}),
      originatingWorkflowRunId: input.originatingWorkflowRunId,
      originatingOperationId: input.originatingOperationId,
      suspendedAt: input.suspendedAt ?? 'suspended',
    });
  }

  async resumeExternalVerificationWait(input: { waitRef: string; decisionRef: string }): Promise<void> {
    this.resumed.push(input);
  }

  async findWaitsByCommit(repository: string, commitSha: string): Promise<readonly CICoordinatorWait[]> {
    return this.waits.filter((wait) => wait.repository === repository && wait.commitSha === commitSha);
  }

  async attachWaitRunRef(waitRef: string, runRef: string): Promise<void> {
    this.attached.push({ waitRef, runRef });
  }
}

function serviceWith(coordinator: CICoordinator): CIVerificationService {
  return new CIVerificationService({
    correlations: new InMemoryCICorrelationStore(),
    gate: new InMemoryCITaskGate(),
    coordinator,
  });
}

describe('CI completion service — coordinator delegation', () => {
  it('begins the authoritative wait on governed push', async () => {
    const coordinator = new RecordingCoordinator();
    const service = serviceWith(coordinator);
    const { correlation, wait } = await service.registerGovernedPush({
      repository: REPO,
      commitSha: COMMIT,
      branch: 'main',
      originatingWorkflowRunId: 'wf-598',
      originatingTaskId: 'task-598',
      originatingOperationId: 'op-598',
    });

    expect(coordinator.began).toHaveLength(1);
    expect(coordinator.began[0]).toMatchObject({
      taskId: 'task-598',
      verifier: 'ci',
      waitRef: correlation.correlationId,
      repository: REPO,
      commitSha: COMMIT,
    });
    expect(wait.status).toBe('waiting');
  });

  it('resolves the correlation from the coordinator and resumes through it', async () => {
    const coordinator = new RecordingCoordinator();
    const service = serviceWith(coordinator);
    const { correlation } = await service.registerGovernedPush({
      repository: REPO,
      commitSha: COMMIT,
      branch: 'main',
      originatingWorkflowRunId: 'wf-598',
      originatingTaskId: 'task-598',
      originatingOperationId: 'op-598',
    });

    const result = await service.handleCompletion({
      payload: workflowRun(),
      jobs: [
        { job: desktopBuildJob(), steps: desktopBuildJob().steps },
        { job: buildAndTestJob(), steps: buildAndTestJob().steps },
      ],
    });

    expect(result.correlation.correlationId).toBe(correlation.correlationId);
    expect(result.observation.conclusion).toBe('failed');
    expect(result.outcome.action).toBe('HOLD');
    expect(coordinator.attached).toEqual([{ waitRef: correlation.correlationId, runRef: '35031683683' }]);

    await service.resumeFromDecision(result);
    expect(coordinator.resumed).toHaveLength(1);
    expect(coordinator.resumed[0].waitRef).toBe(correlation.correlationId);
    expect(coordinator.resumed[0].decisionRef).toContain('HOLD');
  });
});
