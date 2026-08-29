import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import type * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { handleQualificationRoute } from '../src/routes/qualification';
import type { WorkspaceContext } from '../src/workspace-context';

let root: string | undefined;

afterEach(() => {
  if (root) fs.rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function seedReport(profileId: string, modelId: string): void {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-qual-'));
  const dir = path.join(root, 'stage', 'wfo-e2e-002b-live');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'report-1.json'),
    JSON.stringify({
      generatedAt: '2026-08-06T00:00:00.000Z',
      repositorySha: 'repo-sha',
      contextHash: 'ctx-hash',
      profiles: [
        {
          profileId,
          outcome: 'awaiting-human-approval',
          credentialResolved: true,
          identity: {
            providerId: 'opencode-go',
            modelId,
            repositorySha: 'repo-sha',
            contextHash: 'ctx-hash',
            promptTemplateVersion: 'v1',
          },
          execution: {
            callCount: 4,
            retryCount: 2,
            totalInputTokens: 5441,
            totalOutputTokens: 8247,
            totalDurationMs: 293633,
            providerStatuses: ['completed'],
            controls: { status: 'continue', reasons: [] },
          },
          planner: {
            schemaValidFirstAttempt: false,
            versions: [{ version: 1, planHash: 'a'.repeat(64) }],
            plan: {
              summary: 'Plan',
              steps: [],
              affectedPaths: ['src'],
              outOfScope: [],
              requiredApprovals: [],
              risks: [],
              completionCriteria: [],
            },
            materialProgress: true,
          },
          reviewer: { review: { conclusion: 'approved', findings: [], evidenceRefs: [] }, materialProgress: true },
          workflowResult: {
            conclusion: 'awaiting-human-approval',
            stoppedBeforeExecution: true,
            reasons: [],
            evidenceRefs: [],
          },
          invocations: [],
        },
      ],
    }),
  );
}

function ctx(runner?: (profileId: string) => Promise<void>): WorkspaceContext {
  return { repoPath: root ?? '', qualificationLiveRunner: runner } as unknown as WorkspaceContext;
}

function fakeResponse(): { res: http.ServerResponse; body: () => unknown; status: () => number } {
  let status = 0;
  let body: unknown = null;
  const res = new EventEmitter() as unknown as http.ServerResponse;
  res.writeHead = (code: number) => {
    status = code;
    return res as unknown as http.ServerResponse;
  };
  res.end = (data?: unknown) => {
    body = typeof data === 'string' ? JSON.parse(data) : data;
    return res as unknown as http.ServerResponse;
  };
  return { res, body: () => body, status: () => status };
}

function fakeRequest(): http.IncomingMessage {
  const req = new EventEmitter() as unknown as http.IncomingMessage;
  req.headers = {};
  req.url = '';
  queueMicrotask(() => req.emit('end'));
  return req;
}

function fakePostRequest(body: unknown): http.IncomingMessage {
  const req = new EventEmitter() as unknown as http.IncomingMessage;
  req.headers = {};
  req.url = '';
  queueMicrotask(() => {
    req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  });
  return req;
}

describe('qualification routes', () => {
  it('lists the recorded live trials', async () => {
    seedReport('deepseekV4FlashOpenCodeGo', 'deepseek-v4-flash');
    const { res, body, status } = fakeResponse();
    const handled = await handleQualificationRoute('GET', '/api/qualification/trials', fakeRequest(), res, ctx());
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const result = body() as { trials: Array<{ profileId: string; outcome: string }>; repositorySha: string };
    expect(result.trials).toHaveLength(1);
    expect(result.trials[0]?.profileId).toBe('deepseekV4FlashOpenCodeGo');
    expect(result.trials[0]?.outcome).toBe('awaiting-human-approval');
    expect(result.repositorySha).toBe('repo-sha');
  });

  it('returns a single trial by profile id', async () => {
    seedReport('mimoV25OpenCodeGo', 'mimo-v2.5');
    const { res, body, status } = fakeResponse();
    const handled = await handleQualificationRoute(
      'GET',
      '/api/qualification/trials/mimoV25OpenCodeGo',
      fakeRequest(),
      res,
      ctx(),
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const result = body() as {
      trial: { identity: { modelId: string }; workflowResult: { stoppedBeforeExecution: boolean } };
    };
    expect(result.trial.identity.modelId).toBe('mimo-v2.5');
    expect(result.trial.workflowResult.stoppedBeforeExecution).toBe(true);
  });

  it('returns 404 for an unknown profile', async () => {
    seedReport('deepseekV4FlashOpenCodeGo', 'deepseek-v4-flash');
    const { res, status } = fakeResponse();
    await handleQualificationRoute('GET', '/api/qualification/trials/unknown-profile', fakeRequest(), res, ctx());
    expect(status()).toBe(404);
  });

  it('returns an empty list when no reports exist', async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-qual-empty-'));
    const { res, body, status } = fakeResponse();
    await handleQualificationRoute('GET', '/api/qualification/trials', fakeRequest(), res, ctx());
    expect(status()).toBe(200);
    expect((body() as { trials: unknown[] }).trials).toEqual([]);
  });

  it('starts a live trial and returns 202', async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-qual-run-'));
    const calls: string[] = [];
    const { res, body, status } = fakeResponse();
    await handleQualificationRoute(
      'POST',
      '/api/qualification/run',
      fakePostRequest({}),
      res,
      ctx(async (profileId) => void calls.push(profileId)),
    );
    expect(status()).toBe(202);
    expect((body() as { started: boolean; profileId: string }).started).toBe(true);
    expect(calls).toEqual(['deepseekV4FlashOpenCodeGo']);
  });

  it('rejects an unknown qualification profile', async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-qual-run-'));
    const { res, status } = fakeResponse();
    await handleQualificationRoute(
      'POST',
      '/api/qualification/run',
      fakePostRequest({ profileId: 'unknown-profile' }),
      res,
      ctx(async () => undefined),
    );
    expect(status()).toBe(400);
  });

  it('reports a controlled failure when the live runner throws', async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-qual-run-'));
    const { res, status } = fakeResponse();
    await handleQualificationRoute(
      'POST',
      '/api/qualification/run',
      fakePostRequest({}),
      res,
      ctx(async () => {
        throw new Error('credentials unavailable');
      }),
    );
    expect(status()).toBe(503);
  });
});
