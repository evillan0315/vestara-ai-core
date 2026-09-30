/** @vitest-environment jsdom */

/**
 * AR-STREAM-TOOL-001 — standalone tool rows leave the Activity Stream list.
 *
 * Proves at the UI stream projection layer (the M9/M10 durable side is
 * proved in packages/activity-room/__tests__/ar-stream-tool-001.test.ts):
 * - the list excludes every standalone tool.called/succeeded/failed row;
 * - switching density to raw does NOT reveal them as standalone rows;
 * - excluded rows never contribute to visible-item counts (nor to the
 *   density-hidden count — exclusion is structural, not a view);
 * - the owning activity keeps its correlated "Activity · N operations"
 *   session (AR-COORD-002 untouched), so file-mutation Open/View and tool
 *   observations stay reachable;
 * - tool rows never feed Needs Attention;
 * - non-tool items are unaffected under every density.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { deriveCorrelatedSessions } from './correlated-session';
import M11CActivityStream, {
  computeActivityWindowDiagnostics,
  computeStreamCounts,
  filterStreamItems,
  isAttentionItem,
  type StreamFilterOptions,
} from './M11CActivityStream';
import type { M11CStreamItem } from '../../hooks/useM11CActivityRoom';

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    disconnect() {}
    unobserve() {}
  },
);

function base(sequence: number, kind: M11CStreamItem['kind'], content: string): M11CStreamItem {
  return {
    id: `si-act-${sequence}`,
    sequence,
    timestamp: new Date(Date.UTC(2026, 8, 24, 5, 0, sequence)).toISOString(),
    kind,
    importance: 'secondary',
    actor: { type: 'agent', id: 'developer', displayName: 'Developer' },
    content,
    executionId: 'exec-tool-ui-1',
    fresh: false,
  };
}

function toolRow(
  sequence: number,
  toolName: string,
  callID: string,
  status: 'started' | 'completed' | 'failed',
): M11CStreamItem {
  return {
    ...base(sequence, status === 'started' ? 'tool-call' : 'tool-result', `${toolName} ${status}`),
    importance: 'muted',
    tool: { toolName, callID, status, agentId: 'developer' },
    originConversationId: 'conv-tool-1',
  };
}

/** Agent work + 4 tool lifecycle rows + conversation + diagnostic + evidence + log. */
function workItems(): M11CStreamItem[] {
  return [
    { ...base(1, 'activity', 'Agent started work'), importance: 'secondary' },
    toolRow(2, 'read', 'call-read-1', 'started'),
    toolRow(3, 'write', 'call-write-1', 'started'),
    toolRow(4, 'read', 'call-read-1', 'completed'),
    toolRow(5, 'write', 'call-write-1', 'completed'),
    { ...base(6, 'activity', 'Agent completed work'), importance: 'secondary' },
    {
      ...base(7, 'conversation', 'ship it'),
      importance: 'primary',
      actor: { type: 'human', id: 'local', displayName: 'Operator' },
      executionId: undefined,
    },
    { ...base(8, 'diagnostic', 'Task failed'), importance: 'secondary' },
    { ...base(9, 'evidence', 'tests passed'), importance: 'secondary' },
    { ...base(10, 'log', 'runnable log'), importance: 'muted' },
  ];
}

const OPERATIONAL: StreamFilterOptions = {
  density: 'operational',
  activeFilter: 'all',
  typeFilter: 'all',
  searchQuery: '',
};

describe('AR-STREAM-TOOL-001: standalone tool rows leave the list', () => {
  it('excludes every tool lifecycle row under Operational density', () => {
    const filtered = filterStreamItems(workItems(), OPERATIONAL);
    expect(filtered.some((item) => item.kind === 'tool-call' || item.kind === 'tool-result')).toBe(false);
    expect(filtered.map((item) => item.sequence).sort()).toEqual([1, 6, 7, 8, 9]);
  });

  it('raw density does not reveal them as standalone rows', () => {
    for (const density of ['raw', 'operational', 'summary'] as const) {
      const filtered = filterStreamItems(workItems(), { ...OPERATIONAL, density });
      expect(filtered.some((item) => item.kind === 'tool-call' || item.kind === 'tool-result')).toBe(false);
    }
    const raw = filterStreamItems(workItems(), { ...OPERATIONAL, density: 'raw' });
    expect(raw.map((item) => item.sequence)).toEqual([1, 6, 7, 8, 9, 10]);
  });

  it('keeps excluded rows out of every visible-item count (and out of density-hidden)', () => {
    const counts = computeStreamCounts(workItems(), OPERATIONAL);
    expect(counts).toMatchObject({
      recovered: 10,
      excludedToolRows: 4,
      scopeEligible: 6,
      densityHidden: 1,
      filtered: 5,
      rendered: 5,
    });
    const raw = computeStreamCounts(workItems(), { ...OPERATIONAL, density: 'raw' });
    expect(raw).toMatchObject({ recovered: 10, excludedToolRows: 4, filtered: 6, densityHidden: 0 });
  });

  it('keeps the owning activity session with exact tool operations', () => {
    const correlated = deriveCorrelatedSessions(workItems());
    const filtered = filterStreamItems(correlated, OPERATIONAL);
    const parent = filtered.find((item) => item.sequence === 1);
    expect(parent).toBeDefined();
    expect(parent!.session?.operations.map((operation) => operation.operationId).sort()).toEqual([
      'call-read-1',
      'call-write-1',
    ]);
    expect(parent!.session?.operations.map((operation) => operation.toolName).sort()).toEqual(['read', 'write']);
    // File-mutation Open/View path keeps its identity (conversation + operation).
    for (const operation of parent!.session?.operations ?? []) {
      expect(operation.conversationId).toBe('conv-tool-1');
      expect(operation.activityIds.length).toBeGreaterThan(0);
    }
    expect(filtered.some((item) => item.kind === 'tool-call' || item.kind === 'tool-result')).toBe(false);
  });

  it('never feeds Needs Attention from tool rows', () => {
    for (const item of workItems()) {
      if (item.kind === 'tool-call' || item.kind === 'tool-result') {
        expect(isAttentionItem(item)).toBe(false);
      }
    }
    expect(isAttentionItem(workItems().find((item) => item.kind === 'diagnostic')!)).toBe(true);
  });

  it('leaves non-tool items unaffected under every density', () => {
    const items = workItems();
    const eligible = items.filter((item) => item.kind !== 'tool-call' && item.kind !== 'tool-result');
    const raw = filterStreamItems(items, { ...OPERATIONAL, density: 'raw' });
    expect(raw.map((item) => item.id).sort()).toEqual(eligible.map((item) => item.id).sort());
    const summary = filterStreamItems(items, { ...OPERATIONAL, density: 'summary' });
    expect(summary.map((item) => item.sequence).sort()).toEqual([1, 6, 7, 8, 9]);
  });
});

describe('AR-STREAM-TOOL-001: list affordances ignore excluded tool rows', () => {
  function renderStream(items: readonly M11CStreamItem[]) {
    return render(
      <M11CActivityStream
        items={items}
        stateLabel="Live"
        connectionState="live"
        unread={0}
        loadingHistory={false}
        olderLoaded={0}
        loading={false}
        onReportViewport={vi.fn()}
        onClearUnread={vi.fn()}
      />,
    );
  }

  it('tab counts exclude tool rows', () => {
    renderStream(workItems());
    expect(screen.getByText('All (6)')).toBeTruthy();
  });

  it('shows no density notice for structurally excluded tool rows', () => {
    renderStream(workItems().filter((item) => item.kind !== 'log'));
    expect(screen.queryByText(/hidden by .* view/)).toBeNull();
  });

  it('renders a tools-only window as tool-only, never quiet or missing', () => {
    renderStream(workItems().filter((item) => item.kind === 'tool-call' || item.kind === 'tool-result'));
    expect(screen.getByText('No list activity in this window')).toBeTruthy();
    expect(screen.queryByText('Room is quiet — nothing running')).toBeNull();
    expect(screen.queryByText(/missing|unloaded|failed|unavailable/i)).toBeNull();
  });

  it('records the tool-only working-window diagnostics without masking the projection', () => {
    const items = workItems().filter((item) => item.kind === 'tool-call' || item.kind === 'tool-result');
    const diagnostics = computeActivityWindowDiagnostics(items, OPERATIONAL, 0);
    expect(diagnostics).toEqual({
      recoveredRecordCount: 4,
      listEligibleEntityCount: 0,
      excludedToolRowCount: 4,
      activeFilters: {
        density: 'operational',
        activeFilter: 'all',
        typeFilter: 'all',
        searchQuery: '',
        startDate: '',
        endDate: '',
      },
      snapshotEntityCount: 0,
    });
  });
});
