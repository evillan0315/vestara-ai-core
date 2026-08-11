import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AgentHarnessRuntime } from '@vestara/agent-harness';
import { FilesystemRuntime } from '@vestara/filesystem-runtime';
import type { AIModel, AIProvider, CompletionResponse } from '@vestara/shared';
import { migrate } from '@vestara/sqlite-migrations';
import { FileThreadStore } from '@vestara/thread-runtime';
import { FilesystemWriteTool, ToolRuntime } from '@vestara/tool-runtime';
import type { AgentEnvironment, HarnessVerificationResult } from '@vestara/types';
import { afterAll, describe, expect, it } from 'vitest';
import { PLANS_MANIFEST } from '../src/agent-migrations.js';
import { AgentRuntime } from '../src/agent-runtime.js';
import { AgentStorage } from '../src/agent-storage.js';

/** Composition-root responsibility for direct-construction tests. */
function migratedDb(db: import('sql.js').Database): import('sql.js').Database {
  migrate(db, PLANS_MANIFEST, {});
  return db;
}

import { HarnessSession } from '../src/harness-session.js';

const directories: string[] = [];

afterAll(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

const model: AIModel = {
  id: 'model-test',
  provider: 'test',
  name: 'Test',
  contextWindow: 32_000,
  maxOutput: 4_000,
  capabilities: { chat: true, streaming: true, functionCalling: true, vision: false, embeddings: false },
  status: 'available',
};

function harnessProvider(): AIProvider {
  let calls = 0;
  return {
    id: 'provider-harness',
    name: 'Harness Provider',
    version: '1.0.0',
    status: 'available',
    models: [model],
    capabilities: { maxConcurrentRequests: 1, features: ['chat', 'function-calling'] },
    async initialize() {},
    async complete(): Promise<CompletionResponse> {
      calls += 1;
      if (calls === 1) {
        return {
          id: `r-${calls}`,
          model: model.id,
          provider: 'provider-harness',
          content: '',
          usage: {},
          latency: 1,
          toolCalls: [
            {
              id: 'call-w',
              name: 'filesystem.write',
              arguments: JSON.stringify({ path: 'out.txt', content: 'harness wrote this' }),
            },
          ],
        };
      }
      return {
        id: `r-${calls}`,
        model: model.id,
        provider: 'provider-harness',
        content: 'Done.',
        usage: {},
        latency: 1,
      };
    },
    async *stream() {},
    async healthCheck() {
      return {
        status: 'healthy',
        providerId: 'provider-harness',
        modelCount: 1,
        latency: 1,
        lastHeartbeat: new Date().toISOString(),
      };
    },
    async listModels() {
      return [model];
    },
  };
}

async function setup(
  workspaceRoot: string,
): Promise<{ harness: AgentHarnessRuntime; store: FileThreadStore; storage: AgentStorage; session: HarnessSession }> {
  const directory = path.dirname(workspaceRoot);
  const environment: AgentEnvironment = {
    id: 'environment-local',
    kind: 'local',
    workspaceRoot,
    networkPolicy: 'deny',
    filesystemPolicy: 'workspace-write',
    processPolicy: 'restricted',
  };
  const { AgentHarnessRuntime: Harness } = await import('@vestara/agent-harness');
  const store = await FileThreadStore.open(path.join(directory, 'threads.db'));
  const tools = new ToolRuntime();
  tools.register(new FilesystemWriteTool(new FilesystemRuntime({ rootDir: workspaceRoot })));
  const harness: AgentHarnessRuntime = new Harness({
    store,
    provider: harnessProvider(),
    model: model.id,
    tools,
    context: {
      async assemble({ thread }) {
        return `Task ${thread.taskId}`;
      },
    },
    verifier: {
      async verify(): Promise<HarnessVerificationResult> {
        return { status: 'passed', checks: [], evidence: [], uncoveredRisks: [], confidence: 0.95 };
      },
    },
  });
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();
  const storage = new AgentStorage(migratedDb(new SQL.Database()));
  const session = new HarnessSession({ harness, storage, environment });
  return { harness, store, storage, session };
}

describe('AgentRuntime — harness execution path', () => {
  it('every run creates a durable harness thread + linked ExecutionSession', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-agent-runtime-'));
    directories.push(directory);
    const workspaceRoot = path.join(directory, 'workspace');
    fs.mkdirSync(workspaceRoot);
    const { harness, store, storage, session } = await setup(workspaceRoot);
    const engines: string[] = [];
    const runtime = new AgentRuntime({
      storage,
      provider: harnessProvider(),
      harnessSession: session,
      onEngineUsed: (engine) => engines.push(engine),
    });

    const result = await runtime.run('agent-developer', 'Write the notes file', {} as never);

    expect(engines).toEqual(['harness']);
    expect(result.execution.status).toBe('completed');
    expect(result.execution.result).toContain('Harness completed');
    expect(fs.readFileSync(path.join(workspaceRoot, 'out.txt'), 'utf8')).toBe('harness wrote this');

    const threads = harness.listThreads();
    expect(threads.length).toBe(1);
    const linked = await session.sessionForThread(threads[0].id);
    expect(linked).not.toBeNull();
    expect(linked!.status).toBe('completed');
    store.close();
  });

  it('returns a clear failure when no HarnessSession is wired', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-agent-runtime-noharness-'));
    directories.push(directory);
    const workspaceRoot = path.join(directory, 'workspace');
    fs.mkdirSync(workspaceRoot);
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs();
    const storage = new AgentStorage(migratedDb(new SQL.Database()));
    const runtime = new AgentRuntime({ storage });

    const result = await runtime.run('agent-developer', 'No-op', { rootPath: workspaceRoot } as never);

    expect(result.execution.status).toBe('failed');
    expect(result.message).toContain('HarnessSession');
  });
});
