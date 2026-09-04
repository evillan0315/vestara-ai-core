/**
 * GA-UX-PREMIUM M3 — Assistant OpenCode Adapter tests (deterministic, mocked
 * client). Proves the event → chunk projection + operationId correlation +
 * explicit lifecycle end to end.
 */

import type { OpenCodeHttpClient } from '@vestara/opencode-runtime';
import type { CompletionRequest, StreamChunk } from '@vestara/shared';
import { describe, expect, it } from 'vitest';
import { runAssistantOpenCodeTurn } from '../src/assistant-opencode-adapter';

function sseEvent(id: string, type: string, payload: Record<string, unknown>) {
  return { id, type, timestamp: new Date().toISOString(), payload: { sessionID: 'sess-1', ...payload } };
}

function makeRequest(): CompletionRequest {
  return {
    model: 'gpt-test',
    messages: [{ role: 'user', content: 'Read package.json' }],
  };
}

async function collectTurn(mock: Partial<OpenCodeHttpClient>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const item of runAssistantOpenCodeTurn(
    {
      client: mock as unknown as OpenCodeHttpClient,
      workspaceId: 'ws-test',
      directory: '/repo',
      agent: 'vestara-assistant',
      turnTimeoutMs: 5000,
    },
    makeRequest(),
  )) {
    chunks.push(item);
  }
  return chunks;
}

function eventClient(
  events: ReturnType<typeof sseEvent>[],
  opts: { diff?: unknown[]; todos?: unknown[] } = {},
): Partial<OpenCodeHttpClient> {
  async function* stream() {
    for (const ev of events) yield ev;
  }
  return {
    createSession: async () => ({ id: 'sess-1', status: 'idle' as const }),
    sendMessage: async () => ({ sessionId: 'sess-1', finished: true }),
    openEventStream: stream as OpenCodeHttpClient['openEventStream'],
    getSessionDiff: async () => (opts.diff ?? []) as never,
    getSessionTodos: async () => (opts.todos ?? []) as never,
  };
}

describe('createAssistantOpenCodeExecutor — runAssistantOpenCodeTurn', () => {
  it('projects a complete tool lifecycle with stable operation identity', async () => {
    const chunks = await collectTurn(
      eventClient([
        sseEvent('e1', 'session.next.tool.called', { callID: 'call-1', tool: 'read', timestamp: 1000 }),
        sseEvent('e2', 'session.next.tool.success', {
          callID: 'call-1',
          tool: 'read',
          content: [{ type: 'text', text: 'package.json contents' }],
          timestamp: 2000,
        }),
        sseEvent('e3', 'session.status', { status: { type: 'idle' } }),
      ]),
    );
    const started = chunks.find((c) => c.type === 'tool_call');
    const completed = chunks.find((c) => c.type === 'tool_result');
    expect(started).toBeDefined();
    expect(completed).toBeDefined();
    expect(started!.detail!.operationId).toBe('call-1');
    expect(completed!.detail!.operationId).toBe('call-1');
    expect(started!.detail!.state).toBe('running');
    expect(completed!.detail!.state).toBe('completed');
    expect(completed!.content).toBe('package.json contents');
  });

  it('started → failed correlation keeps one identity with explicit failure', async () => {
    const chunks = await collectTurn(
      eventClient([
        sseEvent('e1', 'session.next.tool.input.started', { callID: 'call-2', name: 'bash', timestamp: 1000 }),
        sseEvent('e2', 'session.next.tool.failed', {
          callID: 'call-2',
          tool: 'bash',
          error: { type: 'unknown', message: 'boom' },
          timestamp: 2000,
        }),
        sseEvent('e3', 'session.status', { status: { type: 'idle' } }),
      ]),
    );
    const started = chunks.find((c) => c.type === 'tool_call');
    const failed = chunks.find((c) => c.type === 'tool_result');
    expect(started!.detail!.operationId).toBe('call-2');
    expect(failed!.detail!.operationId).toBe('call-2');
    expect(failed!.detail!.state).toBe('failed');
    expect(failed!.content).toBe('boom');
  });

  it('successful tool output exactly "failed" stays completed (§4 regression, end-to-end)', async () => {
    const chunks = await collectTurn(
      eventClient([
        sseEvent('e1', 'session.next.tool.called', { callID: 'call-3', tool: 'bash', timestamp: 1000 }),
        sseEvent('e2', 'session.next.tool.success', {
          callID: 'call-3',
          tool: 'bash',
          content: [{ type: 'text', text: 'failed' }],
          timestamp: 2000,
        }),
        sseEvent('e3', 'session.status', { status: { type: 'idle' } }),
      ]),
    );
    const completed = chunks.find((c) => c.type === 'tool_result');
    expect(completed!.detail!.state).toBe('completed');
    expect(completed!.content).toBe('failed');
  });

  it('two consecutive same-tool operations remain distinct (operationId correlation)', async () => {
    const chunks = await collectTurn(
      eventClient([
        sseEvent('e1', 'session.next.tool.called', { callID: 'call-a', tool: 'read', timestamp: 1000 }),
        sseEvent('e2', 'session.next.tool.success', {
          callID: 'call-a',
          tool: 'read',
          content: [{ type: 'text', text: 'a' }],
          timestamp: 2000,
        }),
        sseEvent('e3', 'session.next.tool.called', { callID: 'call-b', tool: 'read', timestamp: 3000 }),
        sseEvent('e4', 'session.next.tool.success', {
          callID: 'call-b',
          tool: 'read',
          content: [{ type: 'text', text: 'b' }],
          timestamp: 4000,
        }),
        sseEvent('e5', 'session.status', { status: { type: 'idle' } }),
      ]),
    );
    const started = chunks.filter((c) => c.type === 'tool_call');
    const results = chunks.filter((c) => c.type === 'tool_result');
    expect(started).toHaveLength(2);
    expect(results).toHaveLength(2);
    expect(started[0]!.detail!.operationId).toBe('call-a');
    expect(started[1]!.detail!.operationId).toBe('call-b');
    // Each result correlates to its own start — no cross-contamination.
    expect(results[0]!.detail!.operationId).toBe('call-a');
    expect(results[1]!.detail!.operationId).toBe('call-b');
  });

  it('permission request projects as a status detail and carries no authority mutation', async () => {
    const chunks = await collectTurn(
      eventClient([
        sseEvent('e1', 'permission.v2.asked', {
          id: 'perm-1',
          action: 'edit',
          resources: ['packages/foo/src/index.ts'],
          metadata: { policy: 'SECRET' },
          timestamp: 1000,
        }),
        sseEvent('e2', 'permission.v2.replied', { requestID: 'perm-1', reply: 'once', timestamp: 2000 }),
        sseEvent('e3', 'session.status', { status: { type: 'idle' } }),
      ]),
    );
    const statuses = chunks.filter((c) => c.type === 'status');
    expect(statuses).toHaveLength(2);
    const asked = statuses[0]!.detail;
    const replied = statuses[1]!.detail;
    expect(asked!.kind).toBe('permission');
    if (asked!.kind === 'permission') {
      expect(asked!.permissionState).toBe('requested');
      expect(asked!.resources).toEqual(['packages/foo/src/index.ts']);
      expect(JSON.stringify(asked)).not.toContain('SECRET');
    }
    if (replied!.kind === 'permission') {
      expect(replied!.permissionState).toBe('resolved');
      expect(replied!.reply).toBe('once');
    }
  });

  it('payload junk fields never leak into the projection (sanitization at the boundary)', async () => {
    const chunks = await collectTurn(
      eventClient([
        sseEvent('e1', 'session.next.tool.called', {
          callID: 'call-9',
          tool: 'read',
          timestamp: 1000,
          contract: 'assistant.execution.v99',
          version: 99,
          credentials: { apiKey: 'sk-secret' },
          hiddenReasoning: 'chain-of-thought',
        }),
        sseEvent('e2', 'session.status', { status: { type: 'idle' } }),
      ]),
    );
    const started = chunks.find((c) => c.type === 'tool_call');
    // The adapter constructs a v1 detail from the OpenCode event; junk payload
    // fields (wrong contract/version markers, credentials, reasoning) are never
    // forwarded to the browser.
    expect(started!.detail).toBeDefined();
    expect(started!.detail!.contract).toBe('assistant.execution.v1');
    expect(started!.detail!.operationId).toBe('call-9');
    expect(JSON.stringify(started!.detail)).not.toContain('sk-secret');
    expect(JSON.stringify(started!.detail)).not.toContain('chain-of-thought');
  });

  it('existing text streaming is preserved (delta chunks pass through)', async () => {
    const chunks = await collectTurn(
      eventClient([
        sseEvent('e1', 'message.part.delta', { delta: 'Hello' }),
        sseEvent('e2', 'message.part.delta', { delta: ' world' }),
        sseEvent('e3', 'session.status', { status: { type: 'idle' } }),
      ]),
    );
    const text = chunks
      .filter((c) => c.type === 'text')
      .map((c) => c.content)
      .join('');
    expect(text).toBe('Hello world');
  });

  it('turn-end enrichment: session diff and todos surface as bounded status details', async () => {
    const chunks = await collectTurn(
      eventClient([sseEvent('e1', 'session.status', { status: { type: 'idle' } })], {
        diff: [
          {
            path: 'packages/foo/src/index.ts',
            operation: 'modified',
            additions: 4,
            deletions: 2,
            hunks: [
              { oldStart: 10, oldLines: 3, newStart: 10, newLines: 3, content: ' ctx\n+ add\n- del' },
              { oldStart: 20, oldLines: 1, newStart: 21, newLines: 1, content: ' tail' },
            ],
          },
        ],
        todos: [{ content: 'Investigate M3', status: 'pending' }],
      }),
    );
    const statuses = chunks.filter((c) => c.type === 'status');
    const edit = statuses.find((c) => c.detail?.kind === 'edit');
    const task = statuses.find((c) => c.detail?.kind === 'task-snapshot');
    expect(edit).toBeDefined();
    if (edit!.detail!.kind === 'edit') {
      expect(edit!.detail!.file).toBe('packages/foo/src/index.ts');
      expect(edit!.detail!.diffProvenance).toBe('runtime-provided');
      expect(edit!.detail!.additions).toBe(4);
      // GA-UX-PREMIUM M3.1: runtime hunks ride the contract (bounded, order preserved).
      expect(edit!.detail!.hunks).toHaveLength(2);
      expect(edit!.detail!.hunks![0]).toEqual({
        oldStart: 10,
        oldLines: 3,
        newStart: 10,
        newLines: 3,
        content: ' ctx\n+ add\n- del',
      });
      expect(edit!.detail!.hunks![1]!.oldStart).toBe(20);
      expect(edit!.detail!.hunksTruncated).toBeUndefined();
    }
    expect(task).toBeDefined();
    if (task!.detail!.kind === 'task-snapshot') {
      expect(task!.detail!.source).toBe('opencode');
      expect(task!.detail!.todos[0]!.title).toBe('Investigate M3');
    }
  });

  it('turn-end enrichment bounds oversized hunks and flags truncation', async () => {
    const chunks = await collectTurn(
      eventClient([sseEvent('e1', 'session.status', { status: { type: 'idle' } })], {
        diff: [
          {
            path: 'packages/foo/src/index.ts',
            operation: 'modified',
            additions: 100,
            deletions: 100,
            hunks: [{ oldStart: 1, content: 'z'.repeat(5000) }],
          },
        ],
      }),
    );
    const edit = chunks.find((c) => c.detail?.kind === 'edit');
    if (edit!.detail!.kind === 'edit') {
      expect(edit!.detail!.hunks![0]!.content.length).toBeLessThanOrEqual(1000);
      expect(edit!.detail!.hunksTruncated).toBe(true);
    }
  });

  it('terminal shell events project as bash operations with explicit lifecycle', async () => {
    const chunks = await collectTurn(
      eventClient([
        sseEvent('e1', 'session.next.shell.started', { callID: 'sh-1', command: 'ls', timestamp: 1000 }),
        sseEvent('e2', 'session.next.shell.ended', { callID: 'sh-1', output: 'src\n', timestamp: 1500 }),
        sseEvent('e3', 'session.status', { status: { type: 'idle' } }),
      ]),
    );
    const started = chunks.find((c) => c.type === 'tool_call');
    const ended = chunks.find((c) => c.type === 'tool_result');
    expect(started!.name).toBe('bash');
    expect(started!.detail!.kind).toBe('terminal');
    expect(started!.detail!.state).toBe('running');
    expect(ended!.detail!.kind).toBe('terminal');
    expect(ended!.detail!.state).toBe('completed');
    if (ended!.detail!.kind === 'terminal') {
      expect(ended!.detail!.durationMs).toBe(500);
      expect(ended!.detail!.outputPreview).toBe('src');
    }
  });

  it('message.part.updated tool parts project the live lifecycle (1.18.27 evidence path)', async () => {
    const toolPart = (status: string, overrides: Record<string, unknown> = {}) => ({
      type: 'tool',
      callID: 'call_b55512e995674acd8462f7c1',
      tool: 'read',
      state: {
        status,
        title: 'package.json',
        time: { start: 1_000, end: 1_300 },
        output: status === 'completed' ? '{"name":"@vestara/opencode-runtime"}' : undefined,
        ...overrides,
      },
    });
    const chunks = await collectTurn(
      eventClient([
        sseEvent('e1', 'message.part.updated', { part: toolPart('running'), time: 1_000 }),
        sseEvent('e2', 'message.part.updated', { part: toolPart('completed'), time: 1_300 }),
        sseEvent('e3', 'session.status', { status: { type: 'idle' } }),
      ]),
    );
    const started = chunks.find((c) => c.type === 'tool_call');
    const completed = chunks.find((c) => c.type === 'tool_result');
    expect(started).toBeDefined();
    expect(completed).toBeDefined();
    expect(started!.detail!.operationId).toBe('call_b55512e995674acd8462f7c1');
    expect(started!.detail!.state).toBe('running');
    expect(completed!.detail!.operationId).toBe('call_b55512e995674acd8462f7c1');
    expect(completed!.detail!.state).toBe('completed');
    if (completed!.detail!.kind === 'tool') {
      expect(completed!.detail!.title).toBe('package.json');
      expect(completed!.detail!.durationMs).toBe(300);
      expect(completed!.detail!.preview).toContain('@vestara/opencode-runtime');
    }
  });

  it('message.part.updated tool part error → failed with bounded error', async () => {
    const chunks = await collectTurn(
      eventClient([
        sseEvent('e1', 'message.part.updated', {
          part: {
            type: 'tool',
            callID: 'call-x',
            tool: 'bash',
            state: { status: 'error', error: 'exit code 2', time: { start: 1, end: 2 } },
          },
          time: 2,
        }),
        sseEvent('e2', 'session.status', { status: { type: 'idle' } }),
      ]),
    );
    const failed = chunks.find((c) => c.type === 'tool_result');
    expect(failed!.detail!.operationId).toBe('call-x');
    expect(failed!.detail!.state).toBe('failed');
    if (failed!.detail!.kind === 'tool') {
      expect(failed!.detail!.error).toBe('exit code 2');
    }
  });
});
