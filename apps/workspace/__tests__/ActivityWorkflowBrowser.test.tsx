import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EffectiveUnitState } from '../src/lib/activity';
import ActivityWorkflowBrowser from '../src/pages/activity/ActivityWorkflowBrowser.js';
import type { ActivityProjectionRecord, ActivityScope } from '../src/pages/activity/activity-types.js';

const UNITS: EffectiveUnitState[] = [
  { workflowId: 'wfo-1', latestEffect: 'decision', lastActivity: new Date().toISOString(), recordCount: 42 },
  { workflowId: 'wfo-2', latestEffect: 'authorization', lastActivity: '2026-08-06T12:00:01.000Z', recordCount: 7 },
  { sessionId: 'sess-9', latestEffect: 'closure', lastActivity: '2026-08-06T12:00:02.000Z', recordCount: 3 },
];

const EMPTY_RECORDS: readonly ActivityProjectionRecord[] = [];

function renderBrowser(props: Partial<React.ComponentProps<typeof ActivityWorkflowBrowser>> = {}) {
  const scopeChange = vi.fn();
  const view = render(
    <ActivityWorkflowBrowser
      records={EMPTY_RECORDS}
      scope={{}}
      onScopeChange={scopeChange}
      units={UNITS}
      status="ready"
      onRetry={vi.fn()}
      {...props}
    />,
  );
  return { ...view, scopeChange };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-06T12:00:10.000Z'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Activity Workflow Browser (AR-02)', () => {
  it('renders one lightweight summary row per unit — never activity content', () => {
    renderBrowser();
    expect(screen.getByRole('button', { name: /wfo-1/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /wfo-2/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /sess-9/ })).toBeTruthy();

    // Latest disposition + event count are present.
    expect(screen.getByText(/Decision · 42 events/)).toBeTruthy();
    expect(screen.getByText(/Authorization · 7 events/)).toBeTruthy();

    // Relative last activity is present (wfo-1 is 'just now'; sess-9 is '8s ago').
    expect(screen.getByText('just now')).toBeTruthy();
    expect(screen.getByText('8s ago')).toBeTruthy();

    // No activity records/previews/raw content anywhere in the region.
    expect(screen.queryByText(/content|preview|reasoning|model-response/i)).toBeNull();
  });

  it('scopes the stream when a unit is selected and marks the active scope gold', () => {
    const { scopeChange } = renderBrowser({ scope: { workflowId: 'wfo-1' } });

    const selected = screen.getByRole('button', { name: /wfo-1/ });
    expect(selected.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: /wfo-2/ }));
    expect(scopeChange).toHaveBeenCalledWith({ workflowId: 'wfo-2' });
  });

  it('scopes by session when the unit has no workflow id', () => {
    const { scopeChange } = renderBrowser();
    fireEvent.click(screen.getByRole('button', { name: /sess-9/ }));
    expect(scopeChange).toHaveBeenCalledWith({ sessionId: 'sess-9' });
  });

  it('shows a clear empty state when ready with no units', () => {
    renderBrowser({ units: [] });
    expect(screen.getByText('No active workflows yet.')).toBeTruthy();
  });

  it('shows distinct loading, stale, and error states with a retry path', () => {
    const retry = vi.fn();
    const view = renderBrowser({ units: [], status: 'loading', onRetry: retry });
    expect(screen.getByText('Loading workflows…')).toBeTruthy();

    view.rerender(
      <ActivityWorkflowBrowser
        records={EMPTY_RECORDS}
        scope={{}}
        onScopeChange={vi.fn()}
        units={[]}
        status="error"
        onRetry={retry}
      />,
    );
    expect(screen.getByText(/Workflows are unavailable/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledTimes(1);

    view.rerender(
      <ActivityWorkflowBrowser
        records={EMPTY_RECORDS}
        scope={{}}
        onScopeChange={vi.fn()}
        units={UNITS}
        status="stale"
        onRetry={retry}
      />,
    );
    expect(screen.getByText(/previously computed workflows/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /wfo-1/ })).toBeTruthy();
  });

  it('never carries stale rows from another scope into a new scope', () => {
    const scopeChange = vi.fn();
    const view = renderBrowser({ scope: { workflowId: 'wfo-1' } });
    expect(screen.getByRole('button', { name: /wfo-1/ }).getAttribute('aria-pressed')).toBe('true');

    view.rerender(
      <ActivityWorkflowBrowser
        records={EMPTY_RECORDS}
        scope={{ workflowId: 'wfo-2' }}
        onScopeChange={scopeChange}
        units={UNITS}
        status="ready"
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /wfo-1/ }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: /wfo-2/ }).getAttribute('aria-pressed')).toBe('true');
  });
});
