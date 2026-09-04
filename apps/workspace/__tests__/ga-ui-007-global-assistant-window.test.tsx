/**
 * GA-UI-007 — Global Assistant full-window surface tests.
 *
 * Covers the expanded shell: persistent sidebar rail (ConversationHistory
 * variant="rail"), the "Files modified" summary card, the "Open in editor"
 * affordance, and the FloatingPanel expanded geometry. Presentation-only —
 * no authority changes.
 */

// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeAssistantExecutionDetail } from '@vestara/shared';
import { AssistantFilesSummary } from '../src/components/assistant/AssistantFilesSummary';
import { AssistantCodeEdit } from '../src/components/assistant/AssistantCodeEdit';
import { ConversationHistory } from '../src/components/assistant/ConversationHistory';
import { FloatingPanel } from '../src/components/assistant/FloatingPanel';
import { useAssistantConversation } from '../src/hooks/useAssistantConversation';

const mockFetch = vi.fn();
global.fetch = mockFetch as any;

const EDIT = normalizeAssistantExecutionDetail({
  contract: 'assistant.execution.v1',
  version: 1,
  operationId: 'edit:ses:file',
  kind: 'edit',
  state: 'completed',
  file: 'apps/workspace/src/components/assistant/ConversationHistory.tsx',
  operation: 'modified',
  additions: 5,
  deletions: 4,
  diffProvenance: 'runtime-provided',
  patch: '@@ -1,1 +1,1 @@\n-a\n+b',
});

const RUNNING_EDIT = normalizeAssistantExecutionDetail({
  contract: 'assistant.execution.v1',
  version: 1,
  operationId: 'edit:ses:running',
  kind: 'edit',
  state: 'running',
  file: 'packages/a.ts',
  diffProvenance: 'unavailable',
});

afterEach(() => {
  cleanup();
});

describe('AssistantFilesSummary (GA-UI-007)', () => {
  it('renders completed edit files with +/- counts', () => {
    render(<AssistantFilesSummary edits={[EDIT!, RUNNING_EDIT!]} />);
    expect(screen.getByTestId('assistant-files-summary')).toBeTruthy();
    const items = screen.getAllByTestId('files-summary-item');
    // Only the completed edit appears; running edits are excluded.
    expect(items).toHaveLength(1);
    expect(items[0]!.textContent).toContain('ConversationHistory.tsx');
    expect(items[0]!.textContent).toContain('+5');
    expect(items[0]!.textContent).toContain('-4');
  });

  it('renders nothing when there are no completed edits', () => {
    const { container } = render(<AssistantFilesSummary edits={[RUNNING_EDIT!]} />);
    expect(container.querySelector('[data-testid="assistant-files-summary"]')).toBeNull();
    const { container: empty } = render(<AssistantFilesSummary edits={[]} />);
    expect(empty.querySelector('[data-testid="assistant-files-summary"]')).toBeNull();
  });

  it('omits counts when the projection has none (no fabrication)', () => {
    const noCounts = normalizeAssistantExecutionDetail({
      contract: 'assistant.execution.v1',
      version: 1,
      operationId: 'edit:x',
      kind: 'edit',
      state: 'completed',
      file: 'packages/b.ts',
      diffProvenance: 'runtime-provided',
    });
    render(<AssistantFilesSummary edits={[noCounts!]} />);
    expect(screen.getByTestId('files-summary-item').textContent).toContain('b.ts');
    expect(screen.getByTestId('files-summary-item').textContent).not.toContain('+');
  });
});

describe('AssistantCodeEdit — Open in editor (GA-UI-007)', () => {
  it('renders the affordance and calls the bounded callback', () => {
    const onOpen = vi.fn();
    render(<AssistantCodeEdit detail={EDIT!} onOpenInEditor={onOpen} />);
    const btn = screen.getByTestId('code-edit-open-in-editor');
    fireEvent.click(btn);
    expect(onOpen).toHaveBeenCalledWith('apps/workspace/src/components/assistant/ConversationHistory.tsx');
  });

  it('hides the affordance when the callback is absent', () => {
    render(<AssistantCodeEdit detail={EDIT!} />);
    expect(screen.queryByTestId('code-edit-open-in-editor')).toBeNull();
  });
});

describe('ConversationHistory — rail variant (GA-UI-007)', () => {
  it('renders a static navigation rail (no dialog overlay behavior)', () => {
    const { container } = render(
      <ConversationHistory
        variant="rail"
        items={[
          { id: 'c-1', displayTitle: 'First', updatedAt: new Date().toISOString() },
          { id: 'c-2', displayTitle: 'Second', updatedAt: new Date().toISOString() },
        ]}
        selectedId="c-1"
        activeState="idle"
        onSelect={() => {}}
        onNewConversation={() => {}}
        onClose={() => {}}
        anchorRef={{ current: null }}
      />,
    );
    const rail = screen.getByTestId('conversation-history');
    expect(rail.getAttribute('role')).toBe('navigation');
    // Not absolutely positioned (popover) — a static rail.
    expect(rail.className).not.toContain('absolute');
    expect(screen.getAllByRole('button', { name: /Open conversation/ })).toHaveLength(2);
    expect(container.querySelector('[aria-current="true"]')).toBeTruthy();
  });

  it('keeps search + new-conversation controls', () => {
    render(
      <ConversationHistory
        variant="rail"
        items={[]}
        selectedId={null}
        activeState="idle"
        onSelect={() => {}}
        onNewConversation={() => {}}
        onClose={() => {}}
        anchorRef={{ current: null }}
      />,
    );
    expect(screen.getByLabelText('Search conversations')).toBeTruthy();
    expect(screen.getByLabelText('New conversation')).toBeTruthy();
  });
});

describe('FloatingPanel expanded geometry (GA-UI-007)', () => {
  it('applies full-window geometry and a maximize toggle when expanded is supported', async () => {
    const toggle = vi.fn();
    const { container, rerender } = render(
      <FloatingPanel
        open
        minimized={false}
        workspaceId="ws-test"
        onMinimize={() => {}}
        onClose={() => {}}
        expanded={false}
        onToggleExpanded={toggle}
        launcherRef={{ current: null }}
      >
        <div>content</div>
      </FloatingPanel>,
    );
    const panel = container.querySelector('[aria-label="Global Assistant"]') as HTMLElement;
    expect(panel.className).toContain('rounded-xl');
    // Maximize button present.
    fireEvent.click(screen.getByLabelText('Expand assistant'));
    expect(toggle).toHaveBeenCalled();
    rerender(
      <FloatingPanel
        open
        minimized={false}
        workspaceId="ws-test"
        onMinimize={() => {}}
        onClose={() => {}}
        expanded
        onToggleExpanded={toggle}
        launcherRef={{ current: null }}
      >
        <div>content</div>
      </FloatingPanel>,
    );
    const expandedPanel = container.querySelector('[aria-label="Global Assistant"]') as HTMLElement;
    expect(expandedPanel.className).toContain('inset-0');
    expect(screen.getByLabelText('Restore assistant')).toBeTruthy();
  });
});

describe('useAssistantConversation — expanded surface plumbing (GA-UI-007)', () => {
  const ISO = '2026-01-01T00:00:00Z';
  const EXECUTION = { contract: 'assistant.execution.v1', version: 1, source: 'opencode', timestamp: 1_700_000_000_000 };

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

  async function startTurn() {
    const serverMessages: any[] = [];
    const state = { lastStream: null as StreamHarness | null, lastBody: undefined as string | undefined };
    const impl = async (url: string, opts?: { method?: string; body?: string }) => {
      const method = opts?.method ?? 'GET';
      if (url === '/api/conversations' && method === 'GET') {
        return { ok: true, json: async () => ({ conversations: [{ id: 'conv-1', title: 'T', messageCount: 0, status: 'active', createdAt: ISO, updatedAt: ISO }] }) };
      }
      if (url === '/api/conversations/conv-1' && method === 'GET') {
        return { ok: true, json: async () => ({ conversation: { id: 'conv-1', userId: 'local', title: 'T', messages: [...serverMessages], status: 'active', createdAt: ISO, updatedAt: ISO } }) };
      }
      if (url === '/api/conversations/conv-1/stream' && method === 'POST') {
        serverMessages.push({ id: 'msg-1', conversationId: 'conv-1', role: 'user', content: JSON.parse(opts?.body ?? '{}').message, createdAt: ISO });
        state.lastBody = opts?.body;
        const stream = new StreamHarness();
        state.lastStream = stream;
        return { ok: true, body: { getReader: () => stream.getReader() } };
      }
      throw new Error(`unexpected fetch ${method} ${url}`);
    };
    mockFetch.mockImplementation(impl as any);
    const { result } = renderHook(() => useAssistantConversation());
    await waitFor(() => expect(result.current.listLoading).toBe(false));
    await act(async () => {
      result.current.selectConversation('conv-1');
    });
    await waitFor(() => expect(result.current.selectedId).toBe('conv-1'));
    let sendPromise: Promise<void> | undefined;
    act(() => {
      sendPromise = result.current.sendMessage('edit the file');
    });
    await waitFor(() => expect(state.lastStream).toBeDefined());
    return { state, result, sendPromise: sendPromise! };
  }

  it('keeps sendMessage surfaceContext in the POST body alongside the message', async () => {
    const { state, result, sendPromise } = await startTurn();
    // Complete the first turn.
    await act(async () => {
      state.lastStream!.push({ type: 'done' });
      state.lastStream!.close();
      await sendPromise;
    });
    // Second turn WITH surface context (as ConversationPanel does per turn).
    let secondSend: Promise<void> | undefined;
    act(() => {
      secondSend = result.current.sendMessage('second turn', {
        surfaceContext: {
          workspace: { id: 'ws-x', name: 'vestara-ai-core' },
          surface: { routeId: '/agents', path: '/agents', title: 'Agent Control', section: 'Workspace' },
        },
      });
    });
    await waitFor(() => expect(state.lastStream).toBeDefined());
    const secondStream = state.lastStream;
    await act(async () => {
      secondStream!.push({ type: 'done' });
      secondStream!.close();
      await secondSend;
    });
    expect(state.lastBody).toBeDefined();
    const parsed = JSON.parse(state.lastBody!);
    expect(typeof parsed.message).toBe('string');
    expect(parsed.surfaceContext).toMatchObject({
      workspace: { id: 'ws-x', name: 'vestara-ai-core' },
      surface: { path: '/agents', title: 'Agent Control' },
    });
  });
});