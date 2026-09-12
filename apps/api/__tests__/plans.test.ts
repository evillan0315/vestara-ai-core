import { EventEmitter } from 'node:events';
import type * as http from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
// The route handler is exercised against its compiled output: `routes/types.ts`
// calls `require('../auth')`, which does not exist in vitest's ESM transform.
import { handlePlansRoute } from '../dist/routes/plans.js';
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
  const plansStore: Record<string, { id: string; title: string; goal: string; status: string; updatedAt: string }> = {};

  return {
    runtime: {
      getSession: () => ({
        fingerprint: { id: 'ws-test' },
      }),
    },
    planningService: {
      createPlan: vi.fn(async (goal: string) => {
        const id = `plan-${Date.now()}`;
        const plan = {
          id,
          title: goal.slice(0, 50),
          goal,
          status: 'draft',
          tasks: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        plansStore[id] = plan;
        return { plan };
      }),
      updatePlanStatus: vi.fn(async (id: string, status: string) => {
        const plan = plansStore[id];
        if (!plan) return null;
        plan.status = status;
        return plan;
      }),
    },
    plans: {
      list: vi.fn(async () => Object.values(plansStore)),
      get: vi.fn(async (id: string) => plansStore[id] ?? null),
      save: vi.fn(async (plan: { id: string }) => {
        plansStore[plan.id] = plan;
      }),
      delete: vi.fn(async (id: string) => {
        delete plansStore[id];
      }),
    },
    changeSets: {
      listByWorkspace: vi.fn(async () => []),
      get: vi.fn(async () => null),
    },
    verifications: {
      listByWorkspace: vi.fn(async () => []),
    },
    verificationService: {
      verify: vi.fn(async () => ({ id: 'vr-1', status: 'passed', checks: [] })),
    },
    implementationService: {
      implement: vi.fn(async () => ({
        changeSet: { id: 'cs-1', title: 'ChangeSet', files: [] },
      })),
      apply: vi.fn(async () => ({ id: 'cs-1', title: 'Applied', status: 'applied' })),
    },
    suggestionService: {
      planRecommendations: vi.fn(async () => 'No recommendations'),
    },
    collaborationService: {
      submit: vi.fn(async () => ({ id: 'collab-1', status: 'submitted' })),
      approve: vi.fn(async () => ({ id: 'collab-1', status: 'approved' })),
      reject: vi.fn(async () => ({ id: 'collab-1', status: 'rejected' })),
      comment: vi.fn(async (_recordId: string, _author: string, message: string) => ({ id: 'comment-1', message })),
    },
    audit: { log: vi.fn() },
    users: {
      findByToken: vi.fn(() => ({ id: 'user-1', username: 'admin', role: 'admin' })),
    },
    ...overrides,
  } as unknown as WorkspaceContext;
}

afterEach(() => {});

describe('plans routes', () => {
  it('GET /api/plans returns empty list initially', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handlePlansRoute('GET', '/api/plans', fakeRequest('GET', '/api/plans'), res, ctx);
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const result = body() as { plans: unknown[] };
    expect(result.plans).toEqual([]);
  });

  it('POST /api/plans creates a plan with goal', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handlePlansRoute(
      'POST',
      '/api/plans',
      fakeRequest('POST', '/api/plans', JSON.stringify({ goal: 'Implement feature X' })),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(201);
    const result = body() as { plan: { id: string; goal: string } };
    expect(result.plan.id).toBeTruthy();
    expect(result.plan.goal).toBe('Implement feature X');
  });

  it('POST /api/plans returns 400 when goal is missing', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handlePlansRoute(
      'POST',
      '/api/plans',
      fakeRequest('POST', '/api/plans', JSON.stringify({})),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(400);
    expect((body() as { error: string }).error).toBe('goal is required');
  });

  it('PUT /api/plans/:id updates a plan', async () => {
    const ctx = makeMockCtx();
    const created = await (ctx.planningService as any).createPlan('Test goal');
    const planId = created.plan.id;

    const { res, body, status } = fakeResponse();
    const handled = await handlePlansRoute(
      'PUT',
      `/api/plans/${planId}`,
      fakeRequest('PUT', `/api/plans/${planId}`, JSON.stringify({ title: 'Updated Title', status: 'active' })),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const result = body() as { plan: { title: string; status: string } };
    expect(result.plan.title).toBe('Updated Title');
    expect(result.plan.status).toBe('active');
  });

  it('PUT /api/plans/:id returns 404 for missing plan', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handlePlansRoute(
      'PUT',
      '/api/plans/nonexistent',
      fakeRequest('PUT', '/api/plans/nonexistent', JSON.stringify({ title: 'x' })),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(404);
    expect((body() as { error: string }).error).toBe('plan not found');
  });

  it('DELETE /api/plans/:id deletes a plan', async () => {
    const ctx = makeMockCtx();
    const created = await (ctx.planningService as any).createPlan('To delete');
    const planId = created.plan.id;

    const { res, status } = fakeResponse();
    const handled = await handlePlansRoute(
      'DELETE',
      `/api/plans/${planId}`,
      fakeRequest('DELETE', `/api/plans/${planId}`),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
  });

  it('DELETE /api/plans/:id returns 404 for missing plan', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handlePlansRoute(
      'DELETE',
      '/api/plans/ghost',
      fakeRequest('DELETE', '/api/plans/ghost'),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(404);
    expect((body() as { error: string }).error).toBe('plan not found');
  });

  it('POST /api/plans/:id/approve approves a plan', async () => {
    const ctx = makeMockCtx();
    const created = await (ctx.planningService as any).createPlan('Approve me');
    const planId = created.plan.id;

    const { res, body, status } = fakeResponse();
    const handled = await handlePlansRoute(
      'POST',
      `/api/plans/${planId}/approve`,
      fakeRequest('POST', `/api/plans/${planId}/approve`),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const result = body() as { plan: { status: string } };
    expect(result.plan.status).toBe('approved');
  });

  it('POST /api/implement creates a changeset from a plan', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handlePlansRoute(
      'POST',
      '/api/implement',
      fakeRequest('POST', '/api/implement', JSON.stringify({ planId: 'plan-1' })),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(201);
    const result = body() as { changeSet: { id: string } };
    expect(result.changeSet.id).toBe('cs-1');
  });

  it('POST /api/implement returns 400 when planId is missing', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handlePlansRoute(
      'POST',
      '/api/implement',
      fakeRequest('POST', '/api/implement', JSON.stringify({})),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(400);
    expect((body() as { error: string }).error).toBe('planId is required');
  });

  it('GET /api/changesets lists changesets', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handlePlansRoute('GET', '/api/changesets', fakeRequest('GET', '/api/changesets'), res, ctx);
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const result = body() as { changeSets: unknown[] };
    expect(result.changeSets).toEqual([]);
  });

  it('GET /api/changesets/:id returns 404 for missing changeset', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handlePlansRoute(
      'GET',
      '/api/changesets/nonexistent',
      fakeRequest('GET', '/api/changesets/nonexistent'),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(404);
    expect((body() as { error: string }).error).toBe('change set not found');
  });

  it('POST /api/verify verifies a changeset', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handlePlansRoute(
      'POST',
      '/api/verify',
      fakeRequest('POST', '/api/verify', JSON.stringify({ changeSetId: 'cs-1' })),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const result = body() as { status: string };
    expect(result.status).toBe('passed');
  });

  it('POST /api/verify returns 400 when changeSetId is missing', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handlePlansRoute(
      'POST',
      '/api/verify',
      fakeRequest('POST', '/api/verify', JSON.stringify({})),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(400);
    expect((body() as { error: string }).error).toBe('changeSetId is required');
  });

  it('GET /api/verifications lists verifications', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handlePlansRoute(
      'GET',
      '/api/verifications',
      fakeRequest('GET', '/api/verifications'),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const result = body() as { verifications: unknown[] };
    expect(result.verifications).toEqual([]);
  });

  it('POST /api/collab/submit submits a collaboration record', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handlePlansRoute(
      'POST',
      '/api/collab/submit',
      fakeRequest('POST', '/api/collab/submit', JSON.stringify({ changeSetId: 'cs-1', planId: 'plan-1' })),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(201);
    const result = body() as { record: { id: string } };
    expect(result.record.id).toBe('collab-1');
  });

  it('POST /api/collab/submit returns 400 when required fields are missing', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handlePlansRoute(
      'POST',
      '/api/collab/submit',
      fakeRequest('POST', '/api/collab/submit', JSON.stringify({})),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(400);
    expect((body() as { error: string }).error).toBe('changeSetId and planId are required');
  });

  it('POST /api/collab/approve approves a collaboration record', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handlePlansRoute(
      'POST',
      '/api/collab/approve',
      fakeRequest('POST', '/api/collab/approve', JSON.stringify({ recordId: 'collab-1', comment: 'LGTM' })),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const result = body() as { record: { status: string } };
    expect(result.record.status).toBe('approved');
  });

  it('POST /api/collab/reject rejects a collaboration record', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handlePlansRoute(
      'POST',
      '/api/collab/reject',
      fakeRequest('POST', '/api/collab/reject', JSON.stringify({ recordId: 'collab-1', reason: 'Needs changes' })),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const result = body() as { record: { status: string } };
    expect(result.record.status).toBe('rejected');
  });

  it('POST /api/collab/comment adds a comment', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handlePlansRoute(
      'POST',
      '/api/collab/comment',
      fakeRequest('POST', '/api/collab/comment', JSON.stringify({ recordId: 'collab-1', message: 'Great work!' })),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(201);
    const result = body() as { comment: { message: string } };
    expect(result.comment.message).toBe('Great work!');
  });

  it('POST /api/collab/comment returns 400 when required fields are missing', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handlePlansRoute(
      'POST',
      '/api/collab/comment',
      fakeRequest('POST', '/api/collab/comment', JSON.stringify({})),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(400);
    expect((body() as { error: string }).error).toBe('recordId and message are required');
  });

  it('returns false for unmatched routes', async () => {
    const ctx = makeMockCtx();
    const { res } = fakeResponse();
    const handled = await handlePlansRoute('GET', '/api/unknown', fakeRequest('GET', '/api/unknown'), res, ctx);
    expect(handled).toBe(false);
  });

  it('POST /api/implement/apply applies a changeset', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handlePlansRoute(
      'POST',
      '/api/implement/apply',
      fakeRequest('POST', '/api/implement/apply', JSON.stringify({ changeSetId: 'cs-1' })),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const result = body() as { changeSet: { title: string } };
    expect(result.changeSet.title).toBe('Applied');
  });

  it('POST /api/implement/apply returns 400 when changeSetId is missing', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handlePlansRoute(
      'POST',
      '/api/implement/apply',
      fakeRequest('POST', '/api/implement/apply', JSON.stringify({})),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(400);
    expect((body() as { error: string }).error).toBe('changeSetId is required');
  });

  it('GET /api/plans/:id/recommendations returns plan recommendations', async () => {
    const ctx = makeMockCtx();
    const created = await (ctx.planningService as any).createPlan('Get recommendations');
    const planId = created.plan.id;

    const { res, body, status } = fakeResponse();
    const handled = await handlePlansRoute(
      'GET',
      `/api/plans/${planId}/recommendations`,
      fakeRequest('GET', `/api/plans/${planId}/recommendations`),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const result = body() as { recommendations: string };
    expect(result.recommendations).toBe('No recommendations');
  });
});
