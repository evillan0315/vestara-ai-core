/**
 * CI-PUSH-001 — Authoritative coordinator adapter.
 *
 * Adapts the workflow-orchestrator `TaskStore` to the CI coordinator port
 * (CI-OBS-002B2) and the governed-push coordinator port. The store owns
 * task/`awaiting-verification` authority; this module only translates.
 *
 * `abortExternalVerificationWait` is used by the governed-push producer when a
 * commit succeeded but the push did not land: the task is returned to
 * `in-progress` (retryable, the default) or `failed` (terminal), without
 * fabricating a resume decision.
 */

import type { BeginCoordinatorWaitInput, CICoordinator, CICoordinatorWait } from '@vestara/ci-observer';
import type { TaskStore } from '@vestara/workflow-orchestrator';
import type { GovernedPushCoordinator } from '@vestara/workspace';

export type CICoordinatorAdapter = CICoordinator & GovernedPushCoordinator;

export function createCICoordinator(tasks: TaskStore): CICoordinatorAdapter {
  return {
    async beginExternalVerificationWait(input: BeginCoordinatorWaitInput): Promise<void> {
      await tasks.beginExternalVerificationWait(input);
    },
    async resumeExternalVerificationWait(input: {
      waitRef: string;
      decisionRef: string;
      resumedAt?: string;
    }): Promise<void> {
      await tasks.resumeExternalVerificationWait(input);
    },
    async findWaitsByCommit(repository: string, commitSha: string): Promise<readonly CICoordinatorWait[]> {
      const rows = await tasks.listWaitsByCommit(repository, commitSha);
      const waits: CICoordinatorWait[] = [];
      for (const task of rows) {
        const wait = task.externalWait;
        if (!wait) continue;
        waits.push({
          waitRef: wait.waitRef,
          taskId: task.id,
          repository: wait.repository,
          commitSha: wait.commitSha,
          branch: wait.branch,
          ...(wait.provider !== undefined ? { provider: wait.provider } : {}),
          ...(wait.runRef !== undefined ? { runRef: wait.runRef } : {}),
          ...(wait.originatingWorkflowRunId !== undefined
            ? { originatingWorkflowRunId: wait.originatingWorkflowRunId }
            : {}),
          ...(wait.originatingOperationId !== undefined ? { originatingOperationId: wait.originatingOperationId } : {}),
          suspendedAt: wait.suspendedAt,
          ...(wait.resumedAt !== undefined ? { resumedAt: wait.resumedAt } : {}),
          ...(wait.decisionRef !== undefined ? { decisionRef: wait.decisionRef } : {}),
        });
      }
      return waits;
    },
    async attachWaitRunRef(waitRef: string, runRef: string): Promise<void> {
      await tasks.attachExternalWaitRunRef(waitRef, runRef);
    },
    async abortExternalVerificationWait(input): Promise<void> {
      await tasks.updateStatus(input.taskId, input.terminal ? 'failed' : 'in-progress', input.reason);
    },
  };
}
