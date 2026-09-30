/** @vitest-environment jsdom */

/**
 * AR-STREAM-RELOAD-001 B+C — density visibility + count separation.
 *
 * Proves the reload presentation contract at the stream layer:
 * - 50 recovered / 49 density-hidden / 1 visible under Operational density;
 * - density raw reveals every eligible recovered item;
 * - search/scope filtering composes with density (AND, never lossy);
 * - zero recovered items is distinguishable from recovered-but-hidden;
 * - the UI announces density-hidden records with a bounded affordance and
 *   a reveal action, never as missing/unloaded/failed/unavailable.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import M11CActivityStream, {
  computeStreamCounts,
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

function logItem(sequence: number): M11CStreamItem {
  return {
    id: `si-act-runnable-${sequence}`,
    sequence,
    timestamp: new Date(Date.UTC(2026, 8, 24, 2, 0, sequence)).toISOString(),
    kind: 'log',
    importance: 'muted',
    actor: { type: 'agent', id: 'developer', displayName: 'Developer' },
    content: `runnable log ${sequence}`,
    fresh: false,
  };
}

function conversationItem(sequence: number): M11CStreamItem {
  return {
    id: 'si-act-human-1',
    sequence,
    timestamp: new Date(Date.UTC(2026, 8, 24, 3, 0, 0)).toISOString(),
    kind: 'conversation',
    importance: 'primary',
    actor: { type: 'human', id: 'local', displayName: 'Operator' },
    content: 'ship it',
    fresh: false,
  };
}

/** 49 muted logs + 1 primary human message = the reload defect shape. */
function reloadItems(): M11CStreamItem[] {
  const items: M11CStreamItem[] = [];
  for (let sequence = 1; sequence <= 49; sequence += 1) items.push(logItem(sequence));
  items.push(conversationItem(50));
  return items;
}

const OPERATIONAL: StreamFilterOptions = {
  density: 'operational',
  activeFilter: 'all',
  typeFilter: 'all',
  searchQuery: '',
};

function renderStream(items: readonly M11CStreamItem[], density?: 'summary' | 'operational' | 'raw') {
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
      {...(density ? { density } : {})}
    />,
  );
}

describe('AR-STREAM-RELOAD-001: stream counts stay separate', () => {
  it('50 recovered / 49 density-hidden / 1 visible under Operational density', () => {
    const counts = computeStreamCounts(reloadItems(), OPERATIONAL);
    expect(counts).toMatchObject({ recovered: 50, scopeEligible: 50, densityHidden: 49, filtered: 1, rendered: 1 });
  });

  it('density raw reveals every eligible recovered item', () => {
    const counts = computeStreamCounts(reloadItems(), { ...OPERATIONAL, density: 'raw' });
    expect(counts).toMatchObject({ recovered: 50, densityHidden: 0, filtered: 50, rendered: 50 });
  });

  it('search composes with density without implying loss', () => {
    const items = reloadItems();
    const match = computeStreamCounts(items, { ...OPERATIONAL, searchQuery: 'ship' });
    expect(match).toMatchObject({ recovered: 50, densityHidden: 49, filtered: 1, rendered: 1 });
    const miss = computeStreamCounts(items, { ...OPERATIONAL, searchQuery: 'no-such-content' });
    expect(miss).toMatchObject({ recovered: 50, filtered: 0, rendered: 0 });
    // The miss hides the visible row too — density still accounts its share.
    expect(miss.densityHidden).toBe(49);
  });

  it('participant and workflow scope compose with density', () => {
    const items = reloadItems();
    const scoped = computeStreamCounts(items, { ...OPERATIONAL, selectedParticipantId: 'local' });
    expect(scoped).toMatchObject({ recovered: 50, scopeEligible: 1, densityHidden: 0, filtered: 1, rendered: 1 });
    const agentScoped = computeStreamCounts(items, { ...OPERATIONAL, selectedParticipantId: 'developer' });
    expect(agentScoped).toMatchObject({
      recovered: 50,
      scopeEligible: 49,
      densityHidden: 49,
      filtered: 0,
      rendered: 0,
    });
    const workflowItems = reloadItems().map((item, index) =>
      index < 25 ? { ...item, workflowRunId: 'wf-1' } : item,
    );
    const workflowScoped = computeStreamCounts(workflowItems, { ...OPERATIONAL, workflowFilter: 'wf-1' });
    expect(workflowScoped.scopeEligible).toBe(25);
    expect(workflowScoped.densityHidden).toBe(25);
    expect(workflowScoped.filtered).toBe(0);
  });

  it('zero recovered is distinguishable from recovered-but-hidden', () => {
    const empty = computeStreamCounts([], OPERATIONAL);
    expect(empty).toMatchObject({ recovered: 0, densityHidden: 0, filtered: 0, rendered: 0 });
    const hidden = computeStreamCounts(
      reloadItems().filter((item) => item.kind === 'log'),
      OPERATIONAL,
    );
    expect(hidden).toMatchObject({ recovered: 49, densityHidden: 49, filtered: 0, rendered: 0 });
  });

  it('rendered stays bounded by the window while recovered is unbounded', () => {
    const items: M11CStreamItem[] = [];
    for (let sequence = 1; sequence <= 250; sequence += 1) items.push(conversationItem(sequence));
    const counts = computeStreamCounts(items, { ...OPERATIONAL, density: 'raw' });
    expect(counts).toMatchObject({ recovered: 250, filtered: 250, rendered: 100 });
  });
});

describe('AR-STREAM-RELOAD-001: density affordance', () => {
  it('announces hidden records with the Operational count and a reveal action', () => {
    renderStream(reloadItems());
    expect(screen.getByText('49 activities hidden by Operational view')).toBeTruthy();
    // One primary row survives, so neither the quiet nor the filtered-empty
    // state may render; nothing claims loss. (Row mounting itself is owned
    // by the virtualizer and unobservable in jsdom — the counts suite proves
    // the 1-visible contract at the pipeline level.)
    expect(screen.queryByText('Room is quiet — nothing running')).toBeNull();
    expect(screen.queryByText('Hidden by the Operational view')).toBeNull();
    expect(screen.queryByText(/missing|unloaded|failed|unavailable/i)).toBeNull();
  });

  it('Show all reveals every recovered record', () => {
    renderStream(reloadItems());
    fireEvent.click(screen.getByText('Show all'));
    expect(screen.queryByText(/hidden by .* view/)).toBeNull();
  });

  it('density raw shows no hidden notice', () => {
    renderStream(reloadItems(), 'raw');
    expect(screen.queryByText(/hidden by .* view/)).toBeNull();
  });

  it('zero recovered renders quiet, not hidden', () => {
    renderStream([]);
    expect(screen.getByText('Room is quiet — nothing running')).toBeTruthy();
    expect(screen.queryByText(/hidden by .* view/)).toBeNull();
  });

  it('recovered-but-hidden renders the density empty state, not quiet', () => {
    renderStream(reloadItems().filter((item) => item.kind === 'log'));
    expect(screen.getByText('Hidden by the Operational view')).toBeTruthy();
    expect(screen.queryByText('Room is quiet — nothing running')).toBeNull();
    expect(screen.getByText('49 activities hidden by Operational view')).toBeTruthy();
  });
});
