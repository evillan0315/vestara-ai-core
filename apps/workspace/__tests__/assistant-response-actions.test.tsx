/**
 * GA-UI-003: Completed Response Actions — Copy + Share
 *
 * Proves:
 * - streaming response → actions absent
 * - completed response → Copy + Share visible
 * - historical completed response → actions visible
 * - Copy → exact visible response copied + feedback
 * - Share supported → navigator.share called once
 * - Share unsupported → clipboard fallback
 * - failed response → Share absent
 * - icon click → does not initiate FloatingPanel drag
 *
 * Browser clipboard/share APIs are mocked. No native dialogs invoked.
 */

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/contexts/SurfaceContext', () => ({
  useSurfaceContext: () => ({
    workspace: { id: 'ws-test', name: 'Test Workspace' },
    surface: { routeId: '/dashboard', path: '/dashboard', title: 'Dashboard', section: 'Main' },
    selected: undefined,
  }),
  SurfaceContextProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function makeAssistant(overrides?: Record<string, unknown>) {
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
    sendMessage: vi.fn(),
    streamState: 'idle' as const,
    streamingText: '',
    streamStatus: null,
    streamError: null,
    abortStream: vi.fn(),
    ...overrides,
  } as any;
}

async function loadPanel() {
  const mod = await import('../src/components/assistant/ConversationPanel');
  return mod.ConversationPanel;
}

async function loadActions() {
  const mod = await import('../src/components/assistant/AssistantResponseActions');
  return mod.AssistantResponseActions;
}

describe('GA-UI-003 — completed response actions', () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    // Default: native share unavailable unless a test opts in.
    Object.assign(navigator, { share: undefined });
  });

  afterEach(() => {
    // GA-UI-005 hygiene: unmount between tests. Without cleanup, rendered
    // panels accumulate in document.body and role/text queries match across
    // tests ("Found multiple elements") — the file has no global afterEach
    // (vitest globals are off), so cleanup must be explicit.
    cleanup();
    vi.restoreAllMocks();
  });

  it('streaming response → actions absent', async () => {
    const ConversationPanel = await loadPanel();
    const assistant = makeAssistant({
      messages: [],
      streamState: 'streaming',
      streamingText: 'partial streamed text…',
      streamStatus: 'Thinking…',
    });
    render(
      <MemoryRouter>
        <ConversationPanel assistant={assistant} />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('assistant-response-actions')).toBeNull();
    expect(screen.queryByRole('button', { name: /copy response/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /share response/i })).toBeNull();
  });

  it('completed response → Copy visible', async () => {
    const ConversationPanel = await loadPanel();
    const assistant = makeAssistant({
      messages: [
        { id: 'm1', role: 'user', content: 'Explain Vestara', createdAt: '2024-01-01T00:00:00Z' },
        { id: 'm2', role: 'assistant', content: 'Vestara is a workspace.', createdAt: '2024-01-01T00:00:01Z' },
      ],
    });
    render(
      <MemoryRouter>
        <ConversationPanel assistant={assistant} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /copy response/i })).toBeDefined();
  });

  it('completed response → Share visible', async () => {
    const ConversationPanel = await loadPanel();
    const assistant = makeAssistant({
      messages: [
        { id: 'm1', role: 'user', content: 'Explain Vestara', createdAt: '2024-01-01T00:00:00Z' },
        { id: 'm2', role: 'assistant', content: 'Vestara is a workspace.', createdAt: '2024-01-01T00:00:01Z' },
      ],
    });
    render(
      <MemoryRouter>
        <ConversationPanel assistant={assistant} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /share response/i })).toBeDefined();
  });

  it('historical completed response → actions visible', async () => {
    const ConversationPanel = await loadPanel();
    // Persisted history rendered from Conversation Runtime (idle, no live stream).
    const assistant = makeAssistant({
      streamState: 'idle',
      streamingText: '',
      streamStatus: null,
      messages: [
        { id: 'h1', role: 'user', content: 'What is the package name?', createdAt: '2024-01-01T00:00:00Z' },
        {
          id: 'h2',
          role: 'assistant',
          content: 'The package name is vestara-ai-core.',
          createdAt: '2024-01-01T00:00:01Z',
        },
      ],
    });
    render(
      <MemoryRouter>
        <ConversationPanel assistant={assistant} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('assistant-response-actions')).toBeDefined();
    expect(screen.getByRole('button', { name: /copy response/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /share response/i })).toBeDefined();
  });

  it('Copy → exact visible response copied', async () => {
    const Actions = await loadActions();
    const content = 'The package name is vestara-ai-core.';
    render(<Actions content={content} />);
    fireEvent.click(screen.getByRole('button', { name: /copy response/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith(content);
  });

  it('Copy → status feedback appears', async () => {
    const Actions = await loadActions();
    render(<Actions content="Hello" />);
    fireEvent.click(screen.getByRole('button', { name: /copy response/i }));
    expect(await screen.findByText('Copied')).toBeDefined();
  });

  it('Share supported → navigator.share called once', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { share });
    const Actions = await loadActions();
    const content = 'Two-sentence Vestara summary.';
    render(<Actions content={content} />);
    fireEvent.click(screen.getByRole('button', { name: /share response/i }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(share).toHaveBeenCalledWith({ title: 'Vestara Assistant', text: content });
  });

  it('Share unsupported → clipboard fallback', async () => {
    Object.assign(navigator, { share: undefined });
    const Actions = await loadActions();
    const content = 'Fallback share text.';
    render(<Actions content={content} />);
    fireEvent.click(screen.getByRole('button', { name: /share response/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(content));
    expect(await screen.findByText('Copied for sharing')).toBeDefined();
  });

  it('failed response → Share absent', async () => {
    const ConversationPanel = await loadPanel();
    const assistant = makeAssistant({
      messages: [
        { id: 'm1', role: 'user', content: 'Do a thing', createdAt: '2024-01-01T00:00:00Z' },
        { id: 'm2', role: 'assistant', content: 'Error: Stream failed', createdAt: '2024-01-01T00:00:01Z' },
      ],
    });
    render(
      <MemoryRouter>
        <ConversationPanel assistant={assistant} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button', { name: /share response/i })).toBeNull();
    // Copy remains available for the failed text.
    expect(screen.getByRole('button', { name: /copy response/i })).toBeDefined();
  });

  it('icon click → does not initiate FloatingPanel drag', async () => {
    const Actions = await loadActions();
    const onPointerDown = vi.fn();
    render(
      <div onPointerDown={onPointerDown}>
        <Actions content="Drag-safety check" />
      </div>,
    );
    const copyBtn = screen.getByRole('button', { name: /copy response/i });
    fireEvent.pointerDown(copyBtn);
    expect(onPointerDown).not.toHaveBeenCalled();
  });
});
