import { EventEmitter } from 'node:events';
import type * as http from 'node:http';
import {
  type CIRecordStores,
  computeGitHubSignature,
  GITHUB_DELIVERY_HEADER,
  GITHUB_EVENT_HEADER,
  GITHUB_SIGNATURE_HEADER,
  InMemoryCICheckStateStore,
  InMemoryCIDecisionStore,
  InMemoryCIFindingStore,
  InMemoryCIGovernedPushStore,
  InMemoryCINotificationStore,
  InMemoryCIObservationStore,
} from '@vestara/ci-observer';
import { migrate } from '@vestara/sqlite-migrations';
import { ORCHESTRATION_MANIFEST, TaskStore } from '@vestara/workflow-orchestrator';
import type { Database } from 'sql.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMIT, REPO, workflowRun } from '../../../packages/ci-observer/__tests__/fixtures';
import { createCICoordinator } from '../src/ci-coordinator.js';
import { handleGitHubCIRoute } from '../src/routes/github-ci.js';
import type { WorkspaceContext } from '../src/workspace-context.js';

// Keep the HTTP test offline and deterministic: the provider client is stubbed
// while the adapter's normalize/* helpers (used by ci-observer) remain real.
vi.mock('@vestara/github-ci-adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vestara/github-ci-adapter')>();
  return {
    ...actual,
    createGitHubCIClient: () => ({
      listRawJobs: async () => ({ ok: false, error: 'offline', isRetrievalFailure: true }),
    }),
  };
});

const SECRET = 'ci-webhook-test-secret';

let SQL: { Database: new (data?: Uint8Array | null) => Database };

beforeAll(async () => {
  const initSqlJs = (await import('sql.js')).default;
  SQL = await initSqlJs();
});

beforeEach(() => {
  process.env.GITHUB_WEBHOOK_SECRET = SECRET;
  delete process.env.GITHUB_TOKEN;
});

afterEach(() => {
  delete process.env.GITHUB_WEBHOOK_SECRET;
  delete process.env.GITHUB_TOKEN;
});

function fakeResponse(): { res: http.ServerResponse; body: () => any; status: () => number } {
  let status = 0;
  let body: unknown = null;
  const res = new EventEmitter() as unknown as http.ServerResponse;
  res.writeHead = ((code: number) => {
    status = code;
    return res;
  }) as typeof res.writeHead;
  res.end = ((data?: unknown) => {
    body = typeof data === 'string' ? JSON.parse(data) : data;
    return res;
  }) as typeof res.end;
  return { res, body: () => body, status: () => status };
}

function signedRequest(rawBody: string, deliveryId: string, secret = SECRET): http.IncomingMessage {
  const req = new EventEmitter() as unknown as http.IncomingMessage & { headers: Record<string, string> };
  req.headers = {
    [GITHUB_SIGNATURE_HEADER]: computeGitHubSignature(secret, rawBody),
    [GITHUB_EVENT_HEADER]: 'workflow_run',
    [GITHUB_DELIVERY_HEADER]: deliveryId,
  };
  queueMicrotask(() => {
    req.emit('data', Buffer.from(rawBody));
    req.emit('end');
  });
  return req;
}

async function harness() {
  const db = new SQL.Database();
  migrate(db, ORCHESTRATION_MANIFEST, {});
  const tasks = new TaskStore(db as never);
  const [task] = await tasks.createMany('plan-webhook', [
    {
      planId: 'plan-webhook',
      summary: 'webhook e2e',
      description: '',
      files: [],
      dependencies: [],
      effort: 'small',
      requiredCapabilities: [],
    },
  ]);
  await tasks.markStarted(task.id);
  const records: CIRecordStores = {
    observations: new InMemoryCIObservationStore(),
    decisions: new InMemoryCIDecisionStore(),
    findings: new InMemoryCIFindingStore(),
    notifications: new InMemoryCINotificationStore(),
    pushes: new InMemoryCIGovernedPushStore(),
    checkStates: new InMemoryCICheckStateStore(),
  };
  const coordinator = createCICoordinator(tasks);
  await coordinator.beginExternalVerificationWait({
    taskId: task.id,
    verifier: 'ci',
    waitRef: `ci-corr:${REPO}:${COMMIT}:${task.id}`,
    repository: REPO,
    commitSha: COMMIT,
    branch: 'vestara/task-webhook',
    provider: 'github-actions',
    suspendedAt: '2026-09-16T00:00:00.000Z',
  });
  const ctx = { orchestrationTasks: tasks, ciRecords: records } as unknown as WorkspaceContext;
  return { tasks, taskId: task.id, records, ctx };
}

describe('GitHub CI webhook — HTTP boundary (CI-OBS-001 acceptance)', () => {
  it('verifies the HMAC, completes, persists, and resumes the originating task', async () => {
    const { tasks, taskId, records, ctx } = await harness();
    const rawBody = JSON.stringify({ action: 'completed', workflow_run: workflowRun() });
    const { res, body, status } = fakeResponse();

    const handled = await handleGitHubCIRoute(
      'POST',
      '/api/github/webhook',
      signedRequest(rawBody, 'delivery-1'),
      res,
      ctx,
      3001,
      new URL('http://127.0.0.1:3001/api/github/webhook'),
    );

    expect(handled).toBe(true);
    expect(status()).toBe(202);
    expect(body().accepted).toBe(true);
    expect(body().resumed).toBe(true);
    expect(body().resumeAllowed).toBe(true);
    expect(body().designatedWorkflow).toBe(true);

    const resumed = await tasks.get(taskId);
    expect(resumed?.status).toBe('in-progress');
    expect(resumed?.externalWait?.resumedAt).toBeTruthy();
    expect((await records.observations!.latest())?.commitSha).toBe(COMMIT);
    expect((await records.notifications!.recent()).length).toBe(1);
  });

  it('deduplicates a repeated delivery without a second observation', async () => {
    const { records, ctx } = await harness();
    const rawBody = JSON.stringify({ action: 'completed', workflow_run: workflowRun() });

    const first = fakeResponse();
    await handleGitHubCIRoute(
      'POST',
      '/api/github/webhook',
      signedRequest(rawBody, 'delivery-2'),
      first.res,
      ctx,
      3001,
      new URL('http://x/api/github/webhook'),
    );
    expect(first.status()).toBe(202);

    const second = fakeResponse();
    await handleGitHubCIRoute(
      'POST',
      '/api/github/webhook',
      signedRequest(rawBody, 'delivery-2'),
      second.res,
      ctx,
      3001,
      new URL('http://x/api/github/webhook'),
    );
    expect(second.status()).toBe(202);
    expect(second.body().accepted).toBe(false);
    expect(second.body().reason).toBe('duplicate-delivery');
    // Exactly one observation was ever recorded.
    expect((await records.observations!.findByCommit(COMMIT)).length).toBe(1);
  });

  it('resumes only after every required workflow reports (H3 aggregation)', async () => {
    process.env.VESTARA_CI_REQUIRED_WORKFLOWS = 'CI,desktop-build';
    const { tasks, taskId, ctx } = await harness();
    const url = new URL('http://x/api/github/webhook');
    try {
      const first = fakeResponse();
      await handleGitHubCIRoute(
        'POST',
        '/api/github/webhook',
        signedRequest(JSON.stringify({ action: 'completed', workflow_run: workflowRun({ name: 'CI' }) }), 'agg-1'),
        first.res,
        ctx,
        3001,
        url,
      );
      // One of two required workflows: still pending, so no resume.
      expect(first.body().aggregateState).toBe('pending');
      expect(first.body().resumed).toBe(false);
      expect((await tasks.get(taskId))?.status).toBe('awaiting-verification');

      const second = fakeResponse();
      await handleGitHubCIRoute(
        'POST',
        '/api/github/webhook',
        signedRequest(
          JSON.stringify({ action: 'completed', workflow_run: workflowRun({ name: 'desktop-build' }) }),
          'agg-2',
        ),
        second.res,
        ctx,
        3001,
        url,
      );
      // Both required workflows are terminal; the task resumes.
      expect(second.body().aggregateState).toBe('failed');
      expect(second.body().resumed).toBe(true);
      expect((await tasks.get(taskId))?.status).toBe('in-progress');
    } finally {
      delete process.env.VESTARA_CI_REQUIRED_WORKFLOWS;
    }
  });

  it('rejects an untrusted signature before any inspection', async () => {
    const { records, ctx } = await harness();
    const rawBody = JSON.stringify({ action: 'completed', workflow_run: workflowRun() });
    const { res, body, status } = fakeResponse();
    await handleGitHubCIRoute(
      'POST',
      '/api/github/webhook',
      signedRequest(rawBody, 'delivery-3', 'wrong-secret'),
      res,
      ctx,
      3001,
      new URL('http://x/api/github/webhook'),
    );
    expect(status()).toBe(401);
    expect(body().reason).toBe('invalid-signature');
    expect(await records.observations!.latest()).toBeUndefined();
  });
});
