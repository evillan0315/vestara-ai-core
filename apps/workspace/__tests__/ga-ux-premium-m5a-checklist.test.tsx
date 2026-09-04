/**
 * GA-UX-PREMIUM M5A — AssistantTodoChecklist deterministic tests.
 *
 * Truthful to the audited OpenCode 1.18.27 contract: todo.updated events are
 * complete replacement snapshots; status is an arbitrary string (known values
 * get visuals, unknown stay neutral); the summary count is presentation-
 * derived; nothing fabricated (no %, ETA, duration, owner, IDs).
 */

// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeAssistantExecutionDetail } from '@vestara/shared';
import {
  AssistantTodoChecklist,
  todoStateLabel,
  todoVisualState,
} from '../src/components/assistant/AssistantTodoChecklist';
import { AssistantExecutionTimeline } from '../src/components/assistant/AssistantToolCard';
import { useAssistantConversation } from '../src/hooks/useAssistantConversation';

const mockFetch = vi.fn();
global.fetch = mockFetch as any;

const BASE = {
  contract: 'assistant.execution.v1',
  version: 1,
  operationId: 'todo:snapshot-1',
  kind: 'task-snapshot',
  state: 'completed',
  source: 'opencode',
  timestamp: 1_700_000_000_000,
} as const;

function snapshot(todos: Array<{ title: string; status: string }>) {
  const detail = normalizeAssistantExecutionDetail({ ...BASE, todos });
  if (!detail || detail.kind !== 'task-snapshot') throw new Error('invalid task-snapshot fixture');
  return detail;
}

afterEach(() => {
  cleanup();
});

describe('todoVisualState / todoStateLabel', () => {
  it('recognizes known OpenCode status values', () => {
    expect(todoVisualState('completed')).toBe('completed');
    expect(todoVisualState('in_progress')).toBe('in_progress');
    expect(todoVisualState('pending')).toBe('pending');
  });

  it('treats unknown status values as neutral (never completed)', () => {
    expect(todoVisualState('')).toBe('unknown');
    expect(todoVisualState('blocked')).toBe('unknown');
    expect(todoVisualState('done')).toBe('unknown');
    expect(todoVisualState(undefined as unknown as string)).toBe('unknown');
  });

  it('provides accessible textual labels for every state', () => {
    expect(todoStateLabel('completed')).toBe('Completed');
    expect(todoStateLabel('in_progress')).toBe('In progress');
    expect(todoStateLabel('pending')).toBe('Pending');
    expect(todoStateLabel('unknown')).toBe('Unknown status');
  });
});

describe('AssistantTodoChecklist', () => {
  it('renders a compact checklist with a deterministic summary count', () => {
    render(
      <AssistantTodoChecklist
        detail={snapshot([
          { title: 'Inspect conversation runtime', status: 'completed' },
          { title: 'Trace SSE projection', status: 'in_progress' },
          { title: 'Verify browser rendering', status: 'pending' },
        ])}
      />,
    );
    expect(screen.getByTestId('assistant-todo-checklist')).toBeTruthy();
    expect(screen.getAllByTestId('todo-item')).toHaveLength(3);
    expect(screen.getByText('1 of 3 completed')).toBeTruthy();
    expect(screen.getByText('Inspect conversation runtime')).toBeTruthy();
  });

  it('assigns known-status visuals and preserves the original status', () => {
    render(
      <AssistantTodoChecklist
        detail={snapshot([
          { title: 'A', status: 'completed' },
          { title: 'B', status: 'in_progress' },
          { title: 'C', status: 'pending' },
        ])}
      />,
    );
    const items = screen.getAllByTestId('todo-item');
    expect(items[0]!.dataset.visualState).toBe('completed');
    expect(items[0]!.dataset.status).toBe('completed');
    expect(items[1]!.dataset.visualState).toBe('in_progress');
    expect(items[2]!.dataset.visualState).toBe('pending');
  });

  it('renders unknown status neutrally without dropping the item or reinterpreting it', () => {
    render(
      <AssistantTodoChecklist
        detail={snapshot([
          { title: 'Odd task', status: 'blocked-in-weird-way' },
          { title: 'Normal', status: 'completed' },
        ])}
      />,
    );
    const items = screen.getAllByTestId('todo-item');
    expect(items).toHaveLength(2);
    expect(items[0]!.dataset.visualState).toBe('unknown');
    expect(items[0]!.dataset.status).toBe('blocked-in-weird-way');
    expect(screen.getByText('Odd task')).toBeTruthy();
    // Unknown status is NOT counted as completed.
    expect(screen.getByText('1 of 2 completed')).toBeTruthy();
  });

  it('renders nothing for an empty authoritative snapshot (no stale todos)', () => {
    const { container, rerender } = render(
      <AssistantTodoChecklist detail={snapshot([{ title: 'A', status: 'pending' }])} />,
    );
    expect(screen.getByTestId('assistant-todo-checklist')).toBeTruthy();
    rerender(<AssistantTodoChecklist detail={snapshot([])} />);
    expect(container.querySelector('[data-testid="assistant-todo-checklist"]')).toBeNull();
  });

  it('bounds large content via the normalizer (title ≤ 200, count ≤ 20)', () => {
    const huge = snapshot(Array.from({ length: 30 }, (_, i) => ({ title: `t${i}${'x'.repeat(400)}`, status: 'pending' })));
    expect(huge.todos.length).toBeLessThanOrEqual(20);
    for (const todo of huge.todos) expect(todo.title.length).toBeLessThanOrEqual(200);
    render(<AssistantTodoChecklist detail={huge} />);
    expect(screen.getAllByTestId('todo-item').length).toBeLessThanOrEqual(20);
  });

  it('exposes accessible textual state semantics (not icon-only)', () => {
    render(
      <AssistantTodoChecklist
        detail={snapshot([
          { title: 'Trace it', status: 'in_progress' },
          { title: 'Done it', status: 'completed' },
        ])}
      />,
    );
    const group = screen.getByTestId('assistant-todo-checklist');
    expect(group.getAttribute('aria-label')).toContain('1 of 2 completed');
    const items = screen.getAllByTestId('todo-item');
    expect(items[0]!.querySelector('[aria-label]')?.getAttribute('aria-label')).toContain('In progress');
    expect(items[1]!.querySelector('[aria-label]')?.getAttribute('aria-label')).toContain('Completed');
  });

  it('non-task-snapshot detail renders nothing', () => {
    const { container } = render(
      <AssistantTodoChecklist
        detail={
          normalizeAssistantExecutionDetail({
            contract: 'assistant.execution.v1',
            version: 1,
            operationId: 'x',
            kind: 'tool',
            state: 'completed',
            tool: 'read',
            timestamp: 1,
          })!
        }
      />,
    );
    expect(container.innerHTML).toBe('');
  });
});

describe('AssistantExecutionTimeline — M5A checklist', () => {
  it('renders the single evolving checklist alongside generic operations', () => {
    const generic = { id: 'op-todowrite-1', name: 'todowrite', state: 'completed' as const, preview: undefined };
    const { container } = render(
      <AssistantExecutionTimeline
        operations={[generic]}
        taskSnapshot={snapshot([
          { title: 'A', status: 'in_progress' },
          { title: 'B', status: 'pending' },
        ])}
        expanded
        onToggle={() => {}}
      />,
    );
    expect(within(container).getByTestId('assistant-todo-checklist')).toBeTruthy();
    // Conservative M5A: no inferred correlation → the generic M2 todowrite
    // card stays visible (no false suppression with invented authority).
    expect(within(container).getByTestId('assistant-tool-card')).toBeTruthy();
  });

  it('replaces the checklist when a new snapshot arrives (one evolving plan)', () => {
    const first = snapshot([{ title: 'A', status: 'pending' }, { title: 'B', status: 'pending' }]);
    const second = snapshot([{ title: 'A', status: 'completed' }, { title: 'B', status: 'in_progress' }]);
    const { container, rerender } = render(
      <AssistantExecutionTimeline operations={[]} taskSnapshot={first} expanded onToggle={() => {}} />,
    );
    expect(within(container).getAllByTestId('todo-item')).toHaveLength(2);
    rerender(<AssistantExecutionTimeline operations={[]} taskSnapshot={second} expanded onToggle={() => {}} />);
    // Still exactly ONE checklist, showing the latest snapshot.
    expect(within(container).getAllByTestId('assistant-todo-checklist')).toHaveLength(1);
    expect(within(container).getByText('1 of 2 completed')).toBeTruthy();
  });
});

describe('useAssistantConversation — taskSnapshot collection (M5A)', () => {
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
    const state = { lastStream: null as StreamHarness | null };
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
      sendPromise = result.current.sendMessage('plan the work');
    });
    await waitFor(() => expect(state.lastStream).toBeDefined());
    return { state, result, sendPromise: sendPromise! };
  }

  it('collects task-snapshot and replaces on each snapshot event', async () => {
    const { state, result, sendPromise } = await startTurn();
    expect(result.current.taskSnapshot).toBeNull();
    await act(async () => {
      state.lastStream!.push({
        type: 'status',
        content: '3 todo(s)',
        execution: {
          ...EXECUTION,
          operationId: 'todo:snapshot-A',
          kind: 'task-snapshot',
          state: 'completed',
          todos: [
            { title: 'A', status: 'pending' },
            { title: 'B', status: 'pending' },
            { title: 'C', status: 'pending' },
          ],
        },
      });
    });
    await waitFor(() => expect(result.current.taskSnapshot).not.toBeNull());
    expect(result.current.taskSnapshot!.kind).toBe('task-snapshot');
    if (result.current.taskSnapshot!.kind === 'task-snapshot') {
      expect(result.current.taskSnapshot!.todos).toHaveLength(3);
    }
    // Snapshot B replaces snapshot A (single evolving checklist).
    await act(async () => {
      state.lastStream!.push({
        type: 'status',
        content: '3 todo(s)',
        execution: {
          ...EXECUTION,
          operationId: 'todo:snapshot-B',
          kind: 'task-snapshot',
          state: 'completed',
          todos: [
            { title: 'A', status: 'completed' },
            { title: 'B', status: 'in_progress' },
            { title: 'C', status: 'pending' },
          ],
        },
      });
    });
    await waitFor(() => {
      if (result.current.taskSnapshot?.kind === 'task-snapshot') {
        expect(result.current.taskSnapshot!.todos[0]!.status).toBe('completed');
      }
    });
    expect(result.current.taskSnapshot!.kind).toBe('task-snapshot');

    await act(async () => {
      state.lastStream!.push({ type: 'done' });
      state.lastStream!.close();
      await sendPromise;
    });
    await waitFor(() => expect(result.current.streamState).toBe('completed'));
  });

  it('clears taskSnapshot per turn (transient)', async () => {
    const { state, result, sendPromise } = await startTurn();
    await act(async () => {
      state.lastStream!.push({
        type: 'status',
        content: '2 todo(s)',
        execution: { ...EXECUTION, operationId: 'todo:x', kind: 'task-snapshot', state: 'completed', todos: [{ title: 'A', status: 'pending' }] },
      });
    });
    await waitFor(() => expect(result.current.taskSnapshot).not.toBeNull());
    await act(async () => {
      state.lastStream!.push({ type: 'done' });
      state.lastStream!.close();
      await sendPromise;
    });
    // New turn resets the checklist (transient projection).
    await act(async () => {
      result.current.selectConversation('conv-1');
    });
    expect(result.current.taskSnapshot).toBeNull();
  });
});