import { EventEmitter } from 'node:events';
import type * as http from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
// The route handler is exercised against its compiled output: `routes/types.ts`
// calls `require('../auth')`, which does not exist in vitest's ESM transform.
import { handleSessionsRoute } from '../dist/routes/sessions.js';
import type { WorkspaceContext } from '../src/workspace-context.js';

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

function fakeRequest(method: string, url: string, body?: string): http.IncomingMessage {
  const req = new EventEmitter() as unknown as http.IncomingMessage & {
    method: string;
    url: string;
    headers: Record<string, string>;
  };
  req.method = method;
  req.url = url;
  req.headers = {};
  if (body) {
    queueMicrotask(() => {
      req.emit('data', Buffer.from(body));
      req.emit('end');
    });
  } else {
    queueMicrotask(() => req.emit('end'));
  }
  return req;
}

function makeMockCtx(overrides: Record<string, unknown> = {}): WorkspaceContext {
  const sessionsStore: Record<string, any> = {};
  const eventsStore: Record<string, any[]> = {};
  const executionSessions: Record<string, any> = {};

  return {
    runtime: {
      getSession: () => ({
        fingerprint: { id: 'ws-test' },
      }),
    },
    sessions: {
      listSessions: vi.fn(async () => Object.values(sessionsStore)),
      createSession: vi.fn(async (title: string, objective: string) => {
        const id = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`;
        const session = {
          id,
          title,
          objective,
          status: 'created',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        sessionsStore[id] = session;
        eventsStore[id] = [];
        return session;
      }),
      getSession: vi.fn(async (id: string) => sessionsStore[id] ?? null),
      getEvents: vi.fn(async (id: string) => eventsStore[id] ?? []),
    },
    agents: {
      listExecutionSessions: vi.fn(async () => Object.values(executionSessions)),
      getExecutionSession: vi.fn(async (id: string) => executionSessions[id] ?? null),
      saveExecutionSession: vi.fn(async (session: any) => {
        executionSessions[session.id] = session;
      }),
      updateExecutionSessionStatus: vi.fn(async (id: string, status: string) => {
        if (executionSessions[id]) executionSessions[id].status = status;
      }),
      updateExecutionSessionTimeline: vi.fn(async (id: string, timeline: any[]) => {
        if (executionSessions[id]) executionSessions[id].timeline = timeline;
      }),
    },
    orchestrator: {
      listWorkflows: vi.fn(() => [{ id: 'wf-1', label: 'Test Workflow', steps: 3 }]),
      startSession: vi.fn(async (goal: string, workflowId: string) => ({
        id: `exs-${Date.now()}`,
        goal,
        workflowId,
        status: 'queued',
        assignedAgentIds: [],
        planIds: [],
        changeSetIds: [],
        verificationIds: [],
        logs: [],
        timeline: [],
        approvals: [],
        metrics: { duration: 0, totalSteps: 0, completedSteps: 0, artifactCount: 0 },
        createdAt: new Date().toISOString(),
      })),
      runBackgroundServices: vi.fn(async () => {}),
    },
    ...overrides,
  } as unknown as WorkspaceContext;
}

afterEach(() => {});

describe('sessions routes', () => {
  it('GET /api/sessions returns empty list initially', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handleSessionsRoute(
      'GET',
      '/api/sessions',
      fakeRequest('GET', '/api/sessions'),
      res,
      ctx,
      3001,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const result = body() as { sessions: unknown[] };
    expect(result.sessions).toEqual([]);
  });

  it('POST /api/sessions creates a session', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handleSessionsRoute(
      'POST',
      '/api/sessions',
      fakeRequest('POST', '/api/sessions', JSON.stringify({ title: 'My Session', objective: 'Build feature' })),
      res,
      ctx,
      3001,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(201);
    const result = body() as { session: { id: string; title: string; objective: string } };
    expect(result.session.id).toBeTruthy();
    expect(result.session.title).toBe('My Session');
    expect(result.session.objective).toBe('Build feature');
  });

  it('POST /api/sessions defaults title to "Untitled session" when empty', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handleSessionsRoute(
      'POST',
      '/api/sessions',
      fakeRequest('POST', '/api/sessions', JSON.stringify({})),
      res,
      ctx,
      3001,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(201);
    const result = body() as { session: { title: string } };
    expect(result.session.title).toBe('Untitled session');
  });

  it('GET /api/sessions/:id returns session detail with events', async () => {
    const ctx = makeMockCtx();
    const created = await (ctx.sessions as any).createSession('Detail', 'Test');

    const { res, body, status } = fakeResponse();
    const handled = await handleSessionsRoute(
      'GET',
      `/api/sessions/${created.id}`,
      fakeRequest('GET', `/api/sessions/${created.id}`),
      res,
      ctx,
      3001,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const result = body() as { session: { id: string; title: string }; events: unknown[] };
    expect(result.session.id).toBe(created.id);
    expect(result.session.title).toBe('Detail');
    expect(result.events).toEqual([]);
  });

  it('GET /api/sessions/:id returns 404 for missing session', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handleSessionsRoute(
      'GET',
      '/api/sessions/nonexistent',
      fakeRequest('GET', '/api/sessions/nonexistent'),
      res,
      ctx,
      3001,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(404);
    expect((body() as { error: string }).error).toBe('session not found');
  });

  it('GET /api/sessions/executions lists execution sessions', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handleSessionsRoute(
      'GET',
      '/api/sessions/executions',
      fakeRequest('GET', '/api/sessions/executions'),
      res,
      ctx,
      3001,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const result = body() as { sessions: unknown[] };
    expect(result.sessions).toEqual([]);
  });

  it('POST /api/sessions/executions creates an execution session', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handleSessionsRoute(
      'POST',
      '/api/sessions/executions',
      fakeRequest('POST', '/api/sessions/executions', JSON.stringify({ goal: 'Run tests', workflowId: 'wf-1' })),
      res,
      ctx,
      3001,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(201);
    const result = body() as { session: { id: string; goal: string; status: string } };
    expect(result.session.id).toBeTruthy();
    expect(result.session.goal).toBe('Run tests');
    expect(result.session.status).toBe('queued');
  });

  it('GET /api/sessions/executions/:id returns execution session detail', async () => {
    const ctx = makeMockCtx();
    const { res: createRes, body: createBody } = fakeResponse();
    await handleSessionsRoute(
      'POST',
      '/api/sessions/executions',
      fakeRequest('POST', '/api/sessions/executions', JSON.stringify({ goal: 'Detail test' })),
      createRes,
      ctx,
      3001,
    );
    const created = (createBody() as { session: { id: string } }).session;

    const { res, body, status } = fakeResponse();
    const handled = await handleSessionsRoute(
      'GET',
      `/api/sessions/executions/${created.id}`,
      fakeRequest('GET', `/api/sessions/executions/${created.id}`),
      res,
      ctx,
      3001,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const result = body() as { session: { id: string; goal: string } };
    expect(result.session.id).toBe(created.id);
  });

  it('GET /api/sessions/executions/:id returns 404 for missing execution', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handleSessionsRoute(
      'GET',
      '/api/sessions/executions/nonexistent',
      fakeRequest('GET', '/api/sessions/executions/nonexistent'),
      res,
      ctx,
      3001,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(404);
    expect((body() as { error: string }).error).toBe('execution session not found');
  });

  it('PATCH /api/sessions/executions/:id updates status and timeline', async () => {
    const ctx = makeMockCtx();
    const { res: createRes, body: createBody } = fakeResponse();
    await handleSessionsRoute(
      'POST',
      '/api/sessions/executions',
      fakeRequest('POST', '/api/sessions/executions', JSON.stringify({ goal: 'Update test' })),
      createRes,
      ctx,
      3001,
    );
    const created = (createBody() as { session: { id: string } }).session;

    const { res, body, status } = fakeResponse();
    const handled = await handleSessionsRoute(
      'PATCH',
      `/api/sessions/executions/${created.id}`,
      fakeRequest(
        'PATCH',
        `/api/sessions/executions/${created.id}`,
        JSON.stringify({ status: 'running', timeline: [{ step: 1, startedAt: new Date().toISOString() }] }),
      ),
      res,
      ctx,
      3001,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const result = body() as { session: { status: string } };
    expect(result.session).toBeDefined();
  });

  it('GET /api/workflows lists available workflows', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handleSessionsRoute(
      'GET',
      '/api/workflows',
      fakeRequest('GET', '/api/workflows'),
      res,
      ctx,
      3001,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const result = body() as { workflows: Array<{ id: string; label: string }> };
    expect(result.workflows).toHaveLength(1);
    expect(result.workflows[0].id).toBe('wf-1');
  });

  it('POST /api/sessions/executions/start starts a workflow session', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handleSessionsRoute(
      'POST',
      '/api/sessions/executions/start',
      fakeRequest('POST', '/api/sessions/executions/start', JSON.stringify({ goal: 'Ship feature', workflow: 'wf-1' })),
      res,
      ctx,
      3001,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(201);
    const result = body() as { session: { id: string; goal: string } };
    expect(result.session.id).toBeTruthy();
    expect(result.session.goal).toBe('Ship feature');
  });

  it('POST /api/sessions/executions/start returns 400 when goal or workflow is missing', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handleSessionsRoute(
      'POST',
      '/api/sessions/executions/start',
      fakeRequest('POST', '/api/sessions/executions/start', JSON.stringify({ goal: 'Ship feature' })),
      res,
      ctx,
      3001,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(400);
    expect((body() as { error: string }).error).toBe('goal and workflow are required');
  });

  it('POST /api/background/run runs background services', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handleSessionsRoute(
      'POST',
      '/api/background/run',
      fakeRequest('POST', '/api/background/run'),
      res,
      ctx,
      3001,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const result = body() as { ok: boolean };
    expect(result.ok).toBe(true);
  });

  it('returns false for unmatched routes', async () => {
    const ctx = makeMockCtx();
    const { res } = fakeResponse();
    const handled = await handleSessionsRoute(
      'GET',
      '/api/unknown',
      fakeRequest('GET', '/api/unknown'),
      res,
      ctx,
      3001,
    );
    expect(handled).toBe(false);
  });
});
