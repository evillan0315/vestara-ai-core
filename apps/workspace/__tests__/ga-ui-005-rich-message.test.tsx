/**
 * GA-UI-005 — Rich assistant message presentation.
 *
 * Deterministic tests (no localhost/OpenCode). Covers the shared
 * MarkdownRenderer/CodeBlock path reused by the Floating Assistant:
 *
 * - block constructs: paragraph, heading, emphasis, ordered/unordered
 *   lists, blockquote, horizontal separator
 * - inline code + fenced code blocks (label, Copy code, unknown language)
 * - zero-bundle syntax highlighting incl. tsx/jsx/sh aliases
 * - safe links (external/relative never hijack routing or execute)
 * - raw model HTML is escaped, never injected
 * - tables + wide-table internal containment
 * - long URL/path containment
 * - streaming degradation: partial fence/emphasis/table/link never crash
 * - multi-delta integration: rich response visibly grows BEFORE done
 * - GA-UI-003 Copy/Share preserved (raw text, not markup); no actions
 *   while streaming; repository paths stay presentation-only
 *
 * @see docs/blueprint/GA-UI-005-rich-message-presentation.md
 */

// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

import { MarkdownRenderer } from '../src/components/chat/MarkdownRenderer';
import { ConversationPanel } from '../src/components/assistant/ConversationPanel';
import { useAssistantConversation } from '../src/hooks/useAssistantConversation';

const ISO = '2026-01-01T00:00:00Z';
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function renderMarkdown(content: string) {
  return render(<MarkdownRenderer content={content} />);
}

// ─── Deferred SSE stream harness (mirrors GA-UI-004, self-contained) ──

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
  const serverMessages: Array<Record<string, unknown>> = [];
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
            id: 'conv-1', userId: 'local', title: 'T', messages: [...serverMessages],
            status: 'active', createdAt: ISO, updatedAt: ISO,
          },
        }),
      };
    }
    if (url === '/api/conversations/conv-1/stream' && method === 'POST') {
      const body = JSON.parse(opts?.body ?? '{}');
      msgCounter += 1;
      serverMessages.push({
        id: `msg-server-${msgCounter}`, conversationId: 'conv-1', role: 'user', content: body.message, createdAt: ISO,
      });
      const stream = new StreamHarness();
      state.lastStream = stream;
      return { ok: true, body: { getReader: () => stream.getReader() } };
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  }

  function persistAssistant(content: string) {
    msgCounter += 1;
    serverMessages.push({
      id: `msg-server-${msgCounter}`, conversationId: 'conv-1', role: 'assistant',
      content, createdAt: ISO, model: 'muse-spark-1.3-contributor',
    });
  }

  return { serverMessages, impl, persistAssistant, state };
}

// ─── Tests ──────────────────────────────────────────────────────

describe('GA-UI-005 — rich assistant message presentation', () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    Object.assign(navigator, { share: undefined });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // ── Block constructs ──

  it('paragraph renders', () => {
    const { container } = renderMarkdown('The repository contains three major layers.');
    expect(container.querySelector('.markdown p')?.textContent).toContain('three major layers');
  });

  it('heading renders', () => {
    const { container } = renderMarkdown('## Architecture\n\n### Runtime');
    expect(container.querySelector('h2')?.textContent).toBe('Architecture');
    expect(container.querySelector('h3')?.textContent).toBe('Runtime');
  });

  it('emphasis renders bold and italic', () => {
    const { container } = renderMarkdown('This is **bold** and *italic* text.');
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(container.querySelector('em')?.textContent).toBe('italic');
  });

  it('ordered list renders items in order', () => {
    const { container } = renderMarkdown('1. Conversation Runtime\n2. Agent Runtime\n3. OpenCode Runtime');
    const items = [...container.querySelectorAll('ol > li')].map((li) => li.textContent);
    expect(items).toEqual(['Conversation Runtime', 'Agent Runtime', 'OpenCode Runtime']);
  });

  it('unordered list renders items', () => {
    const { container } = renderMarkdown('- alpha\n- beta');
    const items = [...container.querySelectorAll('ul > li')].map((li) => li.textContent);
    expect(items).toEqual(['alpha', 'beta']);
  });

  it('blockquote and horizontal separator render quietly (no cards)', () => {
    const { container } = renderMarkdown('> quoted note\n\n---\n\ndone');
    expect(container.querySelector('blockquote')?.textContent).toContain('quoted note');
    expect(container.querySelector('hr')).not.toBeNull();
  });

  it('inline code renders', () => {
    const { container } = renderMarkdown('Use `package.json` for scripts.');
    const code = container.querySelector('.markdown p code');
    expect(code?.textContent).toBe('package.json');
  });

  // ── Fenced code blocks ──

  it('fenced code renders language label + scrollable block', () => {
    const { container } = renderMarkdown('```typescript\nconst x: number = 1;\n```');
    expect(container.textContent).toContain('typescript');
    // react-markdown wraps the block in an outer pre; the scrollable block
    // is CodeBlock's inner pre inside its own overflow container.
    const innerPre = container.querySelector('.overflow-x-auto pre');
    expect(innerPre?.textContent).toContain('const x: number = 1;');
    // Horizontal overflow stays inside the block.
    expect(innerPre?.closest('.overflow-x-auto')).not.toBeNull();
  });

  it('code language label preserves the original tag', () => {
    const { container } = renderMarkdown('```tsx\nconst el = <div/>;\n```');
    expect(container.textContent).toContain('tsx');
  });

  it('Copy code copies only the code block contents', async () => {
    renderMarkdown('Some prose.\n\n```typescript\nconst provider = resolveProvider();\n\nawait provider.execute();\n```\n\nMore prose.');
    fireEvent.click(screen.getByRole('button', { name: /copy code/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith('const provider = resolveProvider();\n\nawait provider.execute();');
  });

  it('Copy code is keyboard-focusable and does not bubble drag', () => {
    const onPointerDown = vi.fn();
    const onMouseDown = vi.fn();
    render(
      <div onPointerDown={onPointerDown} onMouseDown={onMouseDown}>
        <MarkdownRenderer content={'```bash\necho hi\n```'} />
      </div>,
    );
    const copyBtn = screen.getByRole('button', { name: /copy code/i });
    copyBtn.focus();
    expect(document.activeElement).toBe(copyBtn);
    fireEvent.pointerDown(copyBtn);
    fireEvent.mouseDown(copyBtn);
    expect(onPointerDown).not.toHaveBeenCalled();
    expect(onMouseDown).not.toHaveBeenCalled();
  });

  it('unknown code language renders correctly as plain code', () => {
    const { container } = renderMarkdown('```foobar\nsome unknown syntax here\n```');
    expect(container.textContent).toContain('foobar');
    expect(container.querySelector('pre')?.textContent).toContain('some unknown syntax here');
    // No highlighter spans — plain, not broken.
    expect(container.querySelector('pre span[class*="hljs-"]')).toBeNull();
    expect(screen.getByRole('button', { name: /copy code/i })).toBeDefined();
  });

  it('syntax highlighting reuses the existing highlighter (ts + tsx/sh aliases)', () => {
    const ts = renderMarkdown('```typescript\nconst x: number = 1;\n```');
    expect(ts.container.querySelector('pre span[class*="hljs-"]')).not.toBeNull();
    ts.unmount();
    // tsx is not a lowlight grammar — the zero-bundle alias maps it to typescript.
    const tsx = renderMarkdown('```tsx\nconst el: string = "hi";\n```');
    expect(tsx.container.querySelector('pre span[class*="hljs-"]')).not.toBeNull();
    tsx.unmount();
    // sh is not a lowlight grammar — aliased to bash.
    const sh = renderMarkdown('```sh\necho hello\n```');
    expect(sh.container.querySelector('pre span[class*="hljs-"]')).not.toBeNull();
    sh.unmount();
  });

  // ── Links ──

  it('external links open out-of-band with safe rel', () => {
    const { container } = renderMarkdown('[docs](https://example.com/guide)');
    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://example.com/guide');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toContain('noopener');
    expect(link?.getAttribute('rel')).toContain('noreferrer');
    expect(link?.textContent).toBe('docs');
  });

  it('relative links never hijack Workspace routing', () => {
    const { container } = renderMarkdown('[local setup](./docs/setup.md)');
    const link = container.querySelector('a');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toContain('noopener');
  });

  it('raw model HTML is escaped, never injected', () => {
    const { container } = renderMarkdown('<script>alert("xss")</script>\n\n<img src=x onerror=alert(1)>');
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<script>');
  });

  // ── Tables ──

  it('table renders rows and cells', () => {
    const { container } = renderMarkdown(
      '| Provider | Model | Status |\n|----------|-------|--------|\n| OpenCode | Muse  | Active |',
    );
    expect(container.querySelector('table')).not.toBeNull();
    expect(container.querySelector('th')?.textContent).toBe('Provider');
    const cells = [...container.querySelectorAll('td')].map((td) => td.textContent);
    expect(cells).toEqual(['OpenCode', 'Muse', 'Active']);
  });

  it('wide table is contained by internal horizontal overflow', () => {
    const { container } = renderMarkdown(
      '| A | B | C | D | E | F | G | H |\n|---|---|---|---|---|---|---|---|\n| a very wide cell value 01 | a very wide cell value 02 | a very wide cell value 03 | a very wide cell value 04 | a very wide cell value 05 | a very wide cell value 06 | a very wide cell value 07 | a very wide cell value 08 |',
    );
    const table = container.querySelector('table');
    expect(table).not.toBeNull();
    // The table scrolls inside its own container — the panel never widens.
    const scroller = table!.closest('div');
    expect(scroller?.className).toContain('overflow-x-auto');
  });

  // ── Long content containment ──

  it('long URLs and repo paths do not destroy layout', () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(160) + '?q=' + 'b'.repeat(80);
    const longPath = 'packages/' + 'deeply-nested-directory/'.repeat(12) + 'index.ts';
    const { container } = renderMarkdown(`See ${longUrl} and \`${longPath}\` for details.`);
    const link = container.querySelector('a');
    expect(link?.className).toContain('[overflow-wrap:anywhere]');
    const inline = container.querySelector('.markdown p code');
    expect(inline?.textContent).toContain('index.ts');
    // Repository paths stay presentation-only: no navigation affordance built.
    expect(container.querySelector('a[href*="deeply-nested"]')).toBeNull();
    expect(container.querySelector('button')).toBeNull();
  });

  // ── Streaming degradation (partial syntax never crashes) ──

  it('incomplete code fence during streaming renders without crashing', () => {
    const { container } = renderMarkdown('```typescript\nconst provider = resolveProvider();');
    expect(container.textContent).toContain('const provider = resolveProvider();');
  });

  it('partial emphasis, table, and link degrade gracefully', () => {
    const emphasis = renderMarkdown('This is **bold never closed');
    expect(emphasis.container.textContent).toContain('bold never closed');
    emphasis.unmount();

    const table = renderMarkdown('| Provider | Model |\n|----------|-------|');
    expect(table.container.textContent).toContain('Provider');
    table.unmount();

    const list = renderMarkdown('- first\n- seco');
    expect(list.container.querySelectorAll('li')).toHaveLength(2);
    list.unmount();

    const link = renderMarkdown('[docs](https://example.com/gui');
    expect(link.container.textContent).toContain('docs');
    link.unmount();
  });

  // ── Panel integration: markdown grows over deltas, pre-done ──

  it('rich response grows over multiple deltas before done; Copy shares raw text', async () => {
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

    const textarea = screen.getByPlaceholderText('Ask anything about this workspace…');
    fireEvent.change(textarea, { target: { value: 'Explain the architecture' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    const stream = server.state.lastStream;
    expect(stream).toBeDefined();

    // Delta 1: heading visible while streaming — no buffering until done.
    await act(async () => {
      stream!.push({ type: 'delta', content: '# Vestara\n\nThree layers.\n' });
      await flush();
    });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Vestara');
    expect(screen.queryByTestId('assistant-response-actions')).toBeNull();

    // Delta 2: the SAME active turn grows a list.
    await act(async () => {
      stream!.push({ type: 'delta', content: '\n1. Conversation Runtime\n2. Agent Runtime\n' });
      await flush();
    });
    expect(screen.getAllByTestId('assistant-active-turn')).toHaveLength(1);
    expect(screen.getByText('Conversation Runtime')).toBeDefined();

    // Delta 3: an unclosed fence degrades gracefully mid-stream…
    // (highlighted spans split text nodes — assert on textContent).
    await act(async () => {
      stream!.push({ type: 'delta', content: '\n```typescript\nconst session = create();\n' });
      await flush();
    });
    expect(screen.getByTestId('active-turn-text').textContent).toContain('const session = create');

    // …then the fence closes and the block completes in the same turn.
    await act(async () => {
      stream!.push({ type: 'delta', content: '```\n\n| A | B |\n|---|---|\n| 1 | 2 |\n' });
      await flush();
    });
    expect(screen.getAllByTestId('assistant-active-turn')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /copy code/i })).toBeDefined();
    expect(screen.getByRole('table')).toBeDefined();

    // Done: completed rich message + GA-UI-003 actions on raw content.
    const full =
      '# Vestara\n\nThree layers.\n\n1. Conversation Runtime\n2. Agent Runtime\n\n```typescript\nconst session = create();\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |\n';
    server.persistAssistant(full);
    await act(async () => {
      stream!.push({ type: 'done' });
      stream!.close();
      await flush();
    });
    await waitFor(() => expect(hook.streamState).toBe('completed'));
    await waitFor(() => expect(screen.getByTestId('assistant-response-actions')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /copy response/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    // Copy response copies the underlying textual message, not markup.
    expect(writeText).toHaveBeenLastCalledWith(full);
    expect(screen.getByRole('button', { name: /share response/i })).toBeDefined();
  });

  it('repository references stay text/inline-code with no file-open authority', () => {
    const assistant = {
      conversations: [], listLoading: false, listError: null, selectedId: 'conv-1',
      selectedConversation: null, selectConversation: vi.fn(), createConversation: vi.fn(),
      messages: [
        { id: 'm1', conversationId: 'conv-1', role: 'user', content: 'where?', createdAt: ISO },
        {
          id: 'm2', conversationId: 'conv-1', role: 'assistant',
          content: 'See `apps/api/src/workspace-context.ts` and `package.json`.',
          createdAt: ISO, model: 'muse-spark-1.3-contributor',
        },
      ],
      loadMessages: vi.fn(), optimisticTurns: [], retryTurn: vi.fn(), sendMessage: vi.fn(),
      streamState: 'completed' as const, streamingText: '', streamStatus: null,
      streamError: null, abortStream: vi.fn(),
    } as any;
    const { container } = render(<ConversationPanel assistant={assistant} />);
    const codes = [...container.querySelectorAll('.markdown code')].map((c) => c.textContent);
    expect(codes).toContain('apps/api/src/workspace-context.ts');
    expect(codes).toContain('package.json');
    // No second file-opening/navigation system built in this milestone.
    const region = within(screen.getByTestId('assistant-message'));
    expect(region.queryByRole('link')).toBeNull();
  });
});
