import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TelemetryProvider } from '../src/contexts/TelemetryContext.js';
import { useActivityStream } from '../src/hooks/useActivityStream.js';
import { ThemeProvider } from '../src/lib/theme.js';
import ActivityRoomPage from '../src/pages/activity/ActivityRoomPage.js';
import type { ActivityRecord } from '../src/pages/activity/activity-types.js';

let nextSequence = 1;

function record(id: string, content: string): ActivityRecord {
  const seq = nextSequence++;
  return {
    id,
    sequence: seq,
    timestamp: `2026-08-06T12:00:${String(seq).padStart(2, '0')}.000Z`,
    actor: { type: 'agent', id: 'engineer', displayName: 'engineer', role: 'agent' },
    kind: 'agent-message',
    agentId: 'engineer',
    messageKind: 'message',
    content,
    evidenceRefs: [],
  };
}

/** Mock socket that records instances so tests can emit appended frames. */
class MockWebSocket {
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  readyState = 0;
  constructor(_url: string) {
    mockSocketInstances.push(this);
    queueMicrotask(() => this.onopen?.());
  }
  send(_data: string): void {}
  close(): void {
    this.onclose?.();
  }
}

const mockSocketInstances: MockWebSocket[] = [];

function emitAppended(activity: ActivityRecord): void {
  for (const socket of mockSocketInstances) {
    socket.onmessage?.({ data: JSON.stringify({ type: 'activity.appended', activity }) });
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

function renderHarness() {
  function Harness() {
    const stream = useActivityStream();
    return (
      <div>
        <span data-testid="unread">{stream.unread}</span>
        <button type="button" onClick={() => stream.reportViewport(false)}>
          scrolled
        </button>
        <button type="button" onClick={() => stream.reportViewport(true)}>
          bottom
        </button>
        <button type="button" onClick={stream.clearUnread}>
          clear
        </button>
        <button type="button" onClick={stream.pause}>
          pause
        </button>
        <button type="button" onClick={stream.resume}>
          resume
        </button>
      </div>
    );
  }
  return render(
    <ThemeProvider>
      <TelemetryProvider>
        <Harness />
      </TelemetryProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  nextSequence = 1;
  mockSocketInstances.length = 0;
  vi.stubGlobal('WebSocket', MockWebSocket);
  fetchImpl = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      records: [record('activity:evt-1', 'seeded one')],
      firstSequence: 1,
      lastSequence: 1,
      nextSequence: 2,
    }),
  }));
  vi.stubGlobal('fetch', fetchImpl);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Activity hardening (AAR-001G)', () => {
  it('counts records that arrive while scrolled away and clears on return', async () => {
    renderHarness();
    await waitFor(() => expect(screen.getByTestId('unread').textContent).toBe('0'));

    // At bottom: an appended record is not unread.
    emitAppended(record('activity:live-1', 'live one'));
    await waitFor(() => expect(screen.getByTestId('unread').textContent).toBe('0'));

    // Scrolled up: appended records accumulate unread.
    fireEvent.click(screen.getByRole('button', { name: 'scrolled' }));
    emitAppended(record('activity:live-2', 'missed while away'));
    emitAppended(record('activity:live-3', 'missed again'));
    await waitFor(() => expect(screen.getByTestId('unread').textContent).toBe('2'));

    // Returning to the bottom clears unread.
    fireEvent.click(screen.getByRole('button', { name: 'bottom' }));
    await waitFor(() => expect(screen.getByTestId('unread').textContent).toBe('0'));
  });

  it('counts records buffered while paused and clears on resume', async () => {
    renderHarness();
    await waitFor(() => expect(screen.getByTestId('unread').textContent).toBe('0'));

    fireEvent.click(screen.getByRole('button', { name: 'pause' }));
    emitAppended(record('activity:paused-1', 'buffered one'));
    await waitFor(() => expect(screen.getByTestId('unread').textContent).toBe('1'));

    fireEvent.click(screen.getByRole('button', { name: 'resume' }));
    await waitFor(() => expect(screen.getByTestId('unread').textContent).toBe('0'));
  });

  it('bounds a large stream behind a "load older" pagination control', async () => {
    const many = Array.from({ length: 320 }, (_, index) => record(`activity:bulk-${index}`, `bulk ${index}`));
    // Mirror the server: the initial fetch is the LATEST bounded window
    // (seq 71–320), and beforeSequence returns the adjacent older page.
    fetchImpl?.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      const before = Number(new URL(url, 'http://x').searchParams.get('beforeSequence') ?? 0);
      const page = before ? many.filter((r) => r.sequence < before).slice(-250) : many.slice(-250);
      return {
        ok: true,
        json: async () => ({
          records: page,
          firstSequence: 1,
          lastSequence: many.length,
          nextSequence: many.length + 1,
        }),
      };
    });

    renderRoom();
    await waitFor(() => expect(screen.getByText(/^250 records$/)).toBeTruthy());

    // The newest record is rendered; older records are clipped behind the control.
    expect(screen.getByText('bulk 319')).toBeTruthy();
    expect(screen.queryByText('bulk 200')).toBeNull();
    expect(screen.getByText('Load older history')).toBeTruthy();

    fireEvent.click(screen.getByText('Load older history'));
    // The window widens upward so the previously clipped older page is reachable.
    await waitFor(() => expect(screen.getByText('bulk 200')).toBeTruthy());
    await waitFor(() => expect(screen.getByText(/^320 records$/)).toBeTruthy());
  }, 15000);
});
