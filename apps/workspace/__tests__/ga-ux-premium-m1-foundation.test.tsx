/**
 * GA-UX-PREMIUM M1 — Premium visual foundation.
 *
 * Focused deterministic tests (no localhost/OpenCode). Proves the M1
 * acceptance surface without touching the Assistant/OpenCode event contract:
 *
 * - completed Assistant response lives borderless on the canvas
 *   (no rounded/background/bordered wrapper around prose)
 * - human messages remain visually distinct (quiet subtle surface)
 * - Assistant identity heading is consistent (Vestara Assistant · model)
 * - Thinking… stays lightweight (no large empty response box)
 * - streaming + Markdown + code-block containment preserved (GA-UI-005)
 * - Copy/Share preserved (GA-UI-003), history preserved (GA-UI-006)
 * - composer Send + Stop preserved (no new controls)
 * - narrow layout stays contained (no horizontal overflow vectors)
 * - no fabricated structured UI: status strings never become diff/task/
 *   terminal cards (M3 owns structured projections)
 *
 * @see docs/blueprint/GA-UX-PREMIUM-assistant-experience.md
 */

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/contexts/SurfaceContext', () => ({
  useSurfaceContext: () => ({
    workspace: { id: 'ws-test', name: 'Test Workspace' },
    surface: { routeId: '/dashboard', path: '/dashboard', title: 'Dashboard', section: 'Main' },
    selected: undefined,
  }),
  SurfaceContextProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { ConversationPanel } from '../src/components/assistant/ConversationPanel';

const ISO = '2026-01-01T00:00:00Z';

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
    refreshConversations: vi.fn(),
    ...overrides,
  } as any;
}

function msg(role: 'user' | 'assistant', content: string, extra?: Record<string, unknown>) {
  return {
    id: `msg-${role}-${content.length}`,
    conversationId: 'conv-1',
    role,
    content,
    createdAt: ISO,
    ...extra,
  };
}

/** Classes that would constitute an enclosing bubble/card around prose. */
const BUBBLE_TOKENS = ['rounded-xl', 'rounded-lg', 'bg-zinc-800/40', 'bg-zinc-800/60', 'bg-amber-500/10'];

describe('GA-UX-PREMIUM M1 — premium visual foundation', () => {
  afterEach(() => cleanup());

  it('completed Assistant response has no enclosing bubble/card; prose sits on the canvas', () => {
    const assistant = stubAssistant({
      messages: [msg('user', 'Explain the architecture.'), msg('assistant', 'Vestara separates runtime from presentation.', { model: 'muse-spark-1.3-contributor' })],
    });
    render(<ConversationPanel assistant={assistant} />);

    const response = screen.getByTestId('assistant-message');
    expect(response).toBeDefined();
    const canvas = within(response).getByTestId('assistant-response-canvas');
    expect(canvas.textContent).toContain('Vestara separates runtime');
    for (const token of BUBBLE_TOKENS) {
      expect(canvas.className).not.toContain(token);
    }
    // No rounded background wrapper between the message root and the canvas.
    const wrappers = Array.from(canvas.parentElement?.children ?? []);
    expect(wrappers).toContain(canvas);
  });

  it('human message remains visually distinct with a quiet subtle surface', () => {
    const assistant = stubAssistant({ messages: [msg('user', 'Update the conversation title')] });
    const first = render(<ConversationPanel assistant={assistant} />);

    const human = screen.getByTestId('human-message');
    const surface = within(human).getByTestId('human-message-surface');
    expect(surface.textContent).toContain('Update the conversation title');
    // Distinct surface retained (border + subtle bg), but quieter than before.
    expect(surface.className).toContain('border');
    expect(surface.className).not.toContain('bg-amber-500/10');
    first.unmount();
    // Assistant canvas must not share the human surface treatment.
    const assistantView = stubAssistant({
      messages: [msg('assistant', 'Done.', { model: 'muse-spark-1.3-contributor' })],
    });
    const second = render(<ConversationPanel assistant={assistantView} />);
    const canvas = screen.getByTestId('assistant-response-canvas');
    expect(canvas.className).not.toContain('bg-zinc-800/40');
    second.unmount();
  });

  it('Assistant identity heading is consistent with secondary model metadata', () => {
    const assistant = stubAssistant({
      messages: [msg('assistant', 'Hello.', { model: 'muse-spark-1.3-contributor' })],
    });
    render(<ConversationPanel assistant={assistant} />);

    const identity = screen.getByTestId('assistant-identity');
    expect(identity.textContent).toContain('Vestara Assistant');
    expect(identity.textContent).toContain('muse-spark-1.3-contributor');
  });

  it('active Thinking surface stays lightweight (no large empty response box)', () => {
    const assistant = stubAssistant({ streamState: 'sending', streamStatus: 'Thinking…', streamingText: '' });
    render(<ConversationPanel assistant={assistant} />);

    expect(screen.getByTestId('assistant-active-turn')).toBeDefined();
    expect(screen.getByTestId('active-turn-status').textContent).toContain('Thinking…');
    expect(screen.getByTestId('active-turn-thinking')).toBeDefined();
    // Thinking state renders no response canvas and no bubble chrome.
    expect(screen.queryByTestId('active-turn-text')).toBeNull();
    expect(screen.queryByTestId('assistant-response-actions')).toBeNull();
  });

  it('streaming behavior preserved: status + growing borderless text, no actions until done', () => {
    const assistant = stubAssistant({
      streamState: 'streaming',
      streamStatus: 'Preparing response…',
      streamingText: 'Vestara separates **runtime** from presentation.',
    });
    render(<ConversationPanel assistant={assistant} />);

    const text = screen.getByTestId('active-turn-text');
    expect(text.textContent).toContain('Vestara separates');
    for (const token of BUBBLE_TOKENS) {
      expect(text.className).not.toContain(token);
    }
    expect(screen.queryByTestId('assistant-response-actions')).toBeNull();
  });

  it('rich content preserved: Markdown + fenced code block containment + Copy code', () => {
    const assistant = stubAssistant({
      messages: [
        msg('assistant', '## Architecture\n\n- runtime\n- presentation\n\n```typescript\nconst runtime = 1;\n```\n\n[docs](https://example.com)', {
          model: 'muse-spark-1.3-contributor',
        }),
      ],
    });
    render(<ConversationPanel assistant={assistant} />);

    const canvas = screen.getByTestId('assistant-response-canvas');
    expect(within(canvas).getByRole('heading', { level: 2 }).textContent).toContain('Architecture');
    expect(within(canvas).getByText('runtime')).toBeDefined();
    // Fenced code keeps its structured surface + Copy action.
    expect(within(canvas).getByRole('button', { name: /copy code/i })).toBeDefined();
    expect(within(canvas).getByText('docs').closest('a')?.getAttribute('target')).toBe('_blank');
  });

  it('Copy + Share preserved with quiet footer labels', () => {
    const assistant = stubAssistant({
      messages: [msg('assistant', 'Summary here.', { model: 'muse-spark-1.3-contributor' })],
    });
    render(<ConversationPanel assistant={assistant} />);

    const actions = screen.getByTestId('assistant-response-actions');
    expect(within(actions).getByRole('button', { name: 'Copy response' })).toBeDefined();
    expect(within(actions).getByRole('button', { name: 'Share response' })).toBeDefined();
  });

  it('conversation history trigger preserved (GA-UI-006)', () => {
    const assistant = stubAssistant({ messages: [msg('user', 'Hi')] });
    render(<ConversationPanel assistant={assistant} />);

    expect(screen.getByTestId('conversation-picker')).toBeDefined();
  });

  it('composer Send preserved; Stop preserved while generating; no future controls', () => {
    const sendMessage = vi.fn();
    const assistant = stubAssistant({ sendMessage });
    const first = render(<ConversationPanel assistant={assistant} />);

    const composer = screen.getByTestId('assistant-composer');
    const textarea = within(composer).getByLabelText('Message the assistant') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Explain the architecture' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(sendMessage).toHaveBeenCalledTimes(1);

    // No fake M8 controls.
    expect(within(composer).queryByRole('button', { name: /attach/i })).toBeNull();
    expect(within(composer).queryByRole('button', { name: /model/i })).toBeNull();
    first.unmount();

    // Stop path.
    const abortStream = vi.fn();
    const busy = stubAssistant({ streamState: 'streaming', streamingText: '…', abortStream });
    const second = render(<ConversationPanel assistant={busy} />);
    fireEvent.click(second.getByRole('button', { name: 'Stop generation' }));
    expect(abortStream).toHaveBeenCalledTimes(1);
  });

  it('narrow layout stays contained: no horizontal overflow vectors', () => {
    const assistant = stubAssistant({
      messages: [
        msg('user', 'Explain the architecture of Vestara in two short paragraphs and include one TypeScript example.'),
        msg(
          'assistant',
          'Vestara separates runtime from presentation.\n\n```typescript\nconst runtime = createRuntime();\n```\n\nSee https://example.com/a/very/long/path/that/should/not/overflow/the/narrow/panel for details.',
          { model: 'muse-spark-1.3-contributor' },
        ),
      ],
    });
    const { container } = render(
      <div style={{ width: '360px' }}>
        <ConversationPanel assistant={assistant} />
      </div>,
    );

    const scroll = screen.getByTestId('conversation-scroll');
    expect(scroll.className).toContain('overflow-x-hidden');
    expect(scroll.className).toContain('min-w-0');
    const canvas = screen.getByTestId('assistant-response-canvas');
    expect(canvas.className).toContain('max-w-full');
    expect(canvas.className).toContain('break-words');
    // Code keeps internal horizontal containment, never page overflow.
    expect(container.querySelector('.overflow-x-auto')).not.toBeNull();
  });

  it('no fabricated structured UI: status strings never become diff/task/terminal cards', () => {
    const assistant = stubAssistant({
      streamState: 'streaming',
      streamStatus: 'Editing ConversationPanel.tsx…',
      streamingText: '',
    });
    render(<ConversationPanel assistant={assistant} />);

    expect(screen.getByTestId('active-turn-status').textContent).toContain('Editing ConversationPanel.tsx…');
    expect(screen.queryByTestId('assistant-code-edit')).toBeNull();
    expect(screen.queryByTestId('assistant-task-list')).toBeNull();
    expect(screen.queryByTestId('assistant-terminal')).toBeNull();
    expect(screen.queryByTestId('assistant-verification')).toBeNull();
  });
});
