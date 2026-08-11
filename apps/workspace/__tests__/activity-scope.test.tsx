import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TelemetryProvider } from '../src/contexts/TelemetryContext.js';
import { ThemeProvider } from '../src/lib/theme.js';
import ActivityRoomPage from '../src/pages/activity/ActivityRoomPage.js';
import type { ActivityRecord } from '../src/pages/activity/activity-types.js';

const workflowA: ActivityRecord = {
  id: 'activity:evt-1:workflow',
  sequence: 1,
  timestamp: '2026-08-06T12:00:00.000Z',
  actor: { type: 'system', id: 'workflow-orchestrator', displayName: 'workflow-orchestrator', role: 'system' },
  kind: 'workflow',
  workflowId: 'wfo-1',
  sessionId: 'sess-1',
  previousState: 'draft',
  currentState: 'executing',
  reason: 'phase A changed',
  authoritative: true,
  observed: false,
  evidenceRefs: [],
};

const workflowB: ActivityRecord = {
  id: 'activity:evt-2:workflow',
  sequence: 2,
  timestamp: '2026-08-06T12:00:01.000Z',
  actor: { type: 'system', id: 'workflow-orchestrator', displayName: 'workflow-orchestrator', role: 'system' },
  kind: 'workflow',
  workflowId: 'wfo-2',
  sessionId: 'sess-2',
  previousState: 'executing',
  currentState: 'completed',
  reason: 'phase B completed',
  authoritative: true,
  observed: false,
  evidenceRefs: [],
};

const unassigned: ActivityRecord = {
  id: 'activity:evt-3:agent-message',
  sequence: 3,
  timestamp: '2026-08-06T12:00:02.000Z',
  actor: { type: 'agent', id: 'engineer', displayName: 'engineer', role: 'agent' },
  kind: 'agent-message',
  agentId: 'engineer',
  messageKind: 'message',
  content: 'no workflow attached',
  evidenceRefs: [],
};

const ALL_RECORDS = [workflowA, workflowB, unassigned];

class MockWebSocket {
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 0;
  constructor(_url: string) {
    queueMicrotask(() => this.onopen?.());
  }
  send(_data: string): void {}
  close(): void {
    this.onclose?.();
  }
}

let fetchImpl: ReturnType<typeof vi.fn> | undefined;

function renderRoom() {
  return render(
    <ThemeProvider>
      <TelemetryProvider>
        <ActivityRoomPage />
      </TelemetryProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal('WebSocket', MockWebSocket);
  fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const scoped = url.includes('workflowId=wfo-1');
    return {
      ok: true,
      json: async () => ({
        records: scoped ? [workflowA] : ALL_RECORDS,
        firstSequence: scoped ? 1 : 1,
        lastSequence: scoped ? 1 : 3,
        nextSequence: scoped ? 2 : 4,
      }),
    };
  });
  vi.stubGlobal('fetch', fetchImpl);
  window.history.replaceState(null, '', '/activity');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/activity');
});

describe('Activity scope (AAR-001F)', () => {
  it('lists workflow and session selectors derived from records', async () => {
    renderRoom();
    await waitFor(() => expect(screen.getByText('phase A changed')).toBeTruthy());

    expect(screen.getByRole('button', { name: 'All activity' })).toBeTruthy();
    expect(screen.getByLabelText('Scope to workflow')).toBeTruthy();
    expect(screen.getByLabelText('Scope to session')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'wfo-1' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'wfo-2' })).toBeTruthy();
  });

  it('scopes the stream to a workflow and refetches scoped history', async () => {
    renderRoom();
    await waitFor(() => expect(screen.getByText('phase A changed')).toBeTruthy());

    const select = screen.getByLabelText('Scope to workflow');
    fireEvent.change(select, { target: { value: 'wfo-1' } });

    // The scoped history fetch includes the workflow filter.
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining('workflowId=wfo-1')));

    // Only records for wfo-1 remain visible.
    await waitFor(() => expect(screen.queryByText('phase B completed')).toBeNull());
    expect(screen.getByText('phase A changed')).toBeTruthy();
    expect(screen.queryByText('no workflow attached')).toBeNull();
    expect(screen.getByText(/workflow wfo-1/)).toBeTruthy();
  });

  it('updates the URL when the scope changes', async () => {
    renderRoom();
    await waitFor(() => expect(screen.getByText('phase A changed')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Scope to workflow'), { target: { value: 'wfo-1' } });

    await waitFor(() => expect(window.location.search).toContain('workflowId=wfo-1'));
  });

  it('returns to the global view with All activity', async () => {
    renderRoom();
    await waitFor(() => expect(screen.getByText('phase A changed')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Scope to workflow'), { target: { value: 'wfo-1' } });
    await waitFor(() => expect(screen.queryByText('phase B completed')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'All activity' }));
    await waitFor(() => expect(screen.getByText('phase B completed')).toBeTruthy());
    expect(window.location.search).not.toContain('workflowId');
  });

  it('honours a workflow scope from the initial URL', async () => {
    window.history.replaceState(null, '', '/activity?workflowId=wfo-1');
    renderRoom();

    // Initial history load is scoped.
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining('workflowId=wfo-1')));
    await waitFor(() => expect(screen.getByText('phase A changed')).toBeTruthy());
    expect(screen.queryByText('phase B completed')).toBeNull();
  });
});
