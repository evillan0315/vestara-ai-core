/**
 * CI-OBS-002C / H7 — Active reconciliation for stale CI waits.
 *
 * For each unresolved wait past its deadline, look up a provider run for the
 * commit and attach it (first observation wins) so a lost completion webhook
 * does not strand the task. Never resumes or completes: resolution still flows
 * through the completion path + reviewer decision.
 *
 * Read + narrow attach only. No force, no merge, no repair.
 */

import { type CIWaitRunObservation, reconcileWait } from '@vestara/ci-observer';
import { createGitHubCIClient } from '@vestara/github-ci-adapter';
import { createCICoordinator } from './ci-coordinator';
import type { CICorrelationWaitReadDto } from './routes/ci';
import type { WorkspaceContext } from './workspace-context';

export interface CIReconcileDeps {
  /** Discover a run for a commit. Defaults to the GitHub adapter. */
  readonly findRuns?: (repository: string, commitSha: string) => Promise<CIWaitRunObservation | undefined>;
  /** Attach the discovered run to the wait. Defaults to the coordinator. */
  readonly attachRun?: (waitRef: string, runRef: string) => Promise<void>;
}

export interface CIReconcileDecisionSummary {
  readonly waitRef: string;
  readonly action: string;
  readonly reason: string;
  readonly runRef?: string;
}

export interface CIReconcileSummary {
  readonly inspected: number;
  readonly stale: number;
  readonly attached: number;
  readonly held: number;
  readonly decisions: readonly CIReconcileDecisionSummary[];
}

function defaultFindRuns(): (repository: string, commitSha: string) => Promise<CIWaitRunObservation | undefined> {
  return async (repository, commitSha) => {
    const token = process.env.GITHUB_TOKEN;
    const [owner, repo] = repository.split('/');
    if (!owner || !repo) return undefined;
    const client = createGitHubCIClient(token ? { token } : {});
    const result = await client.listWorkflowRuns(owner, repo, { sha: commitSha, perPage: 5 });
    if (!result.ok) return undefined;
    const run = result.data[0];
    return run ? { runId: String(run.runId), status: run.status, conclusion: run.conclusion } : undefined;
  };
}

function defaultAttachRun(ctx: WorkspaceContext): (waitRef: string, runRef: string) => Promise<void> {
  const coordinator = createCICoordinator(ctx.orchestrationTasks);
  return (waitRef, runRef) => coordinator.attachWaitRunRef(waitRef, runRef);
}

/** Reconcile the supplied waits; only stale, unresolved waits are acted on. */
export async function reconcileStaleCIWaits(
  ctx: WorkspaceContext,
  waits: readonly CICorrelationWaitReadDto[],
  deps: CIReconcileDeps = {},
): Promise<CIReconcileSummary> {
  const stale = waits.filter((wait) => wait.deadline.state === 'stale');
  const findRuns = deps.findRuns ?? defaultFindRuns();
  const attachRun = deps.attachRun ?? defaultAttachRun(ctx);
  const decisions: CIReconcileDecisionSummary[] = [];
  let attached = 0;
  let held = 0;

  for (const wait of stale) {
    let observation: CIWaitRunObservation | undefined;
    if (!wait.runRef) {
      observation = await findRuns(wait.repository, wait.commitSha).catch(() => undefined);
    }
    const decision = reconcileWait({
      waitRef: wait.waitRef,
      ...(wait.runRef !== undefined ? { runRef: wait.runRef } : {}),
      deadline: wait.deadline,
      ...(observation !== undefined ? { observation } : {}),
    });

    if (decision.action === 'attach-run' && decision.runRef) {
      try {
        await attachRun(wait.waitRef, decision.runRef);
        attached += 1;
      } catch {
        held += 1;
      }
    } else if (decision.action === 'hold' || decision.action === 'await-completion') {
      held += 1;
    }

    decisions.push({
      waitRef: wait.waitRef,
      action: decision.action,
      reason: decision.reason,
      ...(decision.runRef !== undefined ? { runRef: decision.runRef } : {}),
    });
  }

  return { inspected: waits.length, stale: stale.length, attached, held, decisions };
}
