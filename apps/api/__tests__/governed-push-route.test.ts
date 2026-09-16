import { EventEmitter } from 'node:events';
import type * as http from 'node:http';
import { describe, expect, it } from 'vitest';
import { handleOrchestrationRoute } from '../src/routes/orchestration.js';
import type { WorkspaceContext } from '../src/workspace-context.js';

function fakeContext(task: unknown): WorkspaceContext {
  return {
    repoPath: '/tmp/vestara-governed-push-route',
    orchestrationTasks: {
      get: async () => task,
      updateStatus: async () => task,
    },
  } as unknown as WorkspaceContext;
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

function fakeRequest(body?: unknown): http.IncomingMessage {
  const req = new EventEmitter() as unknown as http.IncomingMessage & { method: string; url: string };
  req.method = 'POST';
  req.url = '/api/orchestration/projects/p1/tasks/t1/push';
  req.headers = {};
  queueMicrotask(() => {
    if (body !== undefined) req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  });
  return req;
}

const PATH = '/api/orchestration/projects/p1/tasks/t1/push';

describe('governed push route', () => {
  it('rejects a request without commitMessage and paths', async () => {
    const { res, body, status } = fakeResponse();
    const handled = await handleOrchestrationRoute('POST', PATH, fakeRequest({}), res, fakeContext(null));
    expect(handled).toBe(true);
    expect(status()).toBe(400);
    expect((body() as { error: string }).error).toContain('commitMessage');
  });

  it('returns 404 for an unknown task', async () => {
    const { res, status } = fakeResponse();
    await handleOrchestrationRoute(
      'POST',
      PATH,
      fakeRequest({ commitMessage: 'feat: x', paths: ['a.ts'] }),
      res,
      fakeContext(null),
    );
    expect(status()).toBe(404);
  });

  it('holds (409) when the task is not in-progress', async () => {
    const { res, body, status } = fakeResponse();
    await handleOrchestrationRoute(
      'POST',
      PATH,
      fakeRequest({ commitMessage: 'feat: x', paths: ['a.ts'] }),
      res,
      fakeContext({ id: 't1', status: 'assigned' }),
    );
    expect(status()).toBe(409);
    const result = (body() as { result: { status: string; reason?: string } }).result;
    expect(result.status).toBe('hold');
    expect(result.reason).toContain('assigned');
  });
});
