/**
 * GA-UI-004 — Optimistic human turn + active turn UX.
 *
 * Deterministic tests (no localhost/OpenCode). A mutable in-memory
 * "server" simulates Conversation authority: the stream POST persists the
 * human message immediately; canonical messages are served on GET reload.
 *
 * Proves (§12):
 * - Send → human bubble synchronously visible (before any server event)
 * - Send → composer clears (+ focus restored)
 * - Send → Thinking visible
 * - server acknowledgement → no duplicate human bubble
 * - status → replaces Thinking
 * - first delta → same Assistant active turn grows
 * - subsequent deltas → same response grows
 * - done → response actions appear (and only then)
 * - failed submission → human message remains (+ Retry)
 * - retry → no duplicate logical turn
 * - near-bottom → streaming follows
 * - scrolled-up → no forced scroll
 * - new-response control → returns to bottom
 * - Enter → send / Shift+Enter → newline / empty+whitespace → no send
 * - submitting → no duplicate submit
 * - Stop → terminal state with reconciled human message
 * - minimizing panel (unmount) → active turn continues (no cancel)
 *
 * @see docs/blueprint/GA-UI-004-active-turn-ux.md
 */

// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
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
import { useAssistantConversation } from '../src/hooks/useAssistantConversation';

const ISO = '2026-01-01T00:00:00Z';
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// ─── Deferred SSE stream harness ────────────────────────────────

class StreamHarness {
  private chunks: Uint8Array[] = [];
  private waiters: Array<(r: { done: boolean; value?: Uint8Array }) => void> = [];
  private closed = false;

  push(event: { type: string; content?: string; name?: string }) {
    const line = `data: ${JSON.stringify({ event })}\n\n`;
    const bytes = new TextEncoder().encode(line);
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

// ─── In-memory Conversation authority simulator ─────────────────

interface ServerMessage {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  createdAt: string;
  model?: string;
}

function makeServer(initialMessages: ServerMessage[] = []) {
  const serverMessages: ServerMessage[] = [...initialMessages];
  let msgCounter = serverMessages.length;
  const state = { lastStream: null as StreamHarness | null, lastBody: null as any };

  async function impl(url: string, opts?: { method?: string; body?: string }) {
    const method = opts?.method ?? 'GET';
    if (url === '/api/conversations' && method === 'GET') {
      return {
        ok: true,
        json: async () => ({
          conversations: [
            {
              id: 'conv-1',
              title: 'T',
              messageCount: serverMessages.length,
              status: 'active',
              createdAt: ISO,
              updatedAt: ISO,
            },
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
      // Server persists the human message before streaming (authority).
      msgCounter += 1;
      serverMessages.push({
        id: `msg-server-${msgCounter}`,
        conversationId: 'conv-1',
        role: 'user',
        content: body.message,
        createdAt: ISO,
      });
      const stream = new StreamHarness();
      state.lastStream = stream;
      state.lastBody = body;
      return { ok: true, body: { getReader: () => stream.getReader() } };
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  }

  function persistAssistant(content: string) {
    msgCounter += 1;
    serverMessages.push({
      id: `msg-server-${msgCounter}`,
      conversationId: 'conv-1',
      role: 'assistant',
      content,
      createdAt: ISO,
      model: 'mimo-v2.5',
    });
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
    abortStream: vi.fn(),
    ...overrides,
  } as any;
}

function setScrollMetrics(el: HTMLElement, values: { scrollHeight: number; clientHeight: number; scrollTop: number }) {
  Object.defineProperty(el, 'scrollHeight', { value: values.scrollHeight, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: values.clientHeight, configurable: true });
  el.scrollTop = values.scrollTop;
}

// ─── Tests ──────────────────────────────────────────────────────

describe('GA-UI-004 — optimistic human turn + active turn UX', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // ── Hook: synchronous optimistic projection ──

  it('Send → human turn projected synchronously with Thinking (no server event yet)', async () => {
    const server = makeServer();
    mockFetch.mockImplementation(server.impl as any);
    const { result } = renderHook(() => useAssistantConversation());
    await waitFor(() => expect(result.current.listLoading).toBe(false));
    await act(async () => {
      result.current.selectConversation('conv-1');
    });
    await waitFor(() => expect(result.current.selectedId).toBe('conv-1'));

    // Stream POST stays in-flight: no status/delta/done has arrived.
    act(() => {
      void result.current.sendMessage('Check the repository status.');
    });

    expect(result.current.optimisticTurns).toHaveLength(1);
    expect(result.current.optimisticTurns[0].content).toBe('Check the repository status.');
    expect(result.current.optimisticTurns[0].delivery).toBe('submitting');
    expect(result.current.optimisticTurns[0].clientTurnId).toMatch(/^turn-/);
    expect(result.current.streamState).toBe('sending');
    expect(result.current.streamStatus).toBe('Thinking…');

    // The correlation id travels with the submission.
    expect(server.state.lastBody.clientMessageId).toBe(result.current.optimisticTurns[0].clientTurnId);

    act(() => {
      result.current.abortStream();
    });
  });

  it('submitting → duplicate send is dropped (single stream request)', async () => {
    const server = makeServer();
    mockFetch.mockImplementation(server.impl as any);
    const { result } = renderHook(() => useAssistantConversation());
    await waitFor(() => expect(result.current.listLoading).toBe(false));
    await act(async () => {
      result.current.selectConversation('conv-1');
    });
    await waitFor(() => expect(result.current.selectedId).toBe('conv-1'));

    const streamCalls = () =>
      mockFetch.mock.calls.filter((c) => String(c[0]).endsWith('/stream')).length;
    const before = streamCalls();
    act(() => {
      void result.current.sendMessage('first');
      void result.current.sendMessage('second');
    });
    expect(streamCalls()).toBe(before + 1);
    expect(result.current.optimisticTurns).toHaveLength(1);

    act(() => {
      result.current.abortStream();
    });
  });

  it('failed submission → message remains failed; retry → same logical turn, no duplicate', async () => {
    const server = makeServer();
    mockFetch.mockImplementation(server.impl as any);
    const { result } = renderHook(() => useAssistantConversation());
    await waitFor(() => expect(result.current.listLoading).toBe(false));
    await act(async () => {
      result.current.selectConversation('conv-1');
    });
    await waitFor(() => expect(result.current.selectedId).toBe('conv-1'));

    // First attempt: network failure before any HTTP response.
    // URL-conditional (not mockImplementationOnce): the initial list fetch
    // must still succeed.
    let failStreams = true;
    const baseImpl = server.impl;
    mockFetch.mockImplementation(((url: string, opts?: { method?: string; body?: string }) => {
      if (failStreams && String(url).endsWith('/stream')) return Promise.reject(new Error('Network error'));
      return baseImpl(url, opts);
    }) as any);
    await act(async () => {
      await result.current.sendMessage('hello');
    });

    expect(result.current.streamState).toBe('failed');
    expect(result.current.streamError).toContain('Failed to send');
    expect(result.current.optimisticTurns).toHaveLength(1);
    expect(result.current.optimisticTurns[0].delivery).toBe('failed');
    // Nothing persisted server-side.
    expect(server.serverMessages).toHaveLength(0);

    const turnId = result.current.optimisticTurns[0].clientTurnId;

    // Retry reuses the same logical turn (complete concurrently: the retry
    // promise only resolves once the server delivers terminal events).
    failStreams = false;
    let retryPromise: Promise<void> | undefined;
    act(() => {
      retryPromise = result.current.retryTurn(turnId);
    });
    await waitFor(() => expect(server.state.lastStream).toBeDefined());
    const stream = server.state.lastStream;
    server.persistAssistant('hi there');
    await act(async () => {
      stream!.push({ type: 'done' });
      stream!.close();
      await retryPromise;
    });

    await waitFor(() => expect(result.current.streamState).toBe('completed'));
    expect(result.current.optimisticTurns).toHaveLength(0);
    // Exactly one persisted human message — no duplicate logical turn.
    expect(server.serverMessages.filter((m) => m.role === 'user')).toHaveLength(1);
    expect(result.current.messages.filter((m) => m.role === 'user')).toHaveLength(1);
  });

  it('provider failure after accept → reconciles to canonical human (no duplicate)', async () => {
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
      sendPromise = result.current.sendMessage('hello');
    });
    const stream = server.state.lastStream;
    expect(stream).toBeDefined();
    await act(async () => {
      stream!.push({ type: 'error', content: 'Model unavailable' });
      await sendPromise;
    });

    expect(result.current.streamState).toBe('failed');
    expect(result.current.streamError).toContain('Assistant response failed');
    // Optimistic dropped; canonical human present exactly once.
    expect(result.current.optimisticTurns).toHaveLength(0);
    expect(result.current.messages.filter((m) => m.role === 'user' && m.content === 'hello')).toHaveLength(1);
  });

  it('Stop → terminal state with reconciled human message', async () => {
    const server = makeServer();
    mockFetch.mockImplementation(server.impl as any);
    const { result } = renderHook(() => useAssistantConversation());
    await waitFor(() => expect(result.current.listLoading).toBe(false));
    await act(async () => {
      result.current.selectConversation('conv-1');
    });
    await waitFor(() => expect(result.current.selectedId).toBe('conv-1'));

    act(() => {
      void result.current.sendMessage('long task');
    });
    expect(server.state.lastStream).toBeDefined();

    act(() => {
      result.current.abortStream();
    });
    expect(result.current.streamState).toBe('idle');
    expect(result.current.streamingText).toBe('');
    expect(result.current.streamStatus).toBeNull();

    // Human message reconciled to canonical, exactly once.
    await waitFor(() =>
      expect(result.current.messages.filter((m) => m.role === 'user' && m.content === 'long task')).toHaveLength(1),
    );
    expect(result.current.optimisticTurns).toHaveLength(0);
  });

  // ── Panel: composer behavior ──

  it('Enter → send + composer clears; Shift+Enter → newline; empty/whitespace → no send', async () => {
    const sendMessage = vi.fn();
    const assistant = stubAssistant({ sendMessage });
    render(<ConversationPanel assistant={assistant} />);

    const textarea = screen.getByPlaceholderText('Ask anything about this workspace…') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Hello' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][0]).toBe('Hello');
    expect(textarea.value).toBe('');

    fireEvent.change(textarea, { target: { value: 'line1' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(sendMessage).toHaveBeenCalledTimes(1);

    fireEvent.change(textarea, { target: { value: '   ' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const btn = screen.getByRole('button', { name: /send message/i });
    expect(btn.hasAttribute('disabled')).toBe(true);
  });

  it('failed submission → human message remains with Retry; retry reuses the turn', async () => {
    const retryTurn = vi.fn();
    const assistant = stubAssistant({
      streamState: 'failed',
      streamError: 'Failed to send: Network error',
      optimisticTurns: [
        {
          clientTurnId: 'turn-abc',
          conversationId: 'conv-1',
          content: 'Check the repository status.',
          createdAt: ISO,
          delivery: 'failed',
        },
      ],
      retryTurn,
    });
    render(<ConversationPanel assistant={assistant} />);

    // Message was not silently removed.
    expect(screen.getByText('Check the repository status.')).toBeDefined();
    expect(screen.getByText('Failed to send')).toBeDefined();
    const retry = screen.getByRole('button', { name: /retry sending message/i });
    fireEvent.click(retry);
    expect(retryTurn).toHaveBeenCalledTimes(1);
    expect(retryTurn).toHaveBeenCalledWith('turn-abc');
    // A single human bubble for the single logical turn.
    expect(screen.getAllByTestId('human-message')).toHaveLength(1);
  });

  it('status replaces Thinking; deltas grow the same active turn; no actions until done', async () => {
    const assistant = stubAssistant({
      streamState: 'sending',
      streamStatus: 'Thinking…',
      streamingText: '',
    });
    const { rerender } = render(<ConversationPanel assistant={assistant} />);
    expect(screen.getByTestId('assistant-active-turn')).toBeDefined();
    expect(screen.getByTestId('active-turn-status').textContent).toContain('Thinking…');

    // Operational status replaces Thinking… (no second bubble).
    rerender(
      <ConversationPanel
        assistant={stubAssistant({
          streamState: 'streaming',
          streamStatus: 'Reading package.json…',
          streamingText: '',
        })}
      />,
    );
    expect(screen.getAllByTestId('assistant-active-turn')).toHaveLength(1);
    expect(screen.getByTestId('active-turn-status').textContent).toContain('Reading package.json…');
    expect(screen.queryByText('Thinking…')).toBeNull();

    // First delta grows the same turn.
    rerender(
      <ConversationPanel
        assistant={stubAssistant({
          streamState: 'streaming',
          streamStatus: 'Preparing response…',
          streamingText: 'The package name is',
        })}
      />,
    );
    expect(screen.getAllByTestId('assistant-active-turn')).toHaveLength(1);
    expect(screen.getAllByTestId('active-turn-text')).toHaveLength(1);

    // Subsequent deltas grow the same response.
    rerender(
      <ConversationPanel
        assistant={stubAssistant({
          streamState: 'streaming',
          streamStatus: 'Preparing response…',
          streamingText: 'The package name is vestara-ai-core.',
        })}
      />,
    );
    expect(screen.getAllByTestId('assistant-active-turn')).toHaveLength(1);
    expect(screen.getByTestId('active-turn-text').textContent).toContain('vestara-ai-core');

    // While streaming: GA-UI-003 actions are absent.
    expect(screen.queryByTestId('assistant-response-actions')).toBeNull();
  });

  it('done → completed response shows Copy + Share actions', async () => {
    const assistant = stubAssistant({
      selectedId: 'conv-1',
      streamState: 'completed',
      messages: [
        { id: 'm1', conversationId: 'conv-1', role: 'user', content: 'ping', createdAt: ISO },
        {
          id: 'm2',
          conversationId: 'conv-1',
          role: 'assistant',
          content: 'The package name is vestara-ai-core.',
          createdAt: ISO,
          model: 'mimo-v2.5',
        },
      ],
    });
    render(<ConversationPanel assistant={assistant} />);
    expect(screen.queryByTestId('assistant-active-turn')).toBeNull();
    expect(screen.getByTestId('assistant-response-actions')).toBeDefined();
    expect(screen.getByRole('button', { name: /copy response/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /share response/i })).toBeDefined();
  });

  // ── Panel: auto-scroll behavior ──

  function scrollableAssistant(overrides?: Record<string, unknown>) {
    return stubAssistant({
      selectedId: 'conv-1',
      streamState: 'streaming',
      streamStatus: 'Reading package.json…',
      streamingText: 'partial',
      messages: [{ id: 'm1', conversationId: 'conv-1', role: 'user', content: 'hi', createdAt: ISO }],
      ...overrides,
    });
  }

  it('near-bottom → streaming follows', async () => {
    const { rerender } = render(<ConversationPanel assistant={scrollableAssistant()} />);
    const el = screen.getByTestId('conversation-scroll');
    setScrollMetrics(el, { scrollHeight: 2000, clientHeight: 500, scrollTop: 1500 });

    rerender(<ConversationPanel assistant={scrollableAssistant({ streamingText: 'partial + more' })} />);
    expect(el.scrollTop).toBe(2000);
    expect(screen.queryByTestId('scroll-to-latest')).toBeNull();
  });

  it('scrolled-up → no forced scroll; control appears and returns to bottom', async () => {
    const { rerender } = render(<ConversationPanel assistant={scrollableAssistant()} />);
    const el = screen.getByTestId('conversation-scroll');
    setScrollMetrics(el, { scrollHeight: 2000, clientHeight: 500, scrollTop: 100 });
    fireEvent.scroll(el);

    // New delta while scrolled up: no force-scroll, jump control appears.
    rerender(<ConversationPanel assistant={scrollableAssistant({ streamingText: 'partial + more' })} />);
    expect(el.scrollTop).toBe(100);
    const jump = screen.getByTestId('scroll-to-latest');
    expect(jump.textContent).toContain('New response');

    // Clicking returns to the active turn and resumes follow.
    fireEvent.click(jump);
    expect(el.scrollTop).toBe(2000);
    expect(screen.queryByTestId('scroll-to-latest')).toBeNull();

    rerender(<ConversationPanel assistant={scrollableAssistant({ streamingText: 'partial + even more' })} />);
    expect(el.scrollTop).toBe(2000);
  });

  it('minimizing the panel (unmount) does not cancel the active turn', async () => {
    const abortStream = vi.fn();
    const assistant = stubAssistant({
      streamState: 'streaming',
      streamStatus: 'Reading package.json…',
      streamingText: 'partial',
      abortStream,
    });
    const { unmount } = render(<ConversationPanel assistant={assistant} />);
    expect(screen.getByTestId('assistant-active-turn')).toBeDefined();
    unmount();
    expect(abortStream).not.toHaveBeenCalled();
  });

  // ── Integration: full turn through hook + panel ──

  it('full turn: Send → human + Thinking sync → status → streaming → done → single human + actions', async () => {
    const server = makeServer();
    mockFetch.mockImplementation(server.impl as any);
    let hook: any;
    function Harness() {
      hook = useAssistantConversation();
      return <ConversationPanel assistant={hook} />;
    }
    render(<Harness />);
    await waitFor(() => expect(hook.listLoading).toBe(false));
    await act(async () => {
      hook.selectConversation('conv-1');
    });
    await waitFor(() => expect(hook.selectedId).toBe('conv-1'));

    const textarea = screen.getByPlaceholderText('Ask anything about this workspace…') as HTMLTextAreaElement;
    textarea.focus();
    fireEvent.change(textarea, { target: { value: 'Check the repository status.' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    // Synchronous: composer cleared, human bubble + Thinking visible,
    // with zero server events delivered.
    expect(textarea.value).toBe('');
    expect(screen.getByText('Check the repository status.')).toBeDefined();
    expect(screen.getByTestId('assistant-active-turn')).toBeDefined();
    expect(screen.getByTestId('active-turn-status').textContent).toContain('Thinking…');
    const stream = server.state.lastStream;
    expect(stream).toBeDefined();

    // Operational status replaces Thinking… in the same turn.
    await act(async () => {
      stream!.push({ type: 'status', content: 'Reading package.json…' });
      await flush();
    });
    expect(screen.getAllByTestId('assistant-active-turn')).toHaveLength(1);
    expect(screen.getByTestId('active-turn-status').textContent).toContain('Reading package.json…');

    // First + subsequent deltas grow the same response.
    await act(async () => {
      stream!.push({ type: 'delta', content: 'The package name is ' });
      await flush();
    });
    expect(screen.getAllByTestId('active-turn-text')).toHaveLength(1);
    await act(async () => {
      stream!.push({ type: 'delta', content: 'vestara-ai-core.' });
      await flush();
    });
    expect(screen.getAllByTestId('assistant-active-turn')).toHaveLength(1);
    expect(screen.getByTestId('active-turn-text').textContent).toContain('vestara-ai-core');
    expect(screen.queryByTestId('assistant-response-actions')).toBeNull();

    // Done: server persists the final answer; canonical reload reconciles.
    server.persistAssistant('The package name is vestara-ai-core.');
    await act(async () => {
      stream!.push({ type: 'done' });
      stream!.close();
      await flush();
    });
    await waitFor(() => expect(hook.streamState).toBe('completed'));

    // No duplicate human bubble after acknowledgement.
    await waitFor(() => expect(screen.getAllByText('Check the repository status.')).toHaveLength(1));
    expect(screen.queryByTestId('assistant-active-turn')).toBeNull();
    expect(screen.getByTestId('assistant-response-actions')).toBeDefined();
    expect(screen.getByRole('button', { name: /copy response/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /share response/i })).toBeDefined();

    // Composer focus restored for the next turn.
    await waitFor(() => expect(document.activeElement).toBe(textarea));
  });

  it('integration: failed send stays visible; retry completes with a single persisted turn', async () => {
    const server = makeServer();
    mockFetch.mockImplementation(server.impl as any);
    let hook: any;
    function Harness() {
      hook = useAssistantConversation();
      return <ConversationPanel assistant={hook} />;
    }
    render(<Harness />);
    await waitFor(() => expect(hook.listLoading).toBe(false));
    await act(async () => {
      hook.selectConversation('conv-1');
    });
    await waitFor(() => expect(hook.selectedId).toBe('conv-1'));

    let failStreams = true;
    const baseImpl = server.impl;
    mockFetch.mockImplementation(((url: string, opts?: { method?: string; body?: string }) => {
      if (failStreams && String(url).endsWith('/stream')) return Promise.reject(new Error('Network error'));
      return baseImpl(url, opts);
    }) as any);
    const textarea = screen.getByPlaceholderText('Ask anything about this workspace…');
    fireEvent.change(textarea, { target: { value: 'hello' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() => expect(screen.getByText('Failed to send')).toBeDefined());
    expect(screen.getByText('hello')).toBeDefined();

    failStreams = false;
    fireEvent.click(screen.getByRole('button', { name: /retry sending message/i }));
    await waitFor(() =>
      expect(screen.getByTestId('active-turn-status').textContent).toContain('Thinking…'),
    );
    // Still a single logical human turn while retrying.
    expect(screen.getAllByText('hello')).toHaveLength(1);

    const stream = server.state.lastStream;
    server.persistAssistant('hi there');
    await act(async () => {
      stream!.push({ type: 'done' });
      stream!.close();
      await flush();
    });
    await waitFor(() => expect(hook.streamState).toBe('completed'));
    await waitFor(() => expect(screen.getAllByText('hello')).toHaveLength(1));
    expect(server.serverMessages.filter((m) => m.role === 'user')).toHaveLength(1);
  });
});
