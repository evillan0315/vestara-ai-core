/** @vitest-environment jsdom */

/**
 * AR-STREAM-HISTORY-001 — recovered stream visibility and history affordance.
 *
 * Protects the Activity Room regression where a hydrated stream could appear
 * empty or collapse to one visible activity. The presentation layer must keep
 * all recovered records in its counts and expose older history independently.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import M11CActivityStream, { computeStreamCounts } from './M11CActivityStream';
import type { M11CStreamItem } from '../../hooks/useM11CActivityRoom';

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    disconnect() {}
    unobserve() {}
  },
);

function activity(sequence: number, content: string): M11CStreamItem {
  return {
    id: `activity-history-${sequence}`,
    sequence,
    timestamp: new Date(Date.UTC(2026, 8, 24, 6, 0, sequence)).toISOString(),
    kind: 'activity',
    importance: 'secondary',
    actor: { type: 'agent', id: 'developer', displayName: 'Developer' },
    content,
    fresh: false,
  };
}

const recoveredItems = [
  activity(1, 'Agent started work'),
  activity(2, 'Agent inspected the project'),
  activity(3, 'Agent completed work'),
];

function renderStream(overrides: Partial<ComponentProps<typeof M11CActivityStream>> = {}) {
  return render(
    <M11CActivityStream
      items={recoveredItems}
      stateLabel="Live"
      connectionState="live"
      unread={0}
      loadingHistory={false}
      olderLoaded={0}
      loading={false}
      onReportViewport={vi.fn()}
      onClearUnread={vi.fn()}
      {...overrides}
    />,
  );
}

describe('AR-STREAM-HISTORY-001: recovered stream visibility', () => {
  it('keeps every recovered activity in the visible stream counts', () => {
    const counts = computeStreamCounts(recoveredItems, {
      density: 'raw',
      activeFilter: 'all',
      typeFilter: 'all',
      searchQuery: '',
    });

    expect(counts).toMatchObject({
      recovered: 3,
      scopeEligible: 3,
      filtered: 3,
      rendered: 3,
    });

    renderStream({ density: 'raw' });
    expect(screen.getByText('All (3)')).toBeTruthy();
  });

  it('shows Load older history when more durable history is available', () => {
    const onLoadOlder = vi.fn();
    renderStream({ hasMoreHistory: true, onLoadOlder });

    fireEvent.click(screen.getByRole('button', { name: 'Load older history' }));

    expect(onLoadOlder).toHaveBeenCalledTimes(1);
  });

  it('keeps the history affordance in its loading state while fetching', () => {
    renderStream({ hasMoreHistory: true, loadingHistory: true, onLoadOlder: vi.fn() });

    expect(screen.getByRole('button', { name: 'Loading older…' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Load older history' })).toBeNull();
  });
});
