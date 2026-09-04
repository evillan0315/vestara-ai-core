/**
 * GA-UI-006 — Floating Assistant conversation navigation.
 *
 * Deterministic tests (no localhost/OpenCode):
 *
 * - Pure: title fallback/truncation, temporal grouping, local search.
 * - Hook: new-conversation activation, previous preserved, selection loads
 *   canonical messages with GET only (no replay, no new turn, no dupes),
 *   active-turn switching (abort projection, execution persists
 *   server-side), composer targets selected conversation, list refresh.
 * - Panel: open/close history, new action, list, select, active indicator,
 *   title fallback, search, no-result, grouping, rich historical response
 *   with Copy/Share, suggestions surface + suggestion send.
 * - Integration: A→B→A→B switching integrity, Conversation C starts clean,
 *   opening history mid-turn never aborts.
 *
 * @see docs/blueprint/GA-UI-006-conversation-navigation.md
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
import { FloatingPanel } from '../src/components/assistant/FloatingPanel';
import { useAssistantConversation } from '../src/hooks/useAssistantConversation';
import {
  filterByTitle,
  groupConversations,
  groupKeyFor,
  isDefaultTitle,
  resolveDisplayTitle,
  truncateTitle,
} from '../src/components/assistant/conversationTitles';

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const isoNow = () => new Date().toISOString();
const isoDaysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

// ─── Deferred SSE stream harness ────────────────────────────────

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

// ─── Multi-conversation Conversation authority simulator ────────

interface SimMessage {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  createdAt: string;
  model?: string;
}

function makeMultiServer() {
  const messages = new Map<string, SimMessage[]>();
  const titles = new Map<string, string>();
  const stamps = new Map<string, string>();
  let counter = 0;
  const calls: Array<{ method: string; url: string }> = [];
  const streams = new Map<string, StreamHarness>();

  function seed(id: string, title: string, updatedAt: string, msgs: Array<{ role: string; content: string }>) {
    titles.set(id, title);
    stamps.set(id, updatedAt);
    messages.set(
      id,
      msgs.map((m, i) => ({
        id: `${id}-m${i + 1}`,
        conversationId: id,
        role: m.role,
        content: m.content,
        createdAt: updatedAt,
        ...(m.role === 'assistant' ? { model: 'muse-spark-1.3-contributor' } : {}),
      })),
    );
  }

  seed('conv-a', 'Conversation 1', isoNow(), [
    { role: 'user', content: 'Explain Vestara in one sentence.' },
    { role: 'assistant', content: 'Vestara is a workspace.' },
  ]);
  seed('conv-b', 'Conversation 2', isoDaysAgo(1), [
    { role: 'user', content: 'Read package.json and tell me the package name.' },
    { role: 'assistant', content: 'The package name is **vestara-ai-core**.' },
  ]);

  async function impl(url: string, opts?: { method?: string; body?: string }) {
    const method = opts?.method ?? 'GET';
    calls.push({ method, url });
    if (url === '/api/conversations' && method === 'GET') {
      return {
        ok: true,
        json: async () => ({
          conversations: [...titles.keys()].map((id) => ({
            id,
            title: titles.get(id),
            messageCount: (messages.get(id) ?? []).length,
            status: 'active',
            createdAt: stamps.get(id),
            updatedAt: stamps.get(id),
          })),
        }),
      };
    }
    if (url === '/api/conversations' && method === 'POST') {
      counter += 1;
      const id = `conv-new-${counter}`;
      // Server assigns the counter-default title (authority behavior).
      titles.set(id, `Conversation ${counter + 2}`);
      stamps.set(id, isoNow());
      messages.set(id, []);
      return {
        ok: true,
        json: async () => ({
          conversation: { id, userId: 'local', title: titles.get(id), messages: [], status: 'active', createdAt: isoNow(), updatedAt: isoNow() },
        }),
      };
    }
    const match = /^\/api\/conversations\/([^/]+)(\/stream)?$/.exec(url);
    if (match) {
      const id = decodeURIComponent(match[1]);
      if (method === 'GET' && !match[2]) {
        return {
          ok: true,
          json: async () => ({
            conversation: {
              id, userId: 'local', title: titles.get(id) ?? id, messages: [...(messages.get(id) ?? [])],
              status: 'active', createdAt: stamps.get(id), updatedAt: stamps.get(id),
            },
          }),
        };
      }
      if (method === 'POST' && match[2] === '/stream') {
        const body = JSON.parse(opts?.body ?? '{}');
        const list = messages.get(id) ?? [];
        list.push({ id: `${id}-m${list.length + 1}`, conversationId: id, role: 'user', content: body.message, createdAt: isoNow() });
        messages.set(id, list);
        const stream = new StreamHarness();
        streams.set(id, stream);
        return { ok: true, body: { getReader: () => stream.getReader() } };
      }
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  }

  function persistAssistant(id: string, content: string) {
    const list = messages.get(id) ?? [];
    list.push({ id: `${id}-m${list.length + 1}`, conversationId: id, role: 'assistant', content, createdAt: isoNow(), model: 'muse-spark-1.3-contributor' });
    messages.set(id, list);
  }

  const postsTo = (suffix: string) => calls.filter((c) => c.method === 'POST' && c.url.endsWith(suffix)).length;

  return { impl, calls, streams, persistAssistant, postsTo, messages };
}

function stubAssistant(overrides?: Record<string, unknown>) {
  return {
    conversations: [],
    listLoading: false,
    listError: null,
    refreshConversations: vi.fn(),
    selectedId: null,
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

function summary(id: string, title: string, updatedAt: string, messageCount = 2) {
  return { id, title, messageCount, status: 'active' as const, createdAt: updatedAt, updatedAt };
}

// ─── Tests ──────────────────────────────────────────────────────

describe('GA-UI-006 — conversation navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // ── Pure: titles ──

  it('title fallback uses the first human message, bounded', () => {
    expect(isDefaultTitle('Conversation 12')).toBe(true);
    expect(isDefaultTitle('Provider configuration')).toBe(false);
    expect(isDefaultTitle('')).toBe(true);
    const long = 'Inspect the provider configuration and tell me everything about it in detail please';
    const resolved = resolveDisplayTitle('Conversation 3', long);
    expect(resolved).toBe(truncateTitle(long));
    expect(resolved.endsWith('…')).toBe(true);
    expect(resolved.length).toBeLessThanOrEqual(49);
  });

  it('authoritative non-default titles win; defaults without humans stay as-is', () => {
    expect(resolveDisplayTitle('Vestara architecture', 'hello')).toBe('Vestara architecture');
    expect(resolveDisplayTitle('Conversation 5', null)).toBe('Conversation 5');
    expect(resolveDisplayTitle('Conversation 5', '   ')).toBe('Conversation 5');
    expect(resolveDisplayTitle(undefined, undefined)).toBe('Untitled conversation');
  });

  it('whitespace collapses to a single line', () => {
    expect(truncateTitle('  Inspect\nthe\t repository  ')).toBe('Inspect the repository');
  });

  // ── Pure: grouping + search ──

  it('temporal grouping projects Today/Yesterday/Previous 7 days/Older', () => {
    const now = Date.now();
    expect(groupKeyFor(new Date(now).toISOString(), now)).toBe('Today');
    expect(groupKeyFor(new Date(now - 86_400_000).toISOString(), now)).toBe('Yesterday');
    expect(groupKeyFor(new Date(now - 3 * 86_400_000).toISOString(), now)).toBe('Previous 7 days');
    expect(groupKeyFor(new Date(now - 30 * 86_400_000).toISOString(), now)).toBe('Older');
    expect(groupKeyFor('not-a-date', now)).toBe('Older');
  });

  it('groups omit empties and sort newest-first', () => {
    const now = Date.now();
    const items = [
      { id: 'old', updatedAt: new Date(now - 30 * 86_400_000).toISOString() },
      { id: 'new', updatedAt: new Date(now).toISOString() },
      { id: 'mid', updatedAt: new Date(now - 2 * 86_400_000).toISOString() },
    ];
    const groups = groupConversations(items, now);
    expect(groups.map((g) => g.group)).toEqual(['Today', 'Previous 7 days', 'Older']);
    expect(groups[0].items.map((i) => i.id)).toEqual(['new']);
  });

  it('search covers titles; empty query returns all', () => {
    const items = [{ id: 'a' }, { id: 'b' }];
    const titles = new Map([['a', 'Provider configuration'], ['b', 'Repository status']]);
    expect(filterByTitle(items, (id) => titles.get(id) ?? '', 'config')).toEqual([{ id: 'a' }]);
    expect(filterByTitle(items, (id) => titles.get(id) ?? '', 'REPO')).toEqual([{ id: 'b' }]);
    expect(filterByTitle(items, (id) => titles.get(id) ?? '', '  ')).toEqual(items);
    expect(filterByTitle(items, (id) => titles.get(id) ?? '', 'zzz')).toEqual([]);
  });

  // ── Hook: creation, selection, switching safety ──

  it('new conversation becomes active; previous conversation preserved', async () => {
    const server = makeMultiServer();
    mockFetch.mockImplementation(server.impl as any);
    const { result } = renderHook(() => useAssistantConversation());
    await waitFor(() => expect(result.current.listLoading).toBe(false));
    expect(result.current.conversations).toHaveLength(2);

    let newId: string | null = null;
    await act(async () => {
      newId = await result.current.createConversation();
    });
    expect(newId).toBeTruthy();
    expect(result.current.selectedId).toBe(newId);
    expect(result.current.messages).toHaveLength(0);
    // Previous conversations untouched server-side.
    expect(server.messages.get('conv-a')).toHaveLength(2);
    expect(server.messages.get('conv-b')).toHaveLength(2);
    expect(result.current.conversations).toHaveLength(3);
  });

  it('select loads canonical messages with GET only — no replay, no new turn', async () => {
    const server = makeMultiServer();
    mockFetch.mockImplementation(server.impl as any);
    const { result } = renderHook(() => useAssistantConversation());
    await waitFor(() => expect(result.current.listLoading).toBe(false));

    const postsBefore = server.postsTo('/stream') + server.calls.filter((c) => c.method === 'POST' && c.url.endsWith('/messages')).length;
    await act(async () => {
      result.current.selectConversation('conv-b');
    });
    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    const postsAfter = server.postsTo('/stream') + server.calls.filter((c) => c.method === 'POST' && c.url.endsWith('/messages')).length;
    // Selection is a GET: zero turn-creating POSTs, no OpenCode replay.
    expect(postsAfter).toBe(postsBefore);
    expect(server.calls.filter((c) => c.method === 'GET' && c.url === '/api/conversations/conv-b')).toHaveLength(1);
    expect(result.current.messages[0].content).toBe('Read package.json and tell me the package name.');
  });

  it('switching replaces messages without duplication', async () => {
    const server = makeMultiServer();
    mockFetch.mockImplementation(server.impl as any);
    const { result } = renderHook(() => useAssistantConversation());
    await waitFor(() => expect(result.current.listLoading).toBe(false));

    await act(async () => {
      result.current.selectConversation('conv-a');
    });
    await waitFor(() => expect(result.current.selectedId).toBe('conv-a'));
    await act(async () => {
      result.current.selectConversation('conv-b');
    });
    await waitFor(() => expect(result.current.selectedId).toBe('conv-b'));
    await waitFor(() => expect(result.current.messages.map((m) => m.id)).toEqual(['conv-b-m1', 'conv-b-m2']));
  });

  it('switching mid-turn aborts the projection only; execution persists server-side', async () => {
    const server = makeMultiServer();
    mockFetch.mockImplementation(server.impl as any);
    const { result } = renderHook(() => useAssistantConversation());
    await waitFor(() => expect(result.current.listLoading).toBe(false));
    await act(async () => {
      result.current.selectConversation('conv-a');
    });
    await waitFor(() => expect(result.current.selectedId).toBe('conv-a'));

    // Start a turn in A (stream stays open: no server events yet).
    act(() => {
      void result.current.sendMessage('Follow-up in A');
    });
    expect(result.current.optimisticTurns).toHaveLength(1);
    expect(result.current.streamState).toBe('sending');

    // Switch to B: projection aborts and reconciles, nothing corrupts.
    await act(async () => {
      result.current.selectConversation('conv-b');
    });
    expect(result.current.streamState).toBe('idle');
    expect(result.current.streamingText).toBe('');
    expect(result.current.streamStatus).toBeNull();
    expect(result.current.optimisticTurns).toHaveLength(0);
    expect(result.current.selectedId).toBe('conv-b');
    // A's human message WAS persisted server-side (execution continued).
    expect(server.messages.get('conv-a')!.filter((m) => m.role === 'user')).toHaveLength(2);

    // Server-side completion lands in A while the client views B.
    server.persistAssistant('conv-a', 'Late answer in A.');
    await act(async () => {
      result.current.selectConversation('conv-a');
    });
    await waitFor(() => expect(result.current.messages).toHaveLength(4));
    // Canonical history, no duplicates, no phantom turns.
    expect(result.current.messages.map((m) => m.id)).toEqual(['conv-a-m1', 'conv-a-m2', 'conv-a-m3', 'conv-a-m4']);
  });

  it('composer targets the selected conversation; continuity stays scoped', async () => {
    const server = makeMultiServer();
    mockFetch.mockImplementation(server.impl as any);
    const { result } = renderHook(() => useAssistantConversation());
    await waitFor(() => expect(result.current.listLoading).toBe(false));
    await act(async () => {
      result.current.selectConversation('conv-b');
    });
    await waitFor(() => expect(result.current.selectedId).toBe('conv-b'));

    act(() => {
      void result.current.sendMessage('More in B');
    });
    await waitFor(() => expect(server.streams.get('conv-b')).toBeDefined());
    const streamCalls = server.calls.filter((c) => c.method === 'POST' && c.url.endsWith('/stream'));
    expect(streamCalls).toHaveLength(1);
    expect(streamCalls[0].url).toBe('/api/conversations/conv-b/stream');
    // Conversation A untouched by B's turn.
    expect(server.messages.get('conv-a')).toHaveLength(2);

    const stream = server.streams.get('conv-b')!;
    server.persistAssistant('conv-b', 'B answer.');
    await act(async () => {
      stream.push({ type: 'done' });
      stream.close();
      await flush();
    });
    await waitFor(() => expect(result.current.streamState).toBe('completed'));
  });

  it('refreshConversations refetches list metadata', async () => {
    const server = makeMultiServer();
    mockFetch.mockImplementation(server.impl as any);
    const { result } = renderHook(() => useAssistantConversation());
    await waitFor(() => expect(result.current.listLoading).toBe(false));
    const listCalls = () => server.calls.filter((c) => c.method === 'GET' && c.url === '/api/conversations').length;
    const before = listCalls();
    await act(async () => {
      await result.current.refreshConversations();
    });
    expect(listCalls()).toBe(before + 1);
  });

  // ── Panel: history surface ──

  function historyAssistant(overrides?: Record<string, unknown>) {
    return stubAssistant({
      selectedId: 'conv-a',
      conversations: [
        summary('conv-a', 'Conversation 1', isoNow()),
        summary('conv-b', 'Conversation 2', isoDaysAgo(1)),
      ],
      messages: [
        { id: 'conv-a-m1', conversationId: 'conv-a', role: 'user', content: 'Explain Vestara in one sentence.', createdAt: isoNow() },
        { id: 'conv-a-m2', conversationId: 'conv-a', role: 'assistant', content: 'Vestara is a workspace.', createdAt: isoNow() },
      ],
      ...overrides,
    });
  }

  it('open history lists conversations; close via toggle, Escape, and select', async () => {
    const selectConversation = vi.fn();
    const assistant = historyAssistant({ selectConversation });
    render(<ConversationPanel assistant={assistant} />);

    expect(screen.queryByTestId('conversation-history')).toBeNull();
    fireEvent.click(screen.getByTestId('conversation-picker'));
    expect(screen.getByTestId('conversation-history')).toBeDefined();
    // Title fallback resolves the counter default from the first human message.
    // (Picker and history item show the same title — scope to the history.)
    const history = () => within(screen.getByTestId('conversation-history'));
    expect(history().getByText('Explain Vestara in one sentence.')).toBeDefined();
    expect(history().getByText('Today')).toBeDefined();
    expect(history().getByText('Yesterday')).toBeDefined();

    // Toggle closes.
    fireEvent.click(screen.getByTestId('conversation-picker'));
    expect(screen.queryByTestId('conversation-history')).toBeNull();

    // Escape closes.
    fireEvent.click(screen.getByTestId('conversation-picker'));
    expect(screen.getByTestId('conversation-history')).toBeDefined();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('conversation-history')).toBeNull();

    // Select closes and selects (no turn created).
    fireEvent.click(screen.getByTestId('conversation-picker'));
    fireEvent.click(history().getByRole('button', { name: /open conversation: conversation 2/i }));
    expect(selectConversation).toHaveBeenCalledTimes(1);
    expect(selectConversation).toHaveBeenCalledWith('conv-b');
    expect(assistant.sendMessage).not.toHaveBeenCalled();
    expect(screen.queryByTestId('conversation-history')).toBeNull();
  });

  it('active conversation is indicated; generating/failed states bounded', async () => {
    const assistant = historyAssistant({ streamState: 'streaming', streamingText: '…', streamStatus: 'Thinking…' });
    const { rerender } =     render(<ConversationPanel assistant={assistant} />);
    fireEvent.click(screen.getByTestId('conversation-picker'));
    const history = within(screen.getByTestId('conversation-history'));
    const active = history.getByRole('button', { name: /open conversation: explain vestara/i });
    expect(active.getAttribute('aria-current')).toBe('true');
    expect(within(active).getByText('generating')).toBeDefined();
    // Non-selected items never carry turn state.
    expect(history.queryByText('failed')).toBeNull();

    rerender(
      <ConversationPanel
        assistant={historyAssistant({ streamState: 'failed', streamError: 'Assistant response failed: down' })}
      />,
    );
    expect(within(screen.getByTestId('conversation-history')).getByText('! failed')).toBeDefined();
  });

  it('title fallback prefers authoritative titles when usable', async () => {
    const assistant = historyAssistant({
      conversations: [summary('conv-a', 'Vestara architecture', isoNow())],
    });
    render(<ConversationPanel assistant={assistant} />);
    fireEvent.click(screen.getByTestId('conversation-picker'));
    expect(within(screen.getByTestId('conversation-history')).getByText('Vestara architecture')).toBeDefined();
  });

  it('search filters titles; unknown query shows no-result state', async () => {
    const assistant = historyAssistant();
    render(<ConversationPanel assistant={assistant} />);
    fireEvent.click(screen.getByTestId('conversation-picker'));

    const search = screen.getByRole('textbox', { name: /search conversations/i });
    fireEvent.change(search, { target: { value: 'vestara in one' } });
    const history = () => within(screen.getByTestId('conversation-history'));
    expect(history().getByText('Explain Vestara in one sentence.')).toBeDefined();
    expect(history().queryByText('Conversation 2')).toBeNull();

    fireEvent.change(search, { target: { value: 'zzz-no-match' } });
    expect(history().getByTestId('history-no-results')).toBeDefined();
    expect(history().getByText('No conversations found')).toBeDefined();
  });

  it('new conversation action creates without mutating the previous', async () => {
    const createConversation = vi.fn();
    const assistant = historyAssistant({ createConversation });
    render(<ConversationPanel assistant={assistant} />);
    fireEvent.click(screen.getByTestId('conversation-picker'));
    fireEvent.click(screen.getByRole('button', { name: /^new conversation$/i }));
    expect(createConversation).toHaveBeenCalledTimes(1);
    expect(assistant.selectConversation).not.toHaveBeenCalled();
    expect(screen.queryByTestId('conversation-history')).toBeNull();
  });

  it('selected-but-empty conversation shows suggestions; suggestion sends via normal path', async () => {
    const sendMessage = vi.fn();
    const assistant = stubAssistant({
      selectedId: 'conv-new',
      conversations: [summary('conv-new', 'Conversation 9', isoNow(), 0)],
      messages: [],
    });
    (assistant as any).sendMessage = sendMessage;
    render(<ConversationPanel assistant={assistant} />);
    expect(screen.getByTestId('assistant-suggestions')).toBeDefined();
    expect(screen.getByText('How can I help?')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Check project status' }));
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][0]).toBe('Check the repository status.');
  });

  it('historical rich response renders Markdown with Copy/Share', async () => {
    const content = 'The package name is **vestara-ai-core**.\n\n```bash\ngit status\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |';
    const assistant = stubAssistant({
      selectedId: 'conv-b',
      conversations: [summary('conv-b', 'Conversation 2', isoDaysAgo(1))],
      messages: [
        { id: 'm1', conversationId: 'conv-b', role: 'user', content: 'Read package.json and tell me the package name.', createdAt: isoDaysAgo(1) },
        { id: 'm2', conversationId: 'conv-b', role: 'assistant', content, createdAt: isoDaysAgo(1), model: 'muse-spark-1.3-contributor' },
      ],
    });
    render(<ConversationPanel assistant={assistant} />);
    // Same canonical renderer as new responses (GA-UI-005 constructs).
    expect(screen.getByRole('table')).toBeDefined();
    expect(screen.getByRole('button', { name: /copy code/i })).toBeDefined();
    expect(screen.getByTestId('assistant-response-actions')).toBeDefined();
    expect(screen.getByRole('button', { name: /copy response/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /share response/i })).toBeDefined();
  });

  // ── FloatingPanel header: explicit new-conversation action ──

  it('header exposes New conversation alongside preserved controls', async () => {
    const onNewConversation = vi.fn();
    const onMinimize = vi.fn();
    const onClose = vi.fn();
    render(
      <FloatingPanel
        open
        minimized={false}
        workspaceId="ws-test"
        onMinimize={onMinimize}
        onClose={onClose}
        onNewConversation={onNewConversation}
        launcherRef={{ current: null }}
      >
        <div>content</div>
      </FloatingPanel>,
    );
    expect(screen.getByText('Vestara Assistant')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'New conversation' }));
    expect(onNewConversation).toHaveBeenCalledTimes(1);
    // Existing minimize/close behavior preserved.
    fireEvent.click(screen.getByRole('button', { name: /minimize assistant/i }));
    fireEvent.click(screen.getByRole('button', { name: /close assistant/i }));
    expect(onMinimize).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ── Integration: A→B→A→B integrity + clean C + mid-turn history ──

  it('A→B→A→B: correct history, no dupes, no new turns, composer follows', async () => {
    const server = makeMultiServer();
    mockFetch.mockImplementation(server.impl as any);
    let hook: any;
    function Harness() {
      hook = useAssistantConversation();
      return <ConversationPanel assistant={hook} />;
    }
    render(<Harness />);
    await waitFor(() => expect(hook.listLoading).toBe(false));
    const streamPosts = () => server.calls.filter((c) => c.method === 'POST' && c.url.endsWith('/stream')).length;
    // Picker and message surface can legitimately show the same title —
    // scope message assertions to the scroll region, history to the dialog.
    const scroll = () => within(screen.getByTestId('conversation-scroll'));
    const history = () => within(screen.getByTestId('conversation-history'));

    await act(async () => {
      hook.selectConversation('conv-a');
    });
    await waitFor(() => expect(scroll().getByText('Explain Vestara in one sentence.')).toBeDefined());

    // A → B.
    fireEvent.click(screen.getByTestId('conversation-picker'));
    fireEvent.click(history().getByRole('button', { name: /open conversation: conversation 2/i }));
    await waitFor(() => expect(scroll().getByText('Read package.json and tell me the package name.')).toBeDefined());
    expect(scroll().queryByText('Explain Vestara in one sentence.')).toBeNull();
    expect(streamPosts()).toBe(0);

    // B → A: exact canonical history, no duplicates.
    fireEvent.click(screen.getByTestId('conversation-picker'));
    fireEvent.click(history().getByRole('button', { name: /open conversation: explain vestara/i }));
    await waitFor(() => expect(scroll().getAllByText('Explain Vestara in one sentence.')).toHaveLength(1));
    expect(scroll().getAllByText('Vestara is a workspace.')).toHaveLength(1);
    expect(streamPosts()).toBe(0);

    // A → B again, then send: composer targets B.
    // (B was visited before, so its title now resolves to the fallback.)
    fireEvent.click(screen.getByTestId('conversation-picker'));
    fireEvent.click(history().getByRole('button', { name: /open conversation: read package/i }));
    await waitFor(() => expect(scroll().getByText('Read package.json and tell me the package name.')).toBeDefined());

    const textarea = screen.getByPlaceholderText('Ask anything about this workspace…');
    fireEvent.change(textarea, { target: { value: 'And the version?' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    await waitFor(() => expect(server.streams.get('conv-b')).toBeDefined());
    expect(server.calls.filter((c) => c.method === 'POST' && c.url === '/api/conversations/conv-b/stream')).toHaveLength(1);
    // Rich formatting preserved on the historical response meanwhile.
    expect(scroll().getByText('vestara-ai-core', { selector: 'strong' })).toBeDefined();

    const stream = server.streams.get('conv-b')!;
    server.persistAssistant('conv-b', 'Version **0.3.0**.');
    await act(async () => {
      stream.push({ type: 'done' });
      stream.close();
      await flush();
    });
    await waitFor(() => expect(hook.streamState).toBe('completed'));
    // B grew by exactly one turn; A untouched.
    expect(server.messages.get('conv-b')).toHaveLength(4);
    expect(server.messages.get('conv-a')).toHaveLength(2);
    expect(scroll().getAllByText('Read package.json and tell me the package name.')).toHaveLength(1);
  });

  it('Conversation C starts clean with focused composer', async () => {
    const server = makeMultiServer();
    mockFetch.mockImplementation(server.impl as any);
    let hook: any;
    function Harness() {
      hook = useAssistantConversation();
      return <ConversationPanel assistant={hook} />;
    }
    render(<Harness />);
    await waitFor(() => expect(hook.listLoading).toBe(false));
    await act(async () => {
      hook.selectConversation('conv-a');
    });
    // Picker shows the resolved title too — scope message reads to the scroll region.
    await waitFor(() => expect(within(screen.getByTestId('conversation-scroll')).getByText('Explain Vestara in one sentence.')).toBeDefined());

    await act(async () => {
      await hook.createConversation();
    });
    await waitFor(() => expect(screen.getByTestId('assistant-suggestions')).toBeDefined());
    expect(screen.queryByText('Explain Vestara in one sentence.')).toBeNull();
    expect(screen.getByText('How can I help?')).toBeDefined();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByPlaceholderText('Ask anything about this workspace…')));
  });

  it('opening history mid-turn never aborts the active turn', async () => {
    const server = makeMultiServer();
    mockFetch.mockImplementation(server.impl as any);
    let hook: any;
    function Harness() {
      hook = useAssistantConversation();
      return <ConversationPanel assistant={hook} />;
    }
    render(<Harness />);
    await waitFor(() => expect(hook.listLoading).toBe(false));
    await act(async () => {
      hook.selectConversation('conv-a');
    });
    await waitFor(() => expect(hook.selectedId).toBe('conv-a'));

    act(() => {
      void hook.sendMessage('Follow-up in A');
    });
    expect(hook.streamState).toBe('sending');

    // Open history (and close it): the turn continues untouched.
    fireEvent.click(screen.getByTestId('conversation-picker'));
    expect(screen.getByTestId('conversation-history')).toBeDefined();
    expect(hook.streamState).toBe('sending');
    expect(screen.getByTestId('active-turn-status').textContent).toContain('Thinking…');
    // Generating indicator is honestly shown for the selected conversation.
    expect(screen.getByText('generating')).toBeDefined();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('conversation-history')).toBeNull();
    expect(hook.streamState).toBe('sending');

    const stream = server.streams.get('conv-a')!;
    server.persistAssistant('conv-a', 'Late answer in A.');
    await act(async () => {
      stream.push({ type: 'done' });
      stream.close();
      await flush();
    });
    await waitFor(() => expect(hook.streamState).toBe('completed'));
  });
});
