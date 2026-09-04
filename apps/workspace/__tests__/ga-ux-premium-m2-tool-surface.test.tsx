/**
 * GA-UX-PREMIUM M2 — Structured tool surface + execution timeline.
 *
 * Deterministic tests (no localhost/OpenCode). Operates exclusively on the
 * existing browser-facing contract (`tool` / `tool_result` / `status` /
 * `delta` / `done` / `error` with `name` + bounded `content`).
 *
 * Proves:
 * - Thinking before tool activity; tool start replaces Thinking text
 * - known tool presentation; unknown tool → generic (raw name, escaped)
 * - completed / failed lifecycle from chunk types (never prose parsing)
 * - bounded result preview (≤200) + HTML escaping
 * - same-name consecutive starts dedupe (no Read Read Read Read)
 * - timeline with multiple ops; collapse once response streams; expand;
 *   keyboard-accessible toggle (native button + focus + aria-expanded)
 * - NO fabricated structured data: edit never yields a diff, task never
 *   yields a Todo list, bash never yields exit code/duration/cwd/command
 * - no raw OpenCode internals (session IDs, args, reasoning) in the surface
 * - borderless final response + Copy/Share preserved
 *
 * @see docs/blueprint/GA-UX-PREMIUM-assistant-experience.md
 */

// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
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

import { ConversationPanel } from '../src/components/assistant/ConversationPanel';
import { normalizeToolCategory, toolDisplayLabel } from '../src/components/assistant/AssistantToolCard';
import { useAssistantConversation } from '../src/hooks/useAssistantConversation';

const ISO = '2026-01-01T00:00:00Z';

// ─── Deferred SSE stream harness (mirrors GA-UI-004) ─────────────

class StreamHarness {
  private chunks: Uint8Array[] = [];
  private waiters: Array<(r: { done: boolean; value?: Uint8Array }) => void> = [];
  private closed = false;

  push(event: { type: string; content?: string; name?: string }) {
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
          conversations: [{ id: 'conv-1', title: 'T', messageCount: serverMessages.length, status: 'active', createdAt: ISO, updatedAt: ISO }],
        }),
      };
    }
    if (url === '/api/conversations/conv-1' && method === 'GET') {
      return {
        ok: true,
        json: async () => ({
          conversation: { id: 'conv-1', userId: 'local', title: 'T', messages: [...serverMessages], status: 'active', createdAt: ISO, updatedAt: ISO },
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

  function persistAssistant(content: string) {
    msgCounter += 1;
    serverMessages.push({ id: `msg-server-${msgCounter}`, conversationId: 'conv-1', role: 'assistant', content, createdAt: ISO, model: 'mimo-v2.5' });
  }

  return { serverMessages, impl, persistAssistant, state };
}

function stubAssistant(overrides?: Record<string, unknown>) {
  return {
    conversations: [],
    listLoading: false,
    listError: null,
    selectedId: 'conv-1',
    selectedConversation: null,
    selectConversation: vi.fn(),
    createConversation: vi.fn(),
    messages: [],
    loadMessages: vi.fn(),
    optimisticTurns: [],
    retryTurn: vi.fn(),
    sendMessage: vi.fn(),
    streamState: 'idle' as const,
    streamingText: '',
    streamStatus: null as string | null,
    streamError: null,
    toolOperations: [],
    abortStream: vi.fn(),
    refreshConversations: vi.fn(),
    ...overrides,
  } as any;
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

// ─── Tests ──────────────────────────────────────────────────────

describe('GA-UX-PREMIUM M2 — tool surface + execution timeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('Thinking precedes tool activity with zero operations', async () => {
    const { result } = await startTurn();
    expect(result.current.streamStatus).toBe('Thinking…');
    expect(result.current.toolOperations).toHaveLength(0);
  });

  it('tool start projects a running operation and replaces Thinking', async () => {
    const { server, result } = await startTurn();
    await act(async () => {
      server.state.lastStream!.push({ type: 'tool', name: 'read' });
    });
    await waitFor(() => expect(result.current.toolOperations).toHaveLength(1));
    expect(result.current.toolOperations[0].name).toBe('read');
    expect(result.current.toolOperations[0].state).toBe('running');
    // Thinking replaced by the tool status — one clear active state.
    expect(result.current.streamStatus).not.toBe('Thinking…');
  });

  it('consecutive same-name starts dedupe to one logical operation', async () => {
    const { server, result } = await startTurn();
    await act(async () => {
      server.state.lastStream!.push({ type: 'tool', name: 'read' });
      server.state.lastStream!.push({ type: 'tool', name: 'read' });
      server.state.lastStream!.push({ type: 'tool', name: 'read' });
    });
    await waitFor(() => expect(result.current.toolOperations).toHaveLength(1));
    expect(result.current.toolOperations).toHaveLength(1);
  });

  it('tool_result completes with a bounded preview; distinct tools accumulate', async () => {
    const { server, result } = await startTurn();
    await act(async () => {
      server.state.lastStream!.push({ type: 'tool_result', name: 'search', content: '12 matches...' });
      server.state.lastStream!.push({ type: 'tool_result', name: 'read', content: 'file text' });
    });
    await waitFor(() => expect(result.current.toolOperations).toHaveLength(2));
    const [search, read] = result.current.toolOperations;
    expect(search.state).toBe('completed');
    expect(search.preview).toBe('12 matches...');
    expect(read.state).toBe('completed');
  });

  it('tool_result preview is bounded to 200 chars', async () => {
    const { server, result } = await startTurn();
    await act(async () => {
      server.state.lastStream!.push({ type: 'tool_result', name: 'bash', content: 'x'.repeat(500) });
    });
    await waitFor(() => expect(result.current.toolOperations).toHaveLength(1));
    expect(result.current.toolOperations[0].preview!.length).toBeLessThanOrEqual(200);
  });

  it('failed tool lifecycle is proven by the contract (error content / error chunk)', async () => {
    const { server, result } = await startTurn();
    await act(async () => {
      server.state.lastStream!.push({ type: 'tool_result', name: 'bash', content: 'failed' });
    });
    await waitFor(() => expect(result.current.toolOperations).toHaveLength(1));
    expect(result.current.toolOperations[0].state).toBe('failed');
    expect(result.current.toolOperations[0].preview).toBeUndefined();
  });

  it('turn error marks leftover running operations failed', async () => {
    const { server, result, sendPromise } = await startTurn();
    await act(async () => {
      server.state.lastStream!.push({ type: 'tool', name: 'read' });
    });
    await waitFor(() => expect(result.current.toolOperations).toHaveLength(1));
    await act(async () => {
      server.state.lastStream!.push({ type: 'error', content: 'Model unavailable' });
      await sendPromise;
    });
    await waitFor(() => expect(result.current.streamState).toBe('failed'));
    expect(result.current.toolOperations[0].state).toBe('failed');
  });

  it('known tools normalize; unknown tools fall back to generic with the raw name', () => {
    expect(normalizeToolCategory('read')).toBe('read');
    expect(normalizeToolCategory('grep')).toBe('search');
    expect(normalizeToolCategory('glob')).toBe('list');
    expect(normalizeToolCategory('edit')).toBe('edit');
    expect(normalizeToolCategory('bash')).toBe('bash');
    expect(normalizeToolCategory('todo')).toBe('task');
    expect(normalizeToolCategory('webfetch')).toBe('generic');
    expect(toolDisplayLabel('read', 'read')).toBe('Read');
    expect(toolDisplayLabel('generic', 'webfetch')).toBe('webfetch');
    expect(toolDisplayLabel('generic', '')).toBe('Tool');
  });

  it('timeline lists multiple operations expanded while executing', () => {
    const assistant = stubAssistant({
      streamState: 'streaming',
      streamStatus: 'Preparing response…',
      streamingText: '',
      toolOperations: [
        { id: 'op-1', name: 'search', state: 'completed', preview: '12 matches...' },
        { id: 'op-2', name: 'read', state: 'completed' },
      ],
    });
    render(<ConversationPanel assistant={assistant} />);

    const timeline = screen.getByTestId('assistant-timeline');
    expect(within(timeline).getAllByTestId('assistant-tool-card')).toHaveLength(2);
    // Completed rows are quiet but legible.
    expect(timeline.textContent).toContain('Search');
    expect(timeline.textContent).toContain('Read');
    // Thinking text block is replaced by the timeline — no duplication.
    expect(screen.queryByTestId('active-turn-thinking')).toBeNull();
  });

  it('timeline collapses once the response streams; toggle expands with keyboard access', () => {
    const assistant = stubAssistant({
      streamState: 'streaming',
      streamStatus: 'Preparing response…',
      streamingText: 'The implementation is complete.',
      toolOperations: [
        { id: 'op-1', name: 'search', state: 'completed' },
        { id: 'op-2', name: 'read', state: 'completed' },
        { id: 'op-3', name: 'bash', state: 'completed' },
      ],
    });
    render(<ConversationPanel assistant={assistant} />);

    const toggle = screen.getByTestId('assistant-timeline-toggle');
    expect(toggle.textContent).toContain('3 operations');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('assistant-tool-card')).toBeNull();
    // Response streams borderless beneath the collapsed timeline.
    expect(screen.getByTestId('active-turn-text').textContent).toContain('The implementation is complete');

    // Native button: focusable + activatable.
    (toggle as HTMLButtonElement).focus();
    expect(document.activeElement).toBe(toggle);
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByTestId('assistant-tool-card')).toHaveLength(3);
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('preview content is escaped, never raw HTML', () => {
    const assistant = stubAssistant({
      streamState: 'streaming',
      streamStatus: 'Preparing response…',
      streamingText: '',
      toolOperations: [{ id: 'op-1', name: 'search', state: 'completed', preview: '<img src=x onerror=alert(1)> found' }],
    });
    render(<ConversationPanel assistant={assistant} />);

    const preview = screen.getByTestId('assistant-tool-preview');
    expect(preview.textContent).toContain('<img src=x onerror=alert(1)> found');
    expect(preview.querySelector('img')).toBeNull();
  });

  it('edit never fabricates a diff; task never fabricates a Todo list; bash never fabricates terminal metadata', () => {
    const assistant = stubAssistant({
      streamState: 'streaming',
      streamStatus: 'Preparing response…',
      streamingText: '',
      toolOperations: [
        { id: 'op-1', name: 'edit', state: 'completed' },
        { id: 'op-2', name: 'task', state: 'completed' },
        { id: 'op-3', name: 'bash', state: 'completed', preview: '91 tests passed' },
      ],
    });
    const { container } = render(<ConversationPanel assistant={assistant} />);

    expect(screen.queryByTestId('assistant-code-edit')).toBeNull();
    expect(screen.queryByTestId('assistant-task-list')).toBeNull();
    expect(screen.queryByTestId('assistant-terminal')).toBeNull();
    expect(screen.queryByTestId('assistant-verification')).toBeNull();
    const text = container.textContent ?? '';
    expect(text).not.toContain('exit 0');
    expect(text).not.toMatch(/\d+\.\d+s/);
    expect(text).not.toContain('cwd');
    // Labels stay at the proven level only.
    expect(screen.getByTestId('assistant-timeline').textContent).toContain('Edit');
    expect(screen.getByTestId('assistant-timeline').textContent).toContain('Task');
    expect(screen.getByTestId('assistant-timeline').textContent).toContain('Bash');
  });

  it('surface exposes no raw OpenCode internals', () => {
    const assistant = stubAssistant({
      streamState: 'streaming',
      streamStatus: 'Running read…',
      streamingText: '',
      toolOperations: [{ id: 'op-1', name: 'read', state: 'completed', preview: 'ok' }],
    });
    const { container } = render(<ConversationPanel assistant={assistant} />);
    const text = container.textContent ?? '';
    expect(text).not.toContain('message.part');
    expect(text).not.toContain('session_');
    expect(text).not.toContain('ses_');
  });

  it('borderless final response + Copy/Share preserved alongside tool history', () => {
    const assistant = stubAssistant({
      selectedId: 'conv-1',
      messages: [
        { id: 'm1', conversationId: 'conv-1', role: 'user', content: 'Inspect ConversationPanel.tsx.', createdAt: ISO },
        { id: 'm2', conversationId: 'conv-1', role: 'assistant', content: 'Updated the copy.', createdAt: ISO, model: 'mimo-v2.5' },
      ],
    });
    render(<ConversationPanel assistant={assistant} />);

    const canvas = screen.getByTestId('assistant-response-canvas');
    expect(canvas.className).not.toContain('rounded-xl');
    expect(canvas.className).not.toContain('bg-zinc-800/40');
    expect(screen.getByTestId('assistant-response-actions')).toBeDefined();
  });
});
