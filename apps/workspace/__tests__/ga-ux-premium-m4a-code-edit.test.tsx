/**
 * GA-UX-PREMIUM M4A — AssistantCodeEdit deterministic presentation tests.
 *
 * CONTRACT-FIXTURE acceptance: fixtures built from the authoritative
 * assistant.execution.v1 contract (via the shared normalizer), NOT live
 * OpenCode evidence. Covers all three representations (patch / hunks /
 * unavailable), lifecycle, operations, counts, truncation, supersession,
 * collapse, containment, actions, and no-fabrication invariants.
 */

// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeAssistantExecutionDetail } from '@vestara/shared';
import { AssistantCodeEdit, classifyDiffLine, diffToText, resolveDefaultExpanded } from '../src/components/assistant/AssistantCodeEdit';
import { AssistantExecutionTimeline } from '../src/components/assistant/AssistantToolCard';
import { useAssistantConversation } from '../src/hooks/useAssistantConversation';

const mockFetch = vi.fn();
global.fetch = mockFetch as any;

const CONTRACT = {
  contract: 'assistant.execution.v1',
  version: 1,
  source: 'opencode',
  timestamp: 1_700_000_000_000,
  operationId: 'op-test',
} as const;

function editDetail(overrides: Record<string, unknown>) {
  const detail = normalizeAssistantExecutionDetail({ ...CONTRACT, kind: 'edit', state: 'completed', file: 'apps/workspace/src/components/assistant/ConversationPanel.tsx', operation: 'modified', additions: 5, deletions: 4, ...overrides });
  if (!detail || detail.kind !== 'edit') throw new Error('fixture must be a valid edit detail');
  return detail;
}

const SMALL_PATCH = '@@ -498,4 +498,5 @@\n const title = ...\n-return conversation.title\n+return conversation.title ?? fallback\n+extra line\n';

function toolOp(id: string, name = 'edit', state: 'running' | 'completed' | 'failed' = 'completed') {
  return { id, name, state, preview: undefined as string | undefined };
}

afterEach(() => {
  cleanup();
});

describe('AssistantCodeEdit — patch representation', () => {
  it('renders the runtime patch with header (operation · filename · counts)', () => {
    render(<AssistantCodeEdit detail={editDetail({ patch: SMALL_PATCH, diffRepresentation: 'patch' })} />);
    expect(screen.getByTestId('assistant-code-edit')).toBeTruthy();
    expect(screen.getByText('Modified')).toBeTruthy();
    expect(screen.getByText('ConversationPanel.tsx')).toBeTruthy();
    expect(screen.getByTestId('code-edit-path').textContent).toContain('apps/workspace/src/components/assistant/ConversationPanel.tsx');
    expect(screen.getByTestId('code-edit-counts').textContent).toContain('+5');
    expect(screen.getByTestId('code-edit-counts').textContent).toContain('-4');
  });

  it('preserves patch text verbatim (authoritative runtime string)', () => {
    render(<AssistantCodeEdit detail={editDetail({ patch: SMALL_PATCH, diffRepresentation: 'patch' })} />);
    const diff = screen.getByTestId('patch-diff');
    expect(diff.textContent).toContain('return conversation.title');
    expect(diff.textContent).toContain('?? fallback');
    expect(diff.textContent).toContain('@@ -498,4 +498,5 @@');
  });

  it('classifies patch lines for presentation (+/-/@@/context)', () => {
    expect(classifyDiffLine('@@ -1,2 +1,2 @@')).toBe('hunk');
    expect(classifyDiffLine('+added')).toBe('add');
    expect(classifyDiffLine('-removed')).toBe('delete');
    expect(classifyDiffLine(' context')).toBe('context');
    render(<AssistantCodeEdit detail={editDetail({ patch: SMALL_PATCH, diffRepresentation: 'patch' })} />);
    const lines = screen.getAllByTestId('diff-line');
    expect(lines.some((l) => l.dataset.kind === 'add')).toBe(true);
    expect(lines.some((l) => l.dataset.kind === 'delete')).toBe(true);
    expect(lines.some((l) => l.dataset.kind === 'hunk')).toBe(true);
    expect(lines.some((l) => l.dataset.kind === 'context')).toBe(true);
  });

  it('patch is never converted to hunks (authority preserved)', () => {
    const detail = editDetail({ patch: SMALL_PATCH, diffRepresentation: 'patch' });
    expect(detail.diffRepresentation).toBe('patch');
    expect(detail.hunks).toBeUndefined();
    expect(diffToText(detail)).toBe(SMALL_PATCH);
  });
});

describe('AssistantCodeEdit — structured hunks representation', () => {
  const HUNKS = [
    { oldStart: 498, oldLines: 4, newStart: 498, newLines: 5, content: ' const title = ...\n-return conversation.title\n+return conversation.title ?? fallback' },
    { oldStart: 502, content: ' tail line' },
  ];

  it('renders structured hunks with preserved line metadata', () => {
    render(<AssistantCodeEdit detail={editDetail({ hunks: HUNKS, diffRepresentation: 'hunks' })} />);
    expect(screen.getByTestId('hunk-diff')).toBeTruthy();
    expect(screen.getAllByTestId('hunk')).toHaveLength(2);
    const header = screen.getAllByTestId('hunk')[0]!.textContent;
    expect(header).toContain('-498,4');
    expect(header).toContain('+498,5');
  });

  it('absent hunk line metadata remains absent (never manufactured)', () => {
    render(<AssistantCodeEdit detail={editDetail({ hunks: HUNKS, diffRepresentation: 'hunks' })} />);
    const secondHunk = screen.getAllByTestId('hunk')[1]!;
    // oldStart present, but oldLines/newStart/newLines absent → header shows only oldStart.
    const header = within(secondHunk).getAllByTestId('diff-line')[0]!;
    expect(header.dataset.kind).toBe('hunk');
    expect(secondHunk.textContent).toContain('tail line');
    expect(secondHunk.textContent).not.toContain('undefined');
  });

  it('hunks are never converted to a patch (authority preserved)', () => {
    const detail = editDetail({ hunks: HUNKS, diffRepresentation: 'hunks' });
    expect(detail.diffRepresentation).toBe('hunks');
    expect(detail.patch).toBeUndefined();
    // diffToText derives a presentation string from hunks, never a runtime claim.
    expect(diffToText(detail)).toContain('@@ -498,4 +498,5 @@');
  });
});

describe('AssistantCodeEdit — unavailable representation', () => {
  it('produces no fake diff; lifecycle completed stays completed', () => {
    render(<AssistantCodeEdit detail={editDetail({ diffRepresentation: 'unavailable' })} />);
    expect(screen.getByTestId('code-edit-unavailable').textContent).toContain('Diff unavailable');
    expect(screen.queryByTestId('patch-diff')).toBeNull();
    expect(screen.queryByTestId('hunk-diff')).toBeNull();
    expect(screen.getByTestId('assistant-code-edit').dataset.state).toBe('completed');
    expect(screen.getByTestId('code-edit-lifecycle').textContent).toContain('✓');
  });

  it('failed lifecycle is visibly unsuccessful even with no diff', () => {
    render(<AssistantCodeEdit detail={editDetail({ state: 'failed', diffRepresentation: 'unavailable' })} />);
    expect(screen.getByTestId('code-edit-lifecycle').textContent).toContain('✕');
    expect(screen.getByTestId('assistant-code-edit').dataset.state).toBe('failed');
  });
});

describe('AssistantCodeEdit — operations, counts, truncation', () => {
  it('renders Added / Modified / Deleted operation semantics', () => {
    const { unmount } = render(<AssistantCodeEdit detail={editDetail({ operation: 'added', additions: 10, deletions: 0, patch: '+a\n+b', diffRepresentation: 'patch' })} />);
    expect(screen.getByText('Added')).toBeTruthy();
    unmount();
    render(<AssistantCodeEdit detail={editDetail({ operation: 'deleted', additions: 0, deletions: 3, patch: '-a\n-b\n-c', diffRepresentation: 'patch' })} />);
    expect(screen.getByText('Deleted')).toBeTruthy();
  });

  it('counts absent when the contract omits them (never defaulted to zero)', () => {
    render(<AssistantCodeEdit detail={editDetail({ additions: undefined, deletions: undefined, patch: SMALL_PATCH, diffRepresentation: 'patch' })} />);
    expect(screen.queryByTestId('code-edit-counts')).toBeNull();
  });

  it('patch truncation surfaces a visible warning', () => {
    // The normalizer derives patchTruncated truthfully from an oversized patch.
    render(<AssistantCodeEdit detail={editDetail({ patch: 'p'.repeat(21_000), diffRepresentation: 'patch' })} />);
    expect(screen.getByTestId('code-edit-truncated').textContent).toContain('Diff preview truncated');
  });

  it('hunk truncation surfaces the equivalent warning', () => {
    render(
      <AssistantCodeEdit
        detail={editDetail({ hunks: [{ oldStart: 1, content: 'h'.repeat(1_100) }], diffRepresentation: 'hunks' })}
      />,
    );
    expect(screen.getByTestId('code-edit-truncated').textContent).toContain('Diff preview truncated');
  });
});

describe('AssistantCodeEdit — collapse/expand', () => {
  it('small edits default expanded; large edits default collapsed (deterministic rule)', () => {
    expect(resolveDefaultExpanded(editDetail({ patch: SMALL_PATCH, diffRepresentation: 'patch' }))).toBe(true);
    const bigPatch = Array.from({ length: 40 }, (_, i) => `+line ${i}`).join('\n');
    expect(resolveDefaultExpanded(editDetail({ patch: bigPatch, additions: 40, deletions: 0, diffRepresentation: 'patch' }))).toBe(false);
    expect(resolveDefaultExpanded(editDetail({ diffRepresentation: 'unavailable' }))).toBe(false);
  });

  it('user expansion state survives unrelated re-renders (unrelated text delta)', () => {
    const detail = editDetail({ patch: Array.from({ length: 40 }, (_, i) => `+line ${i}`).join('\n'), additions: 40, deletions: 0, diffRepresentation: 'patch' });
    const { rerender } = render(<AssistantCodeEdit detail={detail} />);
    // Large edit → collapsed by default.
    expect(screen.queryByTestId('patch-diff')).toBeNull();
    act(() => {
      fireEvent.click(screen.getByTestId('code-edit-toggle'));
    });
    expect(screen.getByTestId('patch-diff')).toBeTruthy();
    // Unrelated re-render (streaming text update) must not reset expansion.
    rerender(<AssistantCodeEdit detail={detail} />);
    expect(screen.getByTestId('patch-diff')).toBeTruthy();
  });
});

describe('AssistantCodeEdit — containment + actions', () => {
  it('diff surface scrolls internally (never forces the panel wider)', () => {
    render(<AssistantCodeEdit detail={editDetail({ patch: SMALL_PATCH, diffRepresentation: 'patch' })} />);
    const scroll = screen.getByTestId('patch-diff');
    expect(scroll.className).toContain('overflow-x-auto');
    const longLine = screen.getAllByTestId('diff-line').find((l) => l.className.includes('min-w-max'));
    expect(longLine).toBeTruthy();
  });

  it('Copy path and Copy diff actions exist; no Apply/Accept/Reject/Revert/Run', () => {
    const clipboard = { text: '' };
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(async (t: string) => { clipboard.text = t; }) }, configurable: true });
    render(<AssistantCodeEdit detail={editDetail({ patch: SMALL_PATCH, diffRepresentation: 'patch' })} />);
    fireEvent.click(screen.getByTestId('code-edit-copy-path'));
    expect(clipboard.text).toContain('ConversationPanel.tsx');
    fireEvent.click(screen.getByTestId('code-edit-copy-diff'));
    expect(clipboard.text).toBe(SMALL_PATCH);
    const labels = screen.getAllByRole('button').map((b) => (b.textContent ?? '').toLowerCase());
    for (const forbidden of ['apply', 'accept', 'reject', 'revert', 'run']) {
      expect(labels.some((l) => l.includes(forbidden))).toBe(false);
    }
  });
});

describe('AssistantExecutionTimeline — M2 supersession', () => {
  it('matching generic M2 operation is superseded by the structured edit (one presentation)', () => {
    const generic = toolOp('op-edit-1');
    const structured = editDetail({ patch: SMALL_PATCH, diffRepresentation: 'patch' });
    const { container } = render(
      <AssistantExecutionTimeline
        operations={[generic]}
        structuredEdits={[{ operationId: 'abc', detail: structured, supersedesOpId: 'op-edit-1' }]}
        expanded
        onToggle={() => {}}
      />,
    );
    expect(within(container).getByTestId('assistant-code-edit')).toBeTruthy();
    expect(within(container).queryByTestId('assistant-tool-card')).toBeNull();
  });

  it('unrelated M2 operations are preserved alongside a superseded edit', () => {
    const genericEdit = toolOp('op-edit-1');
    const genericRead = toolOp('op-read-1', 'read');
    const structured = editDetail({ patch: SMALL_PATCH, diffRepresentation: 'patch' });
    const { container } = render(
      <AssistantExecutionTimeline
        operations={[genericEdit, genericRead]}
        structuredEdits={[{ operationId: 'abc', detail: structured, supersedesOpId: 'op-edit-1' }]}
        expanded
        onToggle={() => {}}
      />,
    );
    expect(within(container).getByTestId('assistant-code-edit')).toBeTruthy();
    const cards = within(container).getAllByTestId('assistant-tool-card');
    expect(cards).toHaveLength(1);
    expect(cards[0]!.dataset.tool).toBe('read');
  });

  it('same-name edits with distinct operationIds remain distinct', () => {
    const a = editDetail({ file: 'packages/a.ts', patch: '+a', additions: 1, deletions: 0, diffRepresentation: 'patch' });
    const b = editDetail({ file: 'packages/a.ts', patch: '+b', additions: 1, deletions: 0, diffRepresentation: 'patch' });
    const { container } = render(
      <AssistantExecutionTimeline
        operations={[]}
        structuredEdits={[
          { operationId: 'call-a', detail: a },
          { operationId: 'call-b', detail: b },
        ]}
        expanded
        onToggle={() => {}}
      />,
    );
    expect(within(container).getAllByTestId('assistant-code-edit')).toHaveLength(2);
  });

  it('multiple edit operations render as distinct surfaces', () => {
    const first = editDetail({ file: 'packages/a.ts', patch: '+one', additions: 1, deletions: 0, diffRepresentation: 'patch' });
    const second = editDetail({ file: 'packages/b.ts', patch: '+two', additions: 1, deletions: 0, diffRepresentation: 'patch' });
    const { container } = render(
      <AssistantExecutionTimeline
        operations={[]}
        structuredEdits={[
          { operationId: 'op-1', detail: first },
          { operationId: 'op-2', detail: second },
        ]}
        expanded
        onToggle={() => {}}
      />,
    );
    const edits = within(container).getAllByTestId('assistant-code-edit');
    expect(edits).toHaveLength(2);
  });
});

describe('AssistantCodeEdit — no fabrication invariants', () => {
  it('never reads repository state (no fetch, no reread)', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    render(<AssistantCodeEdit detail={editDetail({ patch: SMALL_PATCH, diffRepresentation: 'patch' })} />);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('no patch→hunk authority conversion (no derived line metadata claimed as runtime)', () => {
    const detail = editDetail({ patch: '@@ -1,2 +1,2 @@\n+hello', diffRepresentation: 'patch' });
    render(<AssistantCodeEdit detail={detail} />);
    // The presentation classifies lines visually but the contract object is untouched.
    expect(detail.diffRepresentation).toBe('patch');
    expect(detail.hunks).toBeUndefined();
  });

  it('unknown operation type falls back to Edit label (no inference)', () => {
    render(<AssistantCodeEdit detail={editDetail({ operation: undefined, patch: SMALL_PATCH, diffRepresentation: 'patch' })} />);
    expect(screen.getByText('Edit')).toBeTruthy();
  });
});
describe('useAssistantConversation — structuredEdits collection (M4A)', () => {
  const ISO = '2026-01-01T00:00:00Z';
  const EXECUTION = {
    contract: 'assistant.execution.v1',
    version: 1,
    source: 'opencode',
    timestamp: 1_700_000_000_000,
  };

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
      sendPromise = result.current.sendMessage('edit the file');
    });
    await waitFor(() => expect(state.lastStream).toBeDefined());
    return { state, result, sendPromise: sendPromise! };
  }

  it('collects structured edit projections and correlates supersession by operationId', async () => {
    const { state, result, sendPromise } = await startTurn();
    // Generic 'edit' tool start with authoritative operationId 'abc'.
    await act(async () => {
      state.lastStream!.push({ type: 'tool', name: 'edit', execution: { ...EXECUTION, operationId: 'abc', kind: 'tool', state: 'running', tool: 'edit' } });
    });
    await waitFor(() => expect(result.current.toolOperations).toHaveLength(1));
    const genericOpId = result.current.toolOperations[0]!.id;

    // Structured edit detail (same operationId) arrives via the status channel.
    await act(async () => {
      state.lastStream!.push({
        type: 'status',
        content: 'Edited ConversationPanel.tsx',
        execution: {
          ...EXECUTION,
          operationId: 'abc',
          kind: 'edit',
          state: 'completed',
          file: 'apps/workspace/src/components/assistant/ConversationPanel.tsx',
          operation: 'modified',
          additions: 5,
          deletions: 4,
          diffRepresentation: 'patch',
          patch: '@@ -498,4 +498,5 @@\n-return conversation.title\n+return conversation.title ?? fallback',
        },
      });
    });
    await waitFor(() => expect(result.current.structuredEdits).toHaveLength(1));
    expect(result.current.structuredEdits[0]!.operationId).toBe('abc');
    expect(result.current.structuredEdits[0]!.supersedesOpId).toBe(genericOpId);
    if (result.current.structuredEdits[0]!.detail.kind === 'edit') {
      expect(result.current.structuredEdits[0]!.detail.diffRepresentation).toBe('patch');
      expect(result.current.structuredEdits[0]!.detail.patch).toContain('?? fallback');
    }

    // An unrelated text delta must not disturb the structured projection.
    await act(async () => {
      state.lastStream!.push({ type: 'delta', content: 'streaming…' });
    });
    await waitFor(() => expect(result.current.streamingText).toBe('streaming…'));
    expect(result.current.structuredEdits).toHaveLength(1);
    expect(result.current.structuredEdits[0]!.operationId).toBe('abc');

    await act(async () => {
      state.lastStream!.push({ type: 'done' });
      state.lastStream!.close();
      await sendPromise;
    });
    await waitFor(() => expect(result.current.streamState).toBe('completed'));
  });

  it('dedupes edit evidence by operationId (later replaces earlier)', async () => {
    const { state, result, sendPromise } = await startTurn();
    await act(async () => {
      state.lastStream!.push({
        type: 'status',
        content: 'Edited a.ts',
        execution: { ...EXECUTION, operationId: 'edit-1', kind: 'edit', state: 'running', file: 'packages/a.ts', diffRepresentation: 'unavailable' },
      });
      state.lastStream!.push({
        type: 'status',
        content: 'Edited a.ts',
        execution: { ...EXECUTION, operationId: 'edit-1', kind: 'edit', state: 'completed', file: 'packages/a.ts', operation: 'modified', additions: 2, deletions: 1, diffRepresentation: 'patch', patch: '+x\n-y' },
      });
    });
    await waitFor(() => expect(result.current.structuredEdits).toHaveLength(1));
    expect(result.current.structuredEdits[0]!.detail.state).toBe('completed');
    await act(async () => {
      state.lastStream!.push({ type: 'done' });
      state.lastStream!.close();
      await sendPromise;
    });
  });
});
