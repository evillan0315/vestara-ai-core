import { EventEmitter } from 'node:events';
import type * as http from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
// The route handler is exercised against its compiled output: `routes/types.ts`
// calls `require('../auth')`, which does not exist in vitest's ESM transform.
import { handleRoutingRoute } from '../dist/routes/routing.js';
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
  return {
    runtime: {
      getSession: () => ({
        fingerprint: { id: 'ws-test' },
      }),
    },
    providerManager: {
      routing: {
        catalog: {
          list: vi.fn(() => [
            {
              ref: { providerId: 'opencode', modelId: 'model-a' },
              availability: { available: true },
              name: 'Model A',
            },
            {
              ref: { providerId: 'opencode', modelId: 'model-b' },
              availability: { available: false },
              name: 'Model B',
            },
          ]),
        },
        health: {},
        resolve: vi.fn(async () => ({
          ref: { providerId: 'opencode', modelId: 'model-a' },
          role: 'developer',
          agentId: 'agent-1',
          profileId: 'balanced',
          source: 'automatic',
          latency: 100,
          confidence: 0.95,
        })),
      },
    },
    routingStore: {
      get: vi.fn(() => ({
        revision: 1,
        updatedByClientId: 'system',
        updatedAt: new Date().toISOString(),
        selection: {
          profileId: 'balanced',
          roles: {
            planner: { providerId: 'opencode', modelId: 'model-a' },
            developer: { providerId: 'opencode', modelId: 'model-a' },
            reviewer: { providerId: 'opencode', modelId: 'model-a' },
          },
        },
      })),
      update: vi.fn((selection: any, revision: number) => ({
        revision: revision + 1,
        updatedByClientId: 'workspace-ui',
        updatedAt: new Date().toISOString(),
        selection,
      })),
    },
    routingAssignments: {
      list: vi.fn(() => []),
      assign: vi.fn((input: any) => ({
        taskId: input.taskId,
        role: input.role,
        agentId: input.agentId,
        route: input.route,
        assignedByClientId: input.assignedByClientId,
        status: 'assigned',
        revision: 1,
        createdAt: new Date().toISOString(),
      })),
      updateStatus: vi.fn((taskId: string, status: string, revision: number) => ({
        taskId,
        status,
        revision: revision + 1,
        updatedAt: new Date().toISOString(),
      })),
      recordSideEffect: vi.fn((taskId: string, revision: number) => ({
        taskId,
        revision: revision + 1,
        sideEffects: 1,
        updatedAt: new Date().toISOString(),
      })),
      reassign: vi.fn(() => ({
        status: 'reassigned' as const,
        assignment: {
          taskId: 'task-1',
          role: 'developer',
          agentId: 'agent-1',
          route: { providerId: 'opencode', modelId: 'model-a' },
          status: 'assigned',
          revision: 2,
        },
        reasonCodes: [],
      })),
    },
    kernel: {
      eventBus: {
        emit: vi.fn(async () => {}),
      },
    },
    audit: { log: vi.fn() },
    users: {
      findByToken: vi.fn(() => ({ id: 'user-1', username: 'admin', role: 'admin' })),
    },
    ...overrides,
  } as unknown as WorkspaceContext;
}

afterEach(() => {});

describe('routing routes', () => {
  it('GET /api/routing/catalog returns profiles and candidates', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handleRoutingRoute(
      'GET',
      '/api/routing/catalog',
      fakeRequest('GET', '/api/routing/catalog'),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const result = body() as { profiles: any[]; candidates: any[] };
    expect(result.profiles.length).toBeGreaterThan(0);
    expect(result.candidates).toHaveLength(2);
  });

  it('GET /api/routing/selection returns current selection', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handleRoutingRoute(
      'GET',
      '/api/routing/selection',
      fakeRequest('GET', '/api/routing/selection'),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const result = body() as { selection: { profileId: string } };
    expect(result.selection.profileId).toBe('balanced');
  });

  it('PATCH /api/routing/selection updates the selection', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const selection = {
      profileId: 'best-quality',
      roles: {
        planner: { providerId: 'opencode', modelId: 'model-a' },
        developer: { providerId: 'opencode', modelId: 'model-a' },
        reviewer: { providerId: 'opencode', modelId: 'model-a' },
      },
    };
    const handled = await handleRoutingRoute(
      'PATCH',
      '/api/routing/selection',
      fakeRequest('PATCH', '/api/routing/selection', JSON.stringify({ selection, expectedRevision: 1 })),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const result = body() as { revision: number; selection: { profileId: string } };
    expect(result.revision).toBe(2);
    expect(result.selection.profileId).toBe('best-quality');
  });

  it('PATCH /api/routing/selection returns 400 when selection is invalid', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handleRoutingRoute(
      'PATCH',
      '/api/routing/selection',
      fakeRequest('PATCH', '/api/routing/selection', JSON.stringify({ expectedRevision: 1 })),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(400);
    expect((body() as { error: string }).error).toContain('required');
  });

  it('PATCH /api/routing/selection returns 409 on revision conflict', async () => {
    const ctx = makeMockCtx({
      routingStore: {
        get: vi.fn(() => ({
          revision: 2,
          updatedByClientId: 'other',
          updatedAt: new Date().toISOString(),
          selection: { profileId: 'balanced', roles: {} },
        })),
        update: vi.fn(() => {
          const { RoutingConflictError } = require('@vestara/provider-runtime');
          throw new RoutingConflictError(1, {
            revision: 2,
            updatedByClientId: 'other',
            updatedAt: new Date().toISOString(),
            selection: { profileId: 'balanced', roles: {} },
          });
        }),
      },
    });
    const { res, body, status } = fakeResponse();
    const selection = {
      profileId: 'best-quality',
      roles: { developer: { providerId: 'opencode', modelId: 'model-a' } },
    };
    const handled = await handleRoutingRoute(
      'PATCH',
      '/api/routing/selection',
      fakeRequest('PATCH', '/api/routing/selection', JSON.stringify({ selection, expectedRevision: 1 })),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(409);
    const result = body() as { error: string; expectedRevision: number; current: any };
    expect(result.error).toContain('conflict');
    expect(result.expectedRevision).toBe(1);
  });

  it('POST /api/routing/preview resolves a routing candidate', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handleRoutingRoute(
      'POST',
      '/api/routing/preview',
      fakeRequest('POST', '/api/routing/preview', JSON.stringify({ role: 'developer', agentId: 'agent-1' })),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const result = body() as { ref: { providerId: string; modelId: string }; role: string };
    expect(result.ref.providerId).toBe('opencode');
    expect(result.role).toBe('developer');
  });

  it('POST /api/routing/preview returns 400 when role and agentId are missing', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handleRoutingRoute(
      'POST',
      '/api/routing/preview',
      fakeRequest('POST', '/api/routing/preview', JSON.stringify({})),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(400);
    expect((body() as { error: string }).error).toContain('required');
  });

  it('POST /api/routing/preview returns 422 when no compatible candidate exists', async () => {
    const ctx = makeMockCtx({
      providerManager: {
        routing: {
          catalog: {
            list: vi.fn(() => []),
          },
          health: {},
          resolve: vi.fn(async () => {
            const { NoCompatibleRoutingCandidateError } = require('@vestara/provider-runtime');
            throw new NoCompatibleRoutingCandidateError([]);
          }),
        },
      },
    });
    const { res, body, status } = fakeResponse();
    const handled = await handleRoutingRoute(
      'POST',
      '/api/routing/preview',
      fakeRequest('POST', '/api/routing/preview', JSON.stringify({ role: 'developer', agentId: 'agent-1' })),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(422);
    const result = body() as { error: string };
    expect(result.error).toContain('compatible');
  });

  it('GET /api/routing/assignments lists assignments', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handleRoutingRoute(
      'GET',
      '/api/routing/assignments',
      fakeRequest('GET', '/api/routing/assignments'),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const result = body() as { assignments: unknown[] };
    expect(result.assignments).toEqual([]);
  });

  it('POST /api/routing/assignments creates an assignment', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handleRoutingRoute(
      'POST',
      '/api/routing/assignments',
      fakeRequest(
        'POST',
        '/api/routing/assignments',
        JSON.stringify({
          taskId: 'task-1',
          role: 'developer',
          agentId: 'agent-1',
          route: { providerId: 'opencode', modelId: 'model-a' },
        }),
      ),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(201);
    const result = body() as { taskId: string; status: string };
    expect(result.taskId).toBe('task-1');
    expect(result.status).toBe('assigned');
  });

  it('POST /api/routing/assignments returns 400 when required fields are missing', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handleRoutingRoute(
      'POST',
      '/api/routing/assignments',
      fakeRequest('POST', '/api/routing/assignments', JSON.stringify({})),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(400);
    expect((body() as { error: string }).error).toContain('required');
  });

  it('POST /api/routing/assignments returns 422 when provider/model is unavailable', async () => {
    const ctx = makeMockCtx({
      providerManager: {
        routing: {
          catalog: {
            list: vi.fn(() => [
              { ref: { providerId: 'opencode', modelId: 'model-b' }, availability: { available: false } },
            ]),
          },
          health: {},
        },
      },
    });
    const { res, body, status } = fakeResponse();
    const handled = await handleRoutingRoute(
      'POST',
      '/api/routing/assignments',
      fakeRequest(
        'POST',
        '/api/routing/assignments',
        JSON.stringify({
          taskId: 'task-1',
          role: 'developer',
          agentId: 'agent-1',
          route: { providerId: 'opencode', modelId: 'model-b' },
        }),
      ),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(422);
    expect((body() as { error: string }).error).toContain('unavailable');
  });

  it('PATCH /api/routing/assignments/:id/status updates assignment status', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handleRoutingRoute(
      'PATCH',
      '/api/routing/assignments/task-1/status',
      fakeRequest(
        'PATCH',
        '/api/routing/assignments/task-1/status',
        JSON.stringify({ status: 'running', expectedRevision: 1 }),
      ),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const result = body() as { taskId: string; status: string; revision: number };
    expect(result.taskId).toBe('task-1');
    expect(result.status).toBe('running');
  });

  it('PATCH /api/routing/assignments/:id/status returns 400 when status is invalid', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handleRoutingRoute(
      'PATCH',
      '/api/routing/assignments/task-1/status',
      fakeRequest('PATCH', '/api/routing/assignments/task-1/status', JSON.stringify({ expectedRevision: 1 })),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(400);
    expect((body() as { error: string }).error).toContain('required');
  });

  it('POST /api/routing/assignments/:id/side-effects records side effects', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handleRoutingRoute(
      'POST',
      '/api/routing/assignments/task-1/side-effects',
      fakeRequest('POST', '/api/routing/assignments/task-1/side-effects', JSON.stringify({ expectedRevision: 1 })),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const result = body() as { taskId: string; revision: number };
    expect(result.taskId).toBe('task-1');
    expect(result.revision).toBe(2);
  });

  it('POST /api/routing/assignments/:id/reassign reassigns a task', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handleRoutingRoute(
      'POST',
      '/api/routing/assignments/task-1/reassign',
      fakeRequest(
        'POST',
        '/api/routing/assignments/task-1/reassign',
        JSON.stringify({
          expectedRevision: 1,
          agentId: 'agent-2',
          route: { providerId: 'opencode', modelId: 'model-a' },
          reason: 'Load balancing',
        }),
      ),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const result = body() as { status: string; assignment: any };
    expect(result.status).toBe('reassigned');
    expect(result.assignment.taskId).toBe('task-1');
  });

  it('POST /api/routing/assignments/:id/reassign returns 400 when required fields are missing', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handleRoutingRoute(
      'POST',
      '/api/routing/assignments/task-1/reassign',
      fakeRequest('POST', '/api/routing/assignments/task-1/reassign', JSON.stringify({})),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(400);
    expect((body() as { error: string }).error).toContain('required');
  });

  it('POST /api/routing/assignments/:id/reassign returns 422 when new route is unavailable', async () => {
    const ctx = makeMockCtx({
      providerManager: {
        routing: {
          catalog: {
            list: vi.fn(() => [
              { ref: { providerId: 'opencode', modelId: 'model-x' }, availability: { available: false } },
            ]),
          },
          health: {},
        },
      },
    });
    const { res, body, status } = fakeResponse();
    const handled = await handleRoutingRoute(
      'POST',
      '/api/routing/assignments/task-1/reassign',
      fakeRequest(
        'POST',
        '/api/routing/assignments/task-1/reassign',
        JSON.stringify({
          expectedRevision: 1,
          agentId: 'agent-2',
          route: { providerId: 'opencode', modelId: 'model-x' },
          reason: 'Load balancing',
        }),
      ),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(422);
    expect((body() as { error: string }).error).toContain('unavailable');
  });

  it('returns false for unmatched routes', async () => {
    const ctx = makeMockCtx();
    const { res } = fakeResponse();
    const handled = await handleRoutingRoute('GET', '/api/unknown', fakeRequest('GET', '/api/unknown'), res, ctx);
    expect(handled).toBe(false);
  });
});
