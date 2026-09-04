/**
 * GA-UX-PREMIUM M3 — hook consumption of `assistant.execution.v1`.
 *
 * Deterministic (mock SSE). Proves the M3 browser presentation rule:
 * authoritative operation identity/outcome improve lifecycle/dedup, but no
 * rich structured detail renders yet (M4–M7 held). The M2-visible
 * `toolOperations` API shape is unchanged.
 */

// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetch = vi.fn();
global.fetch = mockFetch as any;

vi.mock('../src/contexts/SurfaceContext', () => ({
  useSurfaceContext: () => ({
    workspace: { id: 'ws-test', name: 'Test Workspace' },
    surface: { routeId: '/dashboard', path: '/dashboard', title: 'Dashboard', section: 'Main' },
    selected: undefined,
  }),
  SurfaceContextProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { useAssistantConversation } from '../src/hooks/useAssistantConversation';

const ISO = '2026-01-01T00:00:00Z';

const EXECUTION = {
  contract: 'assistant.execution.v1',
  version: 1,
  source: 'opencode',
  timestamp: 1_700_000_000_000,
};

// ─── Deferred SSE stream harness (mirrors GA-UI-004 / M2) ──────

class StreamHarness {
  private chunks: Uint8Array[] = [];
  private waiters: Array<(r: { done: boolean; value?: Uint8Array }) => void> = [];
  private closed = false;

  push(event: Record<string, unknown>) {
    const bytes = new TextEncoder().encode(`data: ${JSON.stringify({ event })}\n\n`);
    const waiter = this.waiters.shift();
    if (waiter) waiter({ done: false, value: bytes });
    else this.chunks.push(bytes);
  }

  close() {
    this.closed = true;
    this.waiters.splice(0).forEach((w) => w({ done: true, value: undefined }));
  }

  getReader() {
    return {
      read: async (): Promise<{ done: boolean; value?: Uint8Array }> => {
        const next = this.chunks.shift();
        if (next) return { done: false, value: next };
        if (this.closed) return { done: true, value: undefined };
        return new Promise((resolve) => this.waiters.push(resolve));
      },
    };
  }
}

function makeServer() {
  const serverMessages: any[] = [];
  let msgCounter = 0;
  const state = { lastStream: null as StreamHarness | null };

  async function impl(url: string, opts?: { method?: string; body?: string }) {
    const method = opts?.method ?? 'GET';
    if (url === '/api/conversations' && method === 'GET') {
      return {
        ok: true,
        json: async () => ({
          conversations: [
            { id: 'conv-1', title: 'T', messageCount: serverMessages.length, status: 'active', createdAt: ISO, updatedAt: ISO },
          ],
        }),
      };
    }
    if (url === '/api/conversations/conv-1' && method === 'GET') {
      return {
        ok: true,
        json: async () => ({
          conversation: {
            id: 'conv-1',
            userId: 'local',
            title: 'T',
            messages: [...serverMessages],
            status: 'active',
            createdAt: ISO,
            updatedAt: ISO,
          },
        }),
      };
    }
    if (url === '/api/conversations/conv-1/stream' && method === 'POST') {
      const body = JSON.parse(opts?.body ?? '{}');
      msgCounter += 1;
      serverMessages.push({ id: `msg-server-${msgCounter}`, conversationId: 'conv-1', role: 'user', content: body.message, createdAt: ISO });
      const stream = new StreamHarness();
      state.lastStream = stream;
      return { ok: true, body: { getReader: () => stream.getReader() } };
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  }

  return { serverMessages, impl, state };
}

async function startTurn() {
  const server = makeServer();
  mockFetch.mockImplementation(server.impl as any);
  const { result } = renderHook(() => useAssistantConversation());
  await waitFor(() => expect(result.current.listLoading).toBe(false));
  await act(async () => {
    result.current.selectConversation('conv-1');
  });
  await waitFor(() => expect(result.current.selectedId).toBe('conv-1'));
  let sendPromise: Promise<void> | undefined;
  act(() => {
    sendPromise = result.current.sendMessage('Inspect the repo');
  });
  await waitFor(() => expect(server.state.lastStream).toBeDefined());
  return { server, result, sendPromise: sendPromise! };
}

async function finishTurn(server: ReturnType<typeof makeServer>, result: any, sendPromise: Promise<void>) {
  await act(async () => {
    server.state.lastStream!.push({ type: 'done' });
    server.state.lastStream!.close();
    await sendPromise;
  });
  await waitFor(() => expect(result.current.streamState).toBe('completed'));
}

describe('GA-UX-PREMIUM M3 — hook consumption of assistant.execution.v1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('stable operation identity correlates started → completed into one op', async () => {
    const { server, result, sendPromise } = await startTurn();
    await act(async () => {
      server.state.lastStream!.push({ type: 'tool', name: 'read', execution: { ...EXECUTION, operationId: 'call-1', kind: 'tool', state: 'running', tool: 'read' } });
    });
    await waitFor(() => expect(result.current.toolOperations).toHaveLength(1));
    expect(result.current.toolOperations[0]!.state).toBe('running');
    expect(result.current.toolOperations[0]!.name).toBe('read');

    await act(async () => {
      server.state.lastStream!.push({ type: 'tool_result', name: 'read', content: 'package.json', execution: { ...EXECUTION, operationId: 'call-1', kind: 'tool', state: 'completed', tool: 'read', preview: 'package.json' } });
    });
    await waitFor(() => expect(result.current.toolOperations).toHaveLength(1));
    expect(result.current.toolOperations[0]!.state).toBe('completed');
    expect(result.current.toolOperations[0]!.preview).toBe('package.json');
    await finishTurn(server, result, sendPromise);
  });

  it('started → failed correlation keeps one op with failed state', async () => {
    const { server, result, sendPromise } = await startTurn();
    await act(async () => {
      server.state.lastStream!.push({ type: 'tool', name: 'bash', execution: { ...EXECUTION, operationId: 'call-2', kind: 'tool', state: 'running', tool: 'bash' } });
    });
    await waitFor(() => expect(result.current.toolOperations).toHaveLength(1));
    await act(async () => {
      server.state.lastStream!.push({ type: 'tool_result', name: 'bash', content: 'boom', execution: { ...EXECUTION, operationId: 'call-2', kind: 'tool', state: 'failed', tool: 'bash', error: 'boom' } });
    });
    await waitFor(() => expect(result.current.toolOperations[0]!.state).toBe('failed'));
    expect(result.current.toolOperations).toHaveLength(1);
    await finishTurn(server, result, sendPromise);
  });

  it('two consecutive same-tool operations remain distinct (no same-name merge)', async () => {
    const { server, result, sendPromise } = await startTurn();
    await act(async () => {
      server.state.lastStream!.push({ type: 'tool', name: 'read', execution: { ...EXECUTION, operationId: 'call-a', kind: 'tool', state: 'running', tool: 'read' } });
      server.state.lastStream!.push({ type: 'tool_result', name: 'read', content: 'a', execution: { ...EXECUTION, operationId: 'call-a', kind: 'tool', state: 'completed', tool: 'read', preview: 'a' } });
      server.state.lastStream!.push({ type: 'tool', name: 'read', execution: { ...EXECUTION, operationId: 'call-b', kind: 'tool', state: 'running', tool: 'read' } });
      server.state.lastStream!.push({ type: 'tool_result', name: 'read', content: 'b', execution: { ...EXECUTION, operationId: 'call-b', kind: 'tool', state: 'completed', tool: 'read', preview: 'b' } });
    });
    await waitFor(() => expect(result.current.toolOperations).toHaveLength(2));
    expect(result.current.toolOperations[0]!.name).toBe('read');
    expect(result.current.toolOperations[0]!.state).toBe('completed');
    expect(result.current.toolOperations[1]!.name).toBe('read');
    expect(result.current.toolOperations[1]!.state).toBe('completed');
    expect(result.current.toolOperations[1]!.preview).toBe('b');
    await finishTurn(server, result, sendPromise);
  });

  it('successful output exactly "failed" remains successful (§4 regression)', async () => {
    const { server, result, sendPromise } = await startTurn();
    await act(async () => {
      server.state.lastStream!.push({ type: 'tool', name: 'bash', execution: { ...EXECUTION, operationId: 'call-3', kind: 'tool', state: 'running', tool: 'bash' } });
      server.state.lastStream!.push({ type: 'tool_result', name: 'bash', content: 'failed', execution: { ...EXECUTION, operationId: 'call-3', kind: 'tool', state: 'completed', tool: 'bash', preview: 'failed' } });
    });
    await waitFor(() => expect(result.current.toolOperations).toHaveLength(1));
    expect(result.current.toolOperations[0]!.state).toBe('completed');
    expect(result.current.toolOperations[0]!.preview).toBe('failed');
    await finishTurn(server, result, sendPromise);
  });

  it('unknown structured version degrades safely (no detail → legacy behavior)', async () => {
    const { server, result, sendPromise } = await startTurn();
    await act(async () => {
      server.state.lastStream!.push({ type: 'tool', name: 'read', execution: { ...EXECUTION, version: 99, operationId: 'call-x', kind: 'tool', state: 'running', tool: 'read' } });
    });
    // Execution detail ignored → legacy same-name running op still appears.
    await waitFor(() => expect(result.current.toolOperations).toHaveLength(1));
    expect(result.current.toolOperations[0]!.state).toBe('running');
    await finishTurn(server, result, sendPromise);
  });

  it('permission detail projects no card (toolOperations unchanged)', async () => {
    const { server, result, sendPromise } = await startTurn();
    await act(async () => {
      server.state.lastStream!.push({ type: 'status', content: 'Permission needed: edit', execution: { ...EXECUTION, operationId: 'perm-1', kind: 'permission', permissionState: 'requested', permissionRequestId: 'perm-1', action: 'edit', resources: ['a.ts'], state: 'running' } });
    });
    await waitFor(() => expect(result.current.streamStatus).toBe('Permission needed: edit'));
    expect(result.current.toolOperations).toHaveLength(0);
    await finishTurn(server, result, sendPromise);
  });

  it('existing text streaming is unchanged (delta accumulation)', async () => {
    const { server, result, sendPromise } = await startTurn();
    await act(async () => {
      server.state.lastStream!.push({ type: 'delta', content: 'Hello' });
      server.state.lastStream!.push({ type: 'delta', content: ' world' });
    });
    await waitFor(() => expect(result.current.streamingText).toBe('Hello world'));
    await finishTurn(server, result, sendPromise);
  });

  it('M2-visible toolOperations API shape is unchanged (id/name/state/preview)', async () => {
    const { server, result, sendPromise } = await startTurn();
    await act(async () => {
      server.state.lastStream!.push({ type: 'tool', name: 'read', execution: { ...EXECUTION, operationId: 'call-1', kind: 'tool', state: 'running', tool: 'read' } });
      server.state.lastStream!.push({ type: 'tool_result', name: 'read', content: 'ok', execution: { ...EXECUTION, operationId: 'call-1', kind: 'tool', state: 'completed', tool: 'read', preview: 'ok' } });
    });
    await waitFor(() => expect(result.current.toolOperations).toHaveLength(1));
    const op = result.current.toolOperations[0]!;
    expect(Object.keys(op).sort()).toEqual(['id', 'name', 'preview', 'state']);
    await finishTurn(server, result, sendPromise);
  });
});