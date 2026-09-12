import { EventEmitter } from 'node:events';
import type * as http from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
// The route handler is exercised against its compiled output: `routes/types.ts`
// calls `require('../auth')`, which does not exist in vitest's ESM transform.
import { handleAgentsRoute } from '../dist/routes/agents.js';
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
  const agentsStore: Record<string, any> = {};

  return {
    runtime: {
      getSession: () => ({
        fingerprint: { id: 'ws-test' },
      }),
    },
    agents: {
      listAgents: vi.fn(async () => Object.values(agentsStore)),
      getAgent: vi.fn(async (id: string) => agentsStore[id] ?? null),
      saveAgent: vi.fn(async (agent: any) => {
        agentsStore[agent.id] = agent;
      }),
      deleteAgent: vi.fn(async (id: string) => {
        delete agentsStore[id];
      }),
      listExecutions: vi.fn(async () => []),
      listTeams: vi.fn(async () => []),
      listMemory: vi.fn(async () => []),
      searchMemory: vi.fn(async () => []),
      saveMemory: vi.fn(async () => {}),
      listExecutionSessions: vi.fn(async () => []),
      getExecutionSession: vi.fn(async () => null),
      saveExecutionSession: vi.fn(async () => {}),
      updateExecutionSessionStatus: vi.fn(async () => {}),
      updateExecutionSessionTimeline: vi.fn(async () => {}),
    },
    agentService: {
      getAgentStats: vi.fn(async () => ({ total: 0, completed: 0, failed: 0, running: 0, successRate: 0 })),
      listCapabilities: vi.fn(() => [{ id: 'cap-1', name: 'Test Capability', description: 'A test capability' }]),
      runAgent: vi.fn(async () => ({
        success: true,
        execution: { id: 'exec-1', status: 'completed' },
        agent: { id: 'agent-1', name: 'Test Agent' },
        message: 'Agent completed',
      })),
    },
    agentRuntime: {
      executeCapability: vi.fn(async () => ({
        capability: 'test',
        result: { ok: true, data: { output: 'done' }, observation: 'observed' },
      })),
    },
    opencodeRuntime: {
      listAgents: vi.fn(async () => []),
    },
    audit: { log: vi.fn() },
    users: {
      findByToken: vi.fn(() => ({ id: 'user-1', username: 'admin', role: 'admin' })),
    },
    repoPath: '/tmp/test-repo',
    ...overrides,
  } as unknown as WorkspaceContext;
}

afterEach(() => {});

describe('agents routes', () => {
  it('GET /api/agents returns agents list with stats', async () => {
    const ctx = makeMockCtx();
    // Pre-seed an agent
    await (ctx.agents as any).saveAgent({ id: 'agent-1', name: 'Test Agent', origin: 'user', role: 'developer' });

    const { res, body, status } = fakeResponse();
    const handled = await handleAgentsRoute('GET', '/api/agents', fakeRequest('GET', '/api/agents'), res, ctx);
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const result = body() as { agents: any[]; executions: unknown[]; runtime: { reachable: boolean } };
    expect(result.agents.length).toBe(1);
    expect(result.agents[0].id).toBe('agent-1');
    expect(result.agents[0].stats).toBeDefined();
    expect(result.runtime.reachable).toBe(true);
  });

  it('POST /api/agents creates a new agent', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handleAgentsRoute(
      'POST',
      '/api/agents',
      fakeRequest('POST', '/api/agents', JSON.stringify({ name: 'New Agent', role: 'developer' })),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(201);
    const result = body() as { agent: { id: string; name: string; role: string } };
    expect(result.agent.id).toBeTruthy();
    expect(result.agent.name).toBe('New Agent');
    expect(result.agent.role).toBe('developer');
  });

  it('POST /api/agents returns 400 when name is missing', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handleAgentsRoute(
      'POST',
      '/api/agents',
      fakeRequest('POST', '/api/agents', JSON.stringify({ role: 'developer' })),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(400);
    expect((body() as { error: string }).error).toBe('name is required');
  });

  it('GET /api/agents/:id returns agent detail with stats', async () => {
    const ctx = makeMockCtx();
    await (ctx.agents as any).saveAgent({
      id: 'agent-1',
      name: 'Detail Agent',
      origin: 'user',
      role: 'reviewer',
      teamId: '',
    });

    const { res, body, status } = fakeResponse();
    const handled = await handleAgentsRoute(
      'GET',
      '/api/agents/agent-1',
      fakeRequest('GET', '/api/agents/agent-1'),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const result = body() as { agent: { id: string; name: string }; executions: unknown[]; stats: any };
    expect(result.agent.id).toBe('agent-1');
    expect(result.agent.name).toBe('Detail Agent');
    expect(result.stats).toBeDefined();
  });

  it('GET /api/agents/:id returns 404 for missing agent', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handleAgentsRoute(
      'GET',
      '/api/agents/nonexistent',
      fakeRequest('GET', '/api/agents/nonexistent'),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(404);
    expect((body() as { error: string }).error).toBe('agent not found');
  });

  it('PUT /api/agents/:id updates an agent', async () => {
    const ctx = makeMockCtx();
    await (ctx.agents as any).saveAgent({
      id: 'agent-1',
      name: 'Old Name',
      origin: 'user',
      role: 'developer',
    });

    const { res, body, status } = fakeResponse();
    const handled = await handleAgentsRoute(
      'PUT',
      '/api/agents/agent-1',
      fakeRequest('PUT', '/api/agents/agent-1', JSON.stringify({ name: 'New Name', description: 'Updated' })),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const result = body() as { agent: { id: string; name: string } };
    expect(result.agent.name).toBe('New Name');
  });

  it('PUT /api/agents/:id returns 404 for missing agent', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handleAgentsRoute(
      'PUT',
      '/api/agents/ghost',
      fakeRequest('PUT', '/api/agents/ghost', JSON.stringify({ name: 'x' })),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(404);
    expect((body() as { error: string }).error).toBe('agent not found');
  });

  it('PUT /api/agents/:id returns 400 when updating system agent identity', async () => {
    const ctx = makeMockCtx();
    await (ctx.agents as any).saveAgent({
      id: 'agent-system',
      name: 'System Agent',
      origin: 'system',
      role: 'developer',
    });

    const { res, body, status } = fakeResponse();
    const handled = await handleAgentsRoute(
      'PUT',
      '/api/agents/agent-system',
      fakeRequest('PUT', '/api/agents/agent-system', JSON.stringify({ id: 'new-id' })),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(400);
    expect((body() as { error: string }).error).toBe('Cannot change system agent identity');
  });

  it('DELETE /api/agents/:id deletes a user agent', async () => {
    const ctx = makeMockCtx();
    await (ctx.agents as any).saveAgent({
      id: 'agent-1',
      name: 'To Delete',
      origin: 'user',
      role: 'developer',
    });

    const { res, status } = fakeResponse();
    const handled = await handleAgentsRoute(
      'DELETE',
      '/api/agents/agent-1',
      fakeRequest('DELETE', '/api/agents/agent-1'),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
  });

  it('DELETE /api/agents/:id returns 403 for system agent', async () => {
    const ctx = makeMockCtx();
    await (ctx.agents as any).saveAgent({
      id: 'agent-system',
      name: 'System Agent',
      origin: 'system',
      role: 'developer',
    });

    const { res, body, status } = fakeResponse();
    const handled = await handleAgentsRoute(
      'DELETE',
      '/api/agents/agent-system',
      fakeRequest('DELETE', '/api/agents/agent-system'),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(403);
    expect((body() as { error: string }).error).toBe('Cannot delete system agent');
  });

  it('GET /api/capabilities returns agent capabilities', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handleAgentsRoute(
      'GET',
      '/api/capabilities',
      fakeRequest('GET', '/api/capabilities'),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const result = body() as { capabilities: any[] };
    expect(result.capabilities.length).toBe(1);
    expect(result.capabilities[0].name).toBe('Test Capability');
  });

  it('GET /api/agents/:id/stats returns agent stats', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handleAgentsRoute(
      'GET',
      '/api/agents/agent-1/stats',
      fakeRequest('GET', '/api/agents/agent-1/stats'),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const result = body() as { stats: { total: number; completed: number } };
    expect(result.stats.total).toBe(0);
  });

  it('POST /api/agents/:id/run runs an agent with a task', async () => {
    const ctx = makeMockCtx();
    await (ctx.agents as any).saveAgent({ id: 'agent-1', name: 'Runner', origin: 'user', role: 'developer' });

    const { res, body, status } = fakeResponse();
    const handled = await handleAgentsRoute(
      'POST',
      '/api/agents/agent-1/run',
      fakeRequest('POST', '/api/agents/agent-1/run', JSON.stringify({ task: 'Build the feature' })),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const result = body() as { execution: any; runtime: any };
    expect(result.execution.id).toBe('exec-1');
    expect(result.runtime.engine).toBe('opencode-runtime');
  });

  it('POST /api/agents/:id/run returns 400 when task is missing', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handleAgentsRoute(
      'POST',
      '/api/agents/agent-1/run',
      fakeRequest('POST', '/api/agents/agent-1/run', JSON.stringify({})),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(400);
    expect((body() as { error: string }).error).toBe('task is required');
  });

  it('POST /api/agents/:id/capabilities executes a capability', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handleAgentsRoute(
      'POST',
      '/api/agents/agent-1/capabilities',
      fakeRequest(
        'POST',
        '/api/agents/agent-1/capabilities',
        JSON.stringify({ capability: 'filesystem.read', input: { path: '/tmp' } }),
      ),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const result = body() as { ok: boolean; data: any };
    expect(result.ok).toBe(true);
    expect(result.data.output).toBe('done');
  });

  it('POST /api/agents/:id/capabilities returns 400 when capability is missing', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handleAgentsRoute(
      'POST',
      '/api/agents/agent-1/capabilities',
      fakeRequest('POST', '/api/agents/agent-1/capabilities', JSON.stringify({})),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(400);
    expect((body() as { error: string }).error).toBe('capability is required');
  });

  it('GET /api/agents/:id/memory lists agent memory', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handleAgentsRoute(
      'GET',
      '/api/agents/agent-1/memory',
      fakeRequest('GET', '/api/agents/agent-1/memory'),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const result = body() as { memories: unknown[] };
    expect(result.memories).toEqual([]);
  });

  it('POST /api/agents/:id/memory saves a memory entry', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handleAgentsRoute(
      'POST',
      '/api/agents/agent-1/memory',
      fakeRequest(
        'POST',
        '/api/agents/agent-1/memory',
        JSON.stringify({ type: 'observation', summary: 'Noted pattern', detail: 'Details here' }),
      ),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(201);
    const result = body() as { entry: { id: string; type: string; summary: string } };
    expect(result.entry.id).toBeTruthy();
    expect(result.entry.type).toBe('observation');
    expect(result.entry.summary).toBe('Noted pattern');
  });

  it('POST /api/agents/sync syncs canonical agents to files', async () => {
    const ctx = makeMockCtx();
    const { res, body, status } = fakeResponse();
    const handled = await handleAgentsRoute(
      'POST',
      '/api/agents/sync',
      fakeRequest('POST', '/api/agents/sync'),
      res,
      ctx,
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const result = body() as { synced: number; files: string[] };
    expect(result.synced).toBeGreaterThan(0);
    expect(result.files.length).toBeGreaterThan(0);
  });

  it('returns false for unmatched routes', async () => {
    const ctx = makeMockCtx();
    const { res } = fakeResponse();
    const handled = await handleAgentsRoute('GET', '/api/unknown', fakeRequest('GET', '/api/unknown'), res, ctx);
    expect(handled).toBe(false);
  });
});
