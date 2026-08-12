import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import type * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { migrate } from '@vestara/sqlite-migrations';
import { AgentStorage, PLANS_MANIFEST } from '@vestara/workspace';
import { afterEach, describe, expect, it } from 'vitest';
import { handleAgentsRoute } from '../src/routes/agents';
import { handleProvidersRoute } from '../src/routes/providers';
import type { WorkspaceContext } from '../src/workspace-context';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function fakeResponse(): {
  res: http.ServerResponse;
  status: () => number;
  body: () => unknown;
} {
  let code = 200;
  let payload = '';
  const res = {
    statusCode: 200,
    writeHead(status: number) {
      code = status;
    },
    setHeader() {},
    end(data?: unknown) {
      payload = String(data ?? '');
    },
  } as unknown as http.ServerResponse;
  return {
    res,
    status: () => code,
    body: () => {
      try {
        return JSON.parse(payload) as unknown;
      } catch {
        return payload;
      }
    },
  };
}

function fakeRequest(): http.IncomingMessage {
  const req = new EventEmitter() as unknown as http.IncomingMessage;
  req.headers = {};
  req.url = '';
  queueMicrotask(() => req.emit('end'));
  return req;
}

const now = new Date().toISOString();

async function buildCtx(overrides: Partial<WorkspaceContext> = {}): Promise<WorkspaceContext> {
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  migrate(db, PLANS_MANIFEST, {});
  const agents = new AgentStorage(db);
  await agents.saveAgent({
    id: 'agent-1',
    name: 'Planner',
    role: 'planner',
    agentType: 'workspace',
    capabilities: [],
    permissions: [],
    provider: 'opencode-go',
    model: 'deepseek-v4-flash',
    runtimeAgent: 'planner',
    status: 'active',
    createdAt: now,
  });
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-ocrt-'));
  tempDirs.push(workspaceDir);
  fs.writeFileSync(
    path.join(workspaceDir, 'workspace.json'),
    JSON.stringify({ schemaVersion: 1, id: 'test', name: 'test', providers: [], openedAt: now, lastOpenedAt: now }),
  );
  return {
    agents,
    agentService: {
      getAgentStats: async () => ({ total: 0, completed: 0, failed: 0, running: 0, successRate: 0 }),
      runAgent: async () => ({ success: true, message: 'ok', execution: {}, agent: {} }),
    },
    audit: { append: async () => {} },
    runtime: { getSession: () => ({}) },
    workspaceDir,
    providerManager: {
      listProviders: () => [],
      getProvider: () => undefined,
      health: async () => null,
    },
    opencodeRuntime: {
      reachable: async () => true,
      listAgents: async () => [
        { name: 'planner', description: 'Plans', mode: 'primary', native: true },
        { name: 'build', description: 'Default', mode: 'primary', native: true },
      ],
      listProviders: async () => [
        { id: 'opencode-go', name: 'OpenCode Go', modelCount: 3, models: ['deepseek-v4-flash', 'mimo-v2.5'] },
        { id: 'opencode', name: 'OpenCode', modelCount: 5, models: ['deepseek-v4-flash-free'] },
      ],
      health: async () => ({ healthy: true, version: '0.1.0' }),
    },
    ...overrides,
  } as unknown as WorkspaceContext;
}

const unreachableRuntime = {
  reachable: async () => false,
  listAgents: async () => {
    throw new Error('ECONNREFUSED');
  },
  listProviders: async () => {
    throw new Error('ECONNREFUSED');
  },
  health: async () => {
    throw new Error('ECONNREFUSED');
  },
};

describe('api/providers on the OpenCode runtime', () => {
  it('returns runtime-discovered providers with their models', async () => {
    const ctx = await buildCtx();
    const { res, status, body } = fakeResponse();
    await handleProvidersRoute('GET', '/api/providers', fakeRequest(), res, ctx);

    expect(status()).toBe(200);
    const data = body() as {
      source: string;
      providers: Array<{ id: string; models: Array<{ id: string }>; source?: string }>;
    };
    expect(data.source).toBe('opencode-runtime');
    expect(data.providers.map((p) => p.id)).toEqual(['opencode-go', 'opencode']);
    const go = data.providers.find((p) => p.id === 'opencode-go');
    expect(go?.models.map((m) => m.id)).toEqual(['deepseek-v4-flash', 'mimo-v2.5']);
    expect(go?.source).toBe('opencode-runtime');
  });

  it('falls back to configuration when the runtime is unreachable', async () => {
    const ctx = await buildCtx({ opencodeRuntime: unreachableRuntime as never });
    const { res, status, body } = fakeResponse();
    await handleProvidersRoute('GET', '/api/providers', fakeRequest(), res, ctx);

    expect(status()).toBe(200);
    const data = body() as { source: string; providers: unknown[] };
    expect(data.source).toBe('configuration');
  });
});

describe('api/agents on the OpenCode runtime', () => {
  it('annotates governed agents with their runtime twin but never adds runtime-only agents', async () => {
    const ctx = await buildCtx();
    const { res, status, body } = fakeResponse();
    await handleAgentsRoute('GET', '/api/agents', fakeRequest(), res, ctx);

    expect(status()).toBe(200);
    const data = body() as {
      agents: Array<{ id: string; runtimeAgent?: string; source?: string }>;
      runtime: { reachable: boolean };
    };
    expect(data.runtime.reachable).toBe(true);
    // governed agent annotated with its native twin, still sourced as workspace
    const planner = data.agents.find((a) => a.id === 'agent-1');
    expect(planner?.runtimeAgent).toBe('planner');
    expect(planner?.source).toBe('workspace');
    // runtime-only agents (build) are NOT injected — OpenCode does not govern
    expect(data.agents.some((a) => a.id === 'runtime-build')).toBe(false);
    expect(data.agents.some((a) => a.id.startsWith('runtime-'))).toBe(false);
  });

  it('returns the stored catalog when the runtime is unreachable', async () => {
    const ctx = await buildCtx({ opencodeRuntime: unreachableRuntime as never });
    const { res, status, body } = fakeResponse();
    await handleAgentsRoute('GET', '/api/agents', fakeRequest(), res, ctx);

    expect(status()).toBe(200);
    const data = body() as { agents: Array<{ id: string }>; runtime: { reachable: boolean } };
    expect(data.runtime.reachable).toBe(false);
    // stored catalog only — no runtime-derived agents
    expect(data.agents.some((a) => a.id === 'agent-1')).toBe(true);
    expect(data.agents.some((a) => a.id.startsWith('runtime-'))).toBe(false);
  });
});
