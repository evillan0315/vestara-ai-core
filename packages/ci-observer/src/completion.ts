/**
 * CI-OBS-002A — CI completion service (vertical slice).
 *
 * Pipeline:
 *   governed push → correlation → task waiting
 *   GitHub completion → normalize (adapter) → CIObservation
 *                     → reviewer decision → derived action → task resume
 *
 * Provider-native structures never escape the adapter boundary into workflow
 * authority; the service consumes only canonical contracts.
 */

import type { CIFailureEvidence, CIObservation } from '@vestara/ci-contracts';
import type { PriorRecord, ReviewerDecision } from '@vestara/ci-reviewer';
import { review, validateReviewerDecision } from '@vestara/ci-reviewer';
import type { EventBus } from '@vestara/event-bus';
import type { GitHubCheckRun, GitHubJobStep, GitHubWorkflowJob, GitHubWorkflowRun } from '@vestara/github-ci-adapter';
import {
  buildObservation,
  extractFailureEvidence,
  normalizeCheck,
  normalizeJob,
  normalizeRun,
} from '@vestara/github-ci-adapter';
import type { CIVerificationOutcome } from './action';
import { deriveVerificationAction } from './action';
import type { CICoordinator, CICoordinatorWait } from './coordinator';
import type { CICorrelationRecord, CICorrelationStore, RegisterCorrelationInput } from './correlation';
import { createCICorrelationRecord } from './correlation';
import type { CITaskGate, CITaskResumeRecord, CITaskWaitRecord } from './task-gate';

/** A GitHub job together with its steps (jobs are fetched after completion). */
export interface GitHubCompletionJob {
  readonly job: GitHubWorkflowJob;
  readonly steps: readonly GitHubJobStep[];
}

export interface CIVerificationServiceDeps {
  readonly correlations: CICorrelationStore;
  readonly gate: CITaskGate;
  /**
   * Authoritative coordinator (workflow-orchestrator TaskStore adapter).
   * When present, task/correlation authority is delegated to it; the local
   * store/gate remain for focused unit tests only.
   */
  readonly coordinator?: CICoordinator;
  readonly eventBus?: EventBus;
}

export interface RegisterPushResult {
  readonly correlation: CICorrelationRecord;
  readonly wait: CITaskWaitRecord;
}

export interface HandleCompletionInput {
  /** Provider-native run payload (adapter-owned type). */
  readonly payload: GitHubWorkflowRun;
  /** Optional jobs + steps; enables failure-evidence extraction. */
  readonly jobs?: readonly GitHubCompletionJob[];
  /** Optional check runs. */
  readonly checks?: readonly GitHubCheckRun[];
  /** Known findings/hypotheses (e.g. an architectural HOLD) as context. */
  readonly priors?: readonly PriorRecord[];
  /** Override for tests/replay. */
  readonly observedAt?: string;
}

export interface CICompletionResult {
  readonly correlation: CICorrelationRecord;
  readonly observation: CIObservation;
  readonly evidence: readonly CIFailureEvidence[];
  readonly decision: ReviewerDecision;
  readonly outcome: CIVerificationOutcome;
  /** Validation violations for the decision record (empty = valid). */
  readonly violations: readonly string[];
}

/** Map a coordinator-owned wait into the canonical correlation record. */
function correlationFromWait(wait: CICoordinatorWait): CICorrelationRecord {
  return {
    correlationId: wait.waitRef,
    repository: wait.repository,
    commitSha: wait.commitSha,
    branch: wait.branch,
    ...(wait.runRef !== undefined ? { workflowRunId: wait.runRef } : {}),
    originatingWorkflowRunId: wait.originatingWorkflowRunId ?? '',
    originatingTaskId: wait.taskId,
    originatingOperationId: wait.originatingOperationId ?? '',
    createdAt: wait.suspendedAt,
  };
}

export class CIVerificationService {
  constructor(private readonly deps: CIVerificationServiceDeps) {}
  /** Persist correlation and suspend the originating task (running → waiting). */
  async registerGovernedPush(input: RegisterCorrelationInput): Promise<RegisterPushResult> {
    const correlation = createCICorrelationRecord(input);
    if (this.deps.coordinator) {
      // Authoritative path: the coordinator persists the correlation and the
      // task suspension atomically.
      await this.deps.coordinator.beginExternalVerificationWait({
        taskId: correlation.originatingTaskId,
        verifier: 'ci',
        waitRef: correlation.correlationId,
        repository: correlation.repository,
        commitSha: correlation.commitSha,
        branch: correlation.branch,
        ...(correlation.workflowRunId !== undefined ? { runRef: correlation.workflowRunId } : {}),
        originatingWorkflowRunId: correlation.originatingWorkflowRunId,
        originatingOperationId: correlation.originatingOperationId,
        suspendedAt: correlation.createdAt,
      });
      await this.emit('ci.correlation.registered', correlation.correlationId, {
        correlationId: correlation.correlationId,
        repository: correlation.repository,
        commitSha: correlation.commitSha,
        originatingTaskId: correlation.originatingTaskId,
      });
      return {
        correlation,
        wait: {
          taskId: correlation.originatingTaskId,
          correlationId: correlation.correlationId,
          reason: 'ci',
          from: 'running',
          status: 'waiting',
          suspendedAt: correlation.createdAt,
        },
      };
    }
    await this.deps.correlations.put(correlation);
    const wait = await this.deps.gate.suspend({
      taskId: correlation.originatingTaskId,
      correlationId: correlation.correlationId,
      currentStatus: 'running',
    });
    await this.emit('ci.correlation.registered', correlation.correlationId, {
      correlationId: correlation.correlationId,
      repository: correlation.repository,
      commitSha: correlation.commitSha,
      originatingTaskId: correlation.originatingTaskId,
    });
    return { correlation, wait };
  }

  /**
   * Process a correlated GitHub completion.
   *
   * Normalizes through the adapter, builds canonical observation + evidence,
   * reviews against known priors, and derives the workflow action.
   */
  async handleCompletion(input: HandleCompletionInput): Promise<CICompletionResult> {
    const run = normalizeRun(input.payload);
    let correlation: CICorrelationRecord | undefined;
    if (this.deps.coordinator) {
      const waits = await this.deps.coordinator.findWaitsByCommit(run.repository, run.commitSha);
      const wait = waits[0];
      if (wait) {
        if (wait.runRef === undefined) await this.deps.coordinator.attachWaitRunRef(wait.waitRef, run.runId);
        correlation = correlationFromWait(wait);
      }
    } else {
      correlation = await this.resolveCorrelation(run.repository, run.commitSha);
      if (correlation && correlation.workflowRunId === undefined) {
        const attached = await this.deps.correlations.attachRunId(correlation.correlationId, run.runId);
        if (attached) correlation = attached;
      }
    }

    const completionJobs = input.jobs ?? [];
    const ciJobs = completionJobs.map((entry) => normalizeJob(entry.job));
    // Checks require a genuine parent job id; without jobs there is no
    // provider-supplied linkage, so none are fabricated.
    const ciChecks =
      ciJobs.length === 0
        ? []
        : (input.checks ?? []).map((check, index) =>
            normalizeCheck(check, ciJobs[Math.min(index, ciJobs.length - 1)].jobId),
          );

    const observation = buildObservation(run, ciJobs, ciChecks, 'webhook');
    const observedAt = input.observedAt ?? observation.observedAt;
    const observationWithTime: CIObservation = { ...observation, observedAt };

    const evidence: CIFailureEvidence[] = [];
    for (const entry of completionJobs) {
      const ciJob = normalizeJob(entry.job);
      const extracted = extractFailureEvidence(entry.steps, ciJob.jobId);
      if (extracted) evidence.push(extracted);
    }

    const priors = input.priors ?? [];
    const decision = review({ observation: observationWithTime, evidence, priors });
    const violations = validateReviewerDecision(decision, {
      evidenceIds: evidence.map((item) => item.evidenceId),
      priorIds: priors.map((prior) => prior.priorId),
    });
    const outcome = deriveVerificationAction(observationWithTime, decision);

    await this.emit('ci.observation.captured', correlation?.correlationId, {
      observationId: observationWithTime.observationId,
      runId: observationWithTime.runId,
      conclusion: observationWithTime.conclusion,
      failedChecks: observationWithTime.failedChecks,
    });
    await this.emit('ci.review.decided', correlation?.correlationId, {
      classification: decision.classification,
      verdict: decision.promotion.verdict,
      action: outcome.action,
      reason: outcome.reason,
    });

    return {
      correlation: correlation ?? {
        correlationId: `ci-corr:unregistered:${run.commitSha}`,
        repository: run.repository,
        commitSha: run.commitSha,
        branch: run.branch ?? '',
        originatingWorkflowRunId: '',
        originatingTaskId: '',
        originatingOperationId: '',
        createdAt: observedAt,
      },
      observation: observationWithTime,
      evidence,
      decision,
      outcome,
      violations,
    };
  }

  /** Resume the correlated task (waiting → running) citing the decision. */
  async resumeFromDecision(result: CICompletionResult): Promise<CITaskResumeRecord> {
    const decisionRef = `${result.observation.observationId}:${result.outcome.action}`;
    if (this.deps.coordinator) {
      await this.deps.coordinator.resumeExternalVerificationWait({
        waitRef: result.correlation.correlationId,
        decisionRef,
      });
      const resumed: CITaskResumeRecord = {
        taskId: result.correlation.originatingTaskId,
        correlationId: result.correlation.correlationId,
        from: 'waiting',
        status: 'running',
        decisionRef,
        resumedAt: new Date().toISOString(),
      };
      await this.emit('ci.task.resumed', result.correlation.correlationId, {
        taskId: resumed.taskId,
        decisionRef,
        action: result.outcome.action,
      });
      return resumed;
    }
    const resumed = await this.deps.gate.resume({
      correlationId: result.correlation.correlationId,
      decisionRef,
    });
    await this.emit('ci.task.resumed', result.correlation.correlationId, {
      taskId: resumed.taskId,
      decisionRef,
      action: result.outcome.action,
    });
    return resumed;
  }

  private async resolveCorrelation(repository: string, commitSha: string): Promise<CICorrelationRecord | undefined> {
    const matches = await this.deps.correlations.findByCommit(repository, commitSha);
    return matches[0];
  }

  private async emit(type: string, correlationId: string | undefined, payload: Record<string, unknown>) {
    if (!this.deps.eventBus) return;
    await this.deps.eventBus.emit({
      type,
      source: 'ci-observer',
      payload,
      ...(correlationId !== undefined ? { metadata: { correlationId } } : {}),
    });
  }
}
