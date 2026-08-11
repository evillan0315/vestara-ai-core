import { EventEmitter } from 'node:events';
import type * as http from 'node:http';
import { migrate } from '@vestara/sqlite-migrations';
import { AGENT_MANIFEST, AgentStorage } from '@vestara/workspace';
import { beforeAll, describe, expect, it } from 'vitest';
// The route handler is exercised against its compiled output: `routes/types.ts`
// calls `require('../auth')`, which does not exist in vitest's ESM transform.
import { handleAgentsRoute } from '../dist/routes/agents.js';
import type { WorkspaceContext } from '../src/workspace-context.js';

let SQL: { Database: new (data?: Uint8Array | null) => import('sql.js').Database };

beforeAll(async () => {
  const initSqlJs = (await import('sql.js')).default;
  SQL = await initSqlJs();
});

interface TestHarness {
  ctx: WorkspaceContext;
  auditEntries: Array<{ action: string; resource: string; resourceId?: string }>;
}

function makeHarness(): TestHarness {
  const db = new SQL.Database();
  migrate(db, AGENT_MANIFEST, {}); // composition root's responsibility (AgentStorage no longer migrates)
  const storage = new AgentStorage(db);
  db.exec('DELETE FROM agents');
  db.exec('DELETE FROM agent_executions');

  const auditEntries: TestHarness['auditEntries'] = [];
  const users = {
    findByToken: (token: string) =>
      token === 'viewer-token'
        ? { id: 'viewer', username: 'Viewer', role: 'viewer' as const }
        : token === 'editor-token'
          ? { id: 'editor', username: 'Editor', role: 'editor' as const }
          : undefined,
  };

  const ctx = {
    agents: storage,
    audit: { log: (entry: TestHarness['auditEntries'][number]) => auditEntries.push(entry) },
    users,
    opencodeRuntime: { listAgents: async () => [] },
    agentService: {
      getAgentStats: async () => ({ total: 0, completed: 0, failed: 0, running: 0, successRate: 0 }),
    },
  } as unknown as WorkspaceContext;

  return { ctx, auditEntries };
}

function fakeResponse(): { res: http.ServerResponse; body: () => unknown; status: () => number } {
  let status = 0;
  let body: unknown = null;
  const res = new EventEmitter() as unknown as http.ServerResponse & { headersSent: boolean };
  res.headersSent = false;
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

function fakeRequest(
  method: string,
  url: string,
  body?: string,
  headers: Record<string, string> = {},
): http.IncomingMessage {
  const req = new EventEmitter() as unknown as http.IncomingMessage & {
    method: string;
    url: string;
    headers: Record<string, string>;
    socket: { remoteAddress: string };
  };
  req.method = method;
  req.url = url;
  req.headers = headers;
  req.socket = { remoteAddress: '127.0.0.1' };
  if (body !== undefined) {
    queueMicrotask(() => {
      req.emit('data', Buffer.from(body));
      req.emit('end');
    });
  } else {
    queueMicrotask(() => req.emit('end'));
  }
  return req;
}

async function call(
  harness: TestHarness,
  method: string,
  path: string,
  body?: string,
  headers?: Record<string, string>,
) {
  const { res, body: getBody, status } = fakeResponse();
  await handleAgentsRoute(method, path, fakeRequest(method, path, body, headers), res, harness.ctx);
  return { status: status(), body: getBody() };
}

describe('Agent Control CRUD API contract (AC-TST-002)', () => {
  it('creates an agent, persists it, and emits an audit event', async () => {
    const h = makeHarness();
    const create = await call(
      h,
      'POST',
      '/api/agents',
      JSON.stringify({ id: 'agent-frontend', name: 'Frontend Developer', role: 'developer' }),
    );
    expect(create.status).toBe(201);
    const agent = (create.body as { agent: { id: string; name: string; status: string } }).agent;
    expect(agent).toMatchObject({
      id: 'agent-frontend',
      name: 'Frontend Developer',
      role: 'developer',
      status: 'active',
    });

    // Persisted: visible in list and detail.
    const list = await call(h, 'GET', '/api/agents');
    expect((list.body as { agents: Array<{ id: string }> }).agents.some((a) => a.id === 'agent-frontend')).toBe(true);

    const detail = await call(h, 'GET', '/api/agents/agent-frontend');
    expect(detail.status).toBe(200);
    expect((detail.body as { agent: { id: string } }).agent.id).toBe('agent-frontend');

    expect(h.auditEntries).toContainEqual(
      expect.objectContaining({ action: 'agent.create', resource: 'agent', resourceId: 'agent-frontend' }),
    );
  });

  it('rejects creation without a name and trims whitespace', async () => {
    const h = makeHarness();
    const missing = await call(h, 'POST', '/api/agents', JSON.stringify({ id: 'a1' }));
    expect(missing.status).toBe(400);

    const blank = await call(h, 'POST', '/api/agents', JSON.stringify({ id: 'a2', name: '   ' }));
    expect(blank.status).toBe(400);

    const created = await call(h, 'POST', '/api/agents', JSON.stringify({ id: 'a3', name: '  Planner X  ' }));
    expect(created.status).toBe(201);
    expect((created.body as { agent: { name: string } }).agent.name).toBe('Planner X');
  });

  it('rejects a duplicate agent id (data integrity)', async () => {
    const h = makeHarness();
    const first = await call(h, 'POST', '/api/agents', JSON.stringify({ id: 'agent-dup', name: 'First' }));
    expect(first.status).toBe(201);
    const second = await call(h, 'POST', '/api/agents', JSON.stringify({ id: 'agent-dup', name: 'Second' }));
    expect(second.status).toBe(409);
    // The original is not overwritten.
    const detail = await call(h, 'GET', '/api/agents/agent-dup');
    expect((detail.body as { agent: { name: string } }).agent.name).toBe('First');
  });

  it('documents current behavior: duplicate names are currently allowed (rule HELD)', async () => {
    const h = makeHarness();
    const first = await call(h, 'POST', '/api/agents', JSON.stringify({ id: 'n1', name: 'Same Name' }));
    const second = await call(h, 'POST', '/api/agents', JSON.stringify({ id: 'n2', name: 'Same Name' }));
    expect(first.status).toBe(201);
    // Uniqueness of agent names is a HELD domain rule — current behavior accepts it.
    expect(second.status).toBe(201);
  });

  it('updates an agent, persists the change, and emits an audit event', async () => {
    const h = makeHarness();
    await call(h, 'POST', '/api/agents', JSON.stringify({ id: 'agent-upd', name: 'Before', role: 'custom' }));
    const update = await call(
      h,
      'PUT',
      '/api/agents/agent-upd',
      JSON.stringify({ name: 'After', role: 'developer', description: 'updated' }),
    );
    expect(update.status).toBe(200);
    expect((update.body as { agent: { name: string; role: string; description: string } }).agent).toMatchObject({
      name: 'After',
      role: 'developer',
      description: 'updated',
    });

    const detail = await call(h, 'GET', '/api/agents/agent-upd');
    expect((detail.body as { agent: { name: string } }).agent.name).toBe('After');

    expect(h.auditEntries).toContainEqual(
      expect.objectContaining({ action: 'agent.update', resource: 'agent', resourceId: 'agent-upd' }),
    );
  });

  it('rejects empty-name updates and missing agents', async () => {
    const h = makeHarness();
    await call(h, 'POST', '/api/agents', JSON.stringify({ id: 'agent-e', name: 'Existing' }));
    const blank = await call(h, 'PUT', '/api/agents/agent-e', JSON.stringify({ name: '   ' }));
    expect(blank.status).toBe(400);

    const missing = await call(h, 'PUT', '/api/agents/does-not-exist', JSON.stringify({ name: 'X' }));
    expect(missing.status).toBe(404);
  });

  it('deletes an agent, removes it from the catalog, and emits an audit event', async () => {
    const h = makeHarness();
    await call(h, 'POST', '/api/agents', JSON.stringify({ id: 'agent-del', name: 'Delete Me' }));
    const del = await call(h, 'DELETE', '/api/agents/agent-del');
    expect(del.status).toBe(200);
    expect((del.body as { deleted: boolean }).deleted).toBe(true);

    const detail = await call(h, 'GET', '/api/agents/agent-del');
    expect(detail.status).toBe(404);

    expect(h.auditEntries).toContainEqual(
      expect.objectContaining({ action: 'agent.delete', resource: 'agent', resourceId: 'agent-del' }),
    );
  });

  it('returns 404 for missing agent detail', async () => {
    const h = makeHarness();
    const detail = await call(h, 'GET', '/api/agents/never-created');
    expect(detail.status).toBe(404);
  });

  it('requires editor role for mutations but allows reads for viewers', async () => {
    const h = makeHarness();
    const viewerHeaders = { authorization: 'Bearer viewer-token' };
    const editorHeaders = { authorization: 'Bearer editor-token' };

    // Viewer: read is allowed.
    const list = await call(h, 'GET', '/api/agents', undefined, viewerHeaders);
    expect(list.status).toBe(200);

    // Viewer: mutations are denied.
    const create = await call(h, 'POST', '/api/agents', JSON.stringify({ name: 'Nope' }), viewerHeaders);
    expect(create.status).toBe(403);
    const update = await call(h, 'PUT', '/api/agents/agent-architect', JSON.stringify({ name: 'Nope' }), viewerHeaders);
    expect(update.status).toBe(403);
    const del = await call(h, 'DELETE', '/api/agents/agent-architect', undefined, viewerHeaders);
    expect(del.status).toBe(403);

    // Editor: mutations are allowed.
    const editorCreate = await call(
      h,
      'POST',
      '/api/agents',
      JSON.stringify({ id: 'editor-agent', name: 'Editor Agent' }),
      editorHeaders,
    );
    expect(editorCreate.status).toBe(201);
    const editorDel = await call(h, 'DELETE', '/api/agents/editor-agent', undefined, editorHeaders);
    expect(editorDel.status).toBe(200);
  });
});
