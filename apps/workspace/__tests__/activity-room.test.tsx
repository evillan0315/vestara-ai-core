import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TelemetryProvider } from '../src/contexts/TelemetryContext.js';
import { ThemeProvider } from '../src/lib/theme.js';
import ActivityRoomPage from '../src/pages/activity/ActivityRoomPage.js';
import type { ActivityRecord } from '../src/pages/activity/activity-types.js';

const workflowRecord: ActivityRecord = {
  id: 'activity:evt-1:workflow',
  sequence: 1,
  timestamp: '2026-08-06T12:00:00.000Z',
  actor: { type: 'system', id: 'workflow-orchestrator', displayName: 'workflow-orchestrator', role: 'system' },
  kind: 'workflow',
  workflowId: 'wfo-1',
  previousState: 'draft',
  currentState: 'executing',
  reason: 'project phase changed',
  authoritative: true,
  observed: false,
  evidenceRefs: [],
};

const engineerMessage: ActivityRecord = {
  id: 'activity:evt-2:agent-message',
  sequence: 2,
  timestamp: '2026-08-06T12:00:01.000Z',
  actor: { type: 'agent', id: 'engineer', displayName: 'engineer', role: 'agent' },
  kind: 'agent-message',
  agentId: 'engineer',
  messageKind: 'message',
  content: 'Fixed the failing check',
  evidenceRefs: [],
};

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
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        records: [workflowRecord, engineerMessage],
        firstSequence: 1,
        lastSequence: 2,
        nextSequence: 3,
      }),
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Activity Room page', () => {
  it('renders the two-column layout with seeded activity and participants', async () => {
    renderRoom();
    expect(screen.getByText('Activity Room')).toBeTruthy();
    expect(screen.getByText('Participants')).toBeTruthy();

    await waitFor(() => expect(screen.getByText('project phase changed')).toBeTruthy());
    expect(screen.getByText('Fixed the failing check')).toBeTruthy();

    expect(screen.getByText('Engineer')).toBeTruthy();
    expect(screen.getByText('Planner')).toBeTruthy();
    expect(screen.getAllByText('All Agents').length).toBeGreaterThan(0);
  });

  it('filters the stream when an agent is selected', async () => {
    renderRoom();
    await waitFor(() => expect(screen.getByText('Fixed the failing check')).toBeTruthy());
    expect(screen.getByText('project phase changed')).toBeTruthy();

    fireEvent.click(screen.getByText('Engineer'));

    await waitFor(() => expect(screen.queryByText('project phase changed')).toBeNull());
    expect(screen.getByText('Fixed the failing check')).toBeTruthy();
    expect(screen.getByText(/filtered to one agent/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /All Agents/ }));
    await waitFor(() => expect(screen.getByText('project phase changed')).toBeTruthy());
  });

  it('pauses and resumes the live stream from the header', async () => {
    renderRoom();
    await waitFor(() => expect(screen.getByText('project phase changed')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getAllByText('Paused locally').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    await waitFor(() => expect(screen.getAllByText('Live').length).toBeGreaterThan(0));
  });
});
