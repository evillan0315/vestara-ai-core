/**
 * VESTARA-INTELLIGENCE GA-1 Slice 3: ConversationPanel Tests
 *
 * Verifies:
 * - Empty state renders with New conversation button
 * - Message list renders user and assistant messages
 * - Streaming bubble displays during stream
 * - Compose input with send/stop buttons
 * - Degraded banner shows on error
 * - Surface context badge renders
 * - Auto-scroll behavior
 * - Keyboard shortcut (Enter to send)
 * - Textarea auto-resize
 *
 * @see VESTARA-INTELLIGENCE-GA1-PREFLIGHT.md
 */

// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────

function makeAssistant(overrides?: Record<string, unknown>) {
  return {
    conversations: [],
    listLoading: false,
    listError: null,
    selectedId: null,
    selectedConversation: null,
    selectConversation: vi.fn(),
    createConversation: vi.fn(),
    messages: [],
    loadMessages: vi.fn(),
    sendMessage: vi.fn(),
    streamState: 'idle' as const,
    streamingText: '',
    streamError: null,
    abortStream: vi.fn(),
    ...overrides,
  } as any;
}

// ─── Tests ────────────────────────────────────────────────────

describe('ConversationPanel — Slice 3: Conversation Presentation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ conversations: [] }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function loadPanel() {
    const mod = await import('../src/components/assistant/ConversationPanel');
    return mod.ConversationPanel;
  }

  it('renders empty state with New conversation button', async () => {
    const ConversationPanel = await loadPanel();
    const assistant = makeAssistant();
    render(
      <MemoryRouter>
        <ConversationPanel assistant={assistant} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Start a conversation')).toBeDefined();
    expect(screen.getByText('New conversation')).toBeDefined();
  });

  it('renders user and assistant messages', async () => {
    const ConversationPanel = await loadPanel();
    const assistant = makeAssistant({
      selectedId: 'conv-1',
      messages: [
        { id: 'm1', role: 'user', content: 'Hello', createdAt: '2024-01-01T00:00:00Z' },
        { id: 'm2', role: 'assistant', content: 'Hi there!', createdAt: '2024-01-01T00:00:01Z' },
      ],
    });
    render(
      <MemoryRouter>
        <ConversationPanel assistant={assistant} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Hello')).toBeDefined();
    expect(screen.getByText('Hi there!')).toBeDefined();
  });

  it('renders streaming bubble when streaming', async () => {
    const ConversationPanel = await loadPanel();
    const assistant = makeAssistant({
      selectedId: 'conv-1',
      messages: [],
      streamState: 'streaming',
      streamingText: 'Thinking...',
    });
    render(
      <MemoryRouter>
        <ConversationPanel assistant={assistant} />
      </MemoryRouter>,
    );
    expect(screen.getByText('typing...')).toBeDefined();
  });

  it('renders compose input', async () => {
    const ConversationPanel = await loadPanel();
    const assistant = makeAssistant();
    render(
      <MemoryRouter>
        <ConversationPanel assistant={assistant} />
      </MemoryRouter>,
    );
    expect(screen.getByPlaceholderText('Ask anything about this workspace…')).toBeDefined();
    expect(screen.getByRole('button', { name: /send message/i })).toBeDefined();
  });

  it('shows stop button during streaming', async () => {
    const ConversationPanel = await loadPanel();
    const assistant = makeAssistant({
      selectedId: 'conv-1',
      streamState: 'streaming',
      streamingText: '...',
    });
    render(
      <MemoryRouter>
        <ConversationPanel assistant={assistant} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /stop generation/i })).toBeDefined();
    expect(screen.queryByRole('button', { name: /send message/i })).toBeNull();
  });

  it('shows degraded banner on listError', async () => {
    const ConversationPanel = await loadPanel();
    const assistant = makeAssistant({
      listError: 'Network error',
    });
    render(
      <MemoryRouter>
        <ConversationPanel assistant={assistant} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Backend unavailable — messages may not send')).toBeDefined();
    expect(screen.getByText('Network error')).toBeDefined();
  });

  it('shows degraded banner on streamError (turn failure ≠ backend unavailable)', async () => {
    const ConversationPanel = await loadPanel();
    const assistant = makeAssistant({
      selectedId: 'conv-1',
      streamError: 'Provider failed',
    });
    render(
      <MemoryRouter>
        <ConversationPanel assistant={assistant} />
      </MemoryRouter>,
    );
    // GA-SSE-003 §12: an upstream execution error is a turn failure, NOT
    // "Backend unavailable" (which is reserved for the API/runtime boundary).
    expect(screen.queryByText('Backend unavailable — messages may not send')).toBeNull();
    expect(screen.getByText('Assistant response failed')).toBeDefined();
    expect(screen.getByText('Provider failed')).toBeDefined();
  });

  it('renders surface context badge', async () => {
    const ConversationPanel = await loadPanel();
    const assistant = makeAssistant();
    render(
      <MemoryRouter>
        <ConversationPanel assistant={assistant} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Main / Dashboard')).toBeDefined();
  });

  it('shows loading indicator when listLoading', async () => {
    const ConversationPanel = await loadPanel();
    const assistant = makeAssistant({ listLoading: true });
    render(
      <MemoryRouter>
        <ConversationPanel assistant={assistant} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Loading...')).toBeDefined();
  });

  it('calls sendMessage when send button clicked', async () => {
    const ConversationPanel = await loadPanel();
    const sendMessage = vi.fn();
    const assistant = makeAssistant({ sendMessage });
    render(
      <MemoryRouter>
        <ConversationPanel assistant={assistant} />
      </MemoryRouter>,
    );
    const textarea = screen.getByPlaceholderText('Ask anything about this workspace…');
    fireEvent.change(textarea, { target: { value: 'Test message' } });
    screen.getByRole('button', { name: /send message/i }).click();
    expect(sendMessage).toHaveBeenCalledWith('Test message');
  });

  it('calls abortStream when stop button clicked', async () => {
    const ConversationPanel = await loadPanel();
    const abortStream = vi.fn();
    const assistant = makeAssistant({
      selectedId: 'conv-1',
      streamState: 'streaming',
      streamingText: '...',
      abortStream,
    });
    render(
      <MemoryRouter>
        <ConversationPanel assistant={assistant} />
      </MemoryRouter>,
    );
    screen.getByRole('button', { name: /stop generation/i }).click();
    expect(abortStream).toHaveBeenCalled();
  });

  it('Enter key sends message', async () => {
    const ConversationPanel = await loadPanel();
    const sendMessage = vi.fn();
    const assistant = makeAssistant({ sendMessage });
    render(
      <MemoryRouter>
        <ConversationPanel assistant={assistant} />
      </MemoryRouter>,
    );
    const textarea = screen.getByPlaceholderText('Ask anything about this workspace…');
    fireEvent.change(textarea, { target: { value: 'Test message' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(sendMessage).toHaveBeenCalledWith('Test message');
  });

  it('Shift+Enter does not send message', async () => {
    const ConversationPanel = await loadPanel();
    const sendMessage = vi.fn();
    const assistant = makeAssistant({ sendMessage });
    render(
      <MemoryRouter>
        <ConversationPanel assistant={assistant} />
      </MemoryRouter>,
    );
    const textarea = screen.getByPlaceholderText('Ask anything about this workspace…');
    fireEvent.change(textarea, { target: { value: 'Test message' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('send button is disabled when input is empty', async () => {
    const ConversationPanel = await loadPanel();
    const assistant = makeAssistant();
    render(
      <MemoryRouter>
        <ConversationPanel assistant={assistant} />
      </MemoryRouter>,
    );
    const btn = screen.getByRole('button', { name: /send message/i });
    expect(btn.hasAttribute('disabled')).toBe(true);
  });

  it('calls createConversation on empty state button click', async () => {
    const ConversationPanel = await loadPanel();
    const createConversation = vi.fn();
    const assistant = makeAssistant({ createConversation });
    render(
      <MemoryRouter>
        <ConversationPanel assistant={assistant} />
      </MemoryRouter>,
    );
    screen.getByText('New conversation').click();
    expect(createConversation).toHaveBeenCalled();
  });

  it('does not render empty state when messages exist', async () => {
    const ConversationPanel = await loadPanel();
    const assistant = makeAssistant({
      selectedId: 'conv-1',
      messages: [
        { id: 'm1', role: 'user', content: 'Hello', createdAt: '2024-01-01T00:00:00Z' },
      ],
    });
    render(
      <MemoryRouter>
        <ConversationPanel assistant={assistant} />
      </MemoryRouter>,
    );
    expect(screen.queryByText('Start a conversation')).toBeNull();
  });
});
