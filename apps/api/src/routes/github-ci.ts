/**
 * GitHub CI completion ingress — CI-OBS-002A.
 *
 * POST /api/github/webhook
 *
 * Boundary contract:
 *   1. Verify the GitHub HMAC signature over the raw body (untrusted ingress
 *      is rejected before any inspection).
 *   2. Deduplicate deliveries.
 *   3. For trusted `workflow_run` completion events, retrieve raw jobs through
 *      the GitHub adapter, normalize + review through @vestara/ci-observer, and
 *      resume the correlated task.
 *
 * GitHub executes; Vestara adjudicates. Acceptance here confers no authority.
 */

import type * as http from 'node:http';
import type { GitHubCompletionJob } from '@vestara/ci-observer';
import {
  CIVerificationService,
  DeliveryDeduplicator,
  InMemoryCICorrelationStore,
  InMemoryCITaskGate,
  validateWebhookIngress,
} from '@vestara/ci-observer';
import type { GitHubWorkflowRun } from '@vestara/github-ci-adapter';
import { createGitHubCIClient } from '@vestara/github-ci-adapter';
import { createCICoordinator } from '../ci-coordinator';
import type { WorkspaceContext } from '../workspace-context';
import { json, readBody } from './types';

const dedupe = new DeliveryDeduplicator();

function headersOf(req: http.IncomingMessage): Record<string, string | undefined> {
  const headers: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers[key] = value;
  }
  return headers;
}

/** Raw jobs are retrieved through the adapter; provider shapes stay inside it. */
async function fetchCompletionJobs(run: GitHubWorkflowRun): Promise<readonly GitHubCompletionJob[]> {
  const token = process.env.GITHUB_TOKEN;
  const [owner, repo] = run.repository.full_name.split('/');
  if (!owner || !repo) return [];
  const client = createGitHubCIClient(token ? { token } : {});
  const result = await client.listRawJobs(owner, repo, run.id);
  if (!result.ok) return [];
  return result.data.map((job) => ({ job, steps: job.steps }));
}

export async function handleGitHubCIRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
  _port: number,
  _url: URL,
): Promise<boolean> {
  if (!p.startsWith('/api/github')) return false;

  if (!(method === 'POST' && p === '/api/github/webhook')) {
    json(res, 404, { error: { code: 'NOT_FOUND', message: `Unknown GitHub route ${p}` } });
    return true;
  }

  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    json(res, 503, {
      error: { code: 'CI_WEBHOOK_DISABLED', message: 'GITHUB_WEBHOOK_SECRET is not configured' },
    });
    return true;
  }

  const rawBody = await readBody(req);
  const decision = validateWebhookIngress({ secret, rawBody, headers: headersOf(req), dedupe });
  if (!decision.accepted) {
    const status = decision.reason === 'invalid-signature' ? 401 : decision.reason === 'duplicate-delivery' ? 202 : 400;
    json(res, status, { accepted: false, reason: decision.reason });
    return true;
  }
  if (decision.kind !== 'completion') {
    json(res, 202, { accepted: true, kind: decision.kind });
    return true;
  }

  let parsed: { workflow_run?: GitHubWorkflowRun };
  try {
    parsed = JSON.parse(rawBody) as { workflow_run?: GitHubWorkflowRun };
  } catch {
    json(res, 400, { error: { code: 'MALFORMED_BODY', message: 'Body is not valid JSON' } });
    return true;
  }
  const run = parsed.workflow_run;
  if (!run) {
    json(res, 400, { error: { code: 'MISSING_WORKFLOW_RUN', message: 'workflow_run payload is required' } });
    return true;
  }

  const jobs = await fetchCompletionJobs(run);
  // Production path: the authoritative orchestrated-task store owns the wait
  // and the correlation. `ctx.orchestrationTasks` is always supplied as the
  // coordinator, so `correlations` and `gate` below are UNREACHABLE
  // compatibility/fallback dependencies — `CIVerificationService` only touches
  // them in its non-coordinator branches (registerGovernedPush,
  // handleCompletion, resumeFromDecision). They are constructed per request,
  // hold no production correlation/wait/resume semantics, and their process
  // lifetime is irrelevant. They remain required by `CIVerificationServiceDeps`
  // and cannot be removed from composition without widening that contract
  // (CI-OBS-002C0 HOLD; see the closure report).
  const service = new CIVerificationService({
    correlations: new InMemoryCICorrelationStore(),
    gate: new InMemoryCITaskGate(),
    coordinator: createCICoordinator(ctx.orchestrationTasks),
  });
  const result = await service.handleCompletion({ payload: run, jobs });
  let resumed = false;
  if (result.correlation.originatingTaskId) {
    try {
      await service.resumeFromDecision(result);
      resumed = true;
    } catch {
      // No pending authoritative wait (e.g. not a governed push) — the
      // observation/decision is still recorded.
      resumed = false;
    }
  }

  json(res, 202, {
    accepted: true,
    kind: 'completion',
    observationId: result.observation.observationId,
    conclusion: result.observation.conclusion,
    verdict: result.decision.promotion.verdict,
    action: result.outcome.action,
    evidenceCount: result.evidence.length,
    violations: result.violations,
    resumed,
  });
  return true;
}
