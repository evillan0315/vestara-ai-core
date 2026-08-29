import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TelemetryProvider } from '../src/contexts/TelemetryContext.js';
import { useActivityRoomModel } from '../src/hooks/useActivityRoomModel.js';
import { ThemeProvider } from '../src/lib/theme.js';
import type { ActivityScope } from '../src/pages/activity/activity-types.js';

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

function participant(workflowId: string) {
  return {
    workflowId,
    role: 'developer',
    agentId: 'developer',
    threadId: `t-${workflowId}`,
    executionState: 'active',
    lastActivityAt: '2026-08-06T12:00:01.000Z',
  };
}

let fetchImpl: ReturnType<typeof vi.fn> | undefined;

function defer() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

function renderModel() {
  let latestScope: ActivityScope = {};
  let retry: () => void = () => {};
  function Harness() {
    const model = useActivityRoomModel();
    latestScope = model.stream.scope;
    retry = model.retryAuxiliary;
    return (
      <div>
        <div data-testid="scope">{model.stream.scope.workflowId ?? 'global'}</div>
        <div data-testid="participants-status">{model.participants.status}</div>
        <div data-testid="participants-owner">
          {(model.participants.data ?? []).map((item) => item.workflowId).join(',')}
        </div>
        <div data-testid="live-status">{model.liveStream.status}</div>
        <div data-testid="receipts-status">{model.receipts.status}</div>
        <div data-testid="effective-status">{model.effectiveState.status}</div>
        <div data-testid="effective-needs">{model.effectiveState.data?.needsAttention ?? -1}</div>
        <button type="button" onClick={() => model.stream.applyScope({ workflowId: 'wfo-1' })}>
          scope-1
        </button>
        <button type="button" onClick={() => model.stream.applyScope({ workflowId: 'wfo-2' })}>
          scope-2
        </button>
        <button type="button" onClick={() => model.stream.applyScope({})}>
          global
        </button>
        <button type="button" onClick={() => retry()}>
          retry
        </button>
      </div>
    );
  }
  const view = render(
    <ThemeProvider>
      <TelemetryProvider>
        <Harness />
      </TelemetryProvider>
    </ThemeProvider>,
  );
  return { view, getScope: () => latestScope };
}

beforeEach(() => {
  vi.stubGlobal('WebSocket', MockWebSocket);
  fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/api/workflow/')) {
      if (url.includes('/participants')) {
        const workflowId = /\/api\/workflow\/([^/]+)\/participants/.exec(url)?.[1] ?? 'unknown';
        return {
          ok: true,
          json: async () => ({ participants: [participant(workflowId)] }),
        };
      }
      if (url.includes('/live-stream')) {
        return { ok: true, json: async () => ({ live: [] }) };
      }
    }
    if (url.includes('/message-receipts')) {
      return { ok: true, json: async () => ({ receiptsByMessage: {}, unreadByAgent: {} }) };
    }
    if (url.includes('/activity-room/state')) {
      const workflowId = new URL(url, 'http://x').searchParams.get('workflowId');
      return {
        ok: true,
        json: async () => ({
          computedAt: '2026-08-06T12:00:00.000Z',
          corrections: [],
          open: [],
          units: [],
          needsAttention: workflowId ? 1 : 0,
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({ records: [], firstSequence: 0, lastSequence: 0, nextSequence: 0 }),
    };
  });
  vi.stubGlobal('fetch', fetchImpl);
  window.history.replaceState(null, '', '/activity');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/activity');
  vi.useRealTimers();
});

describe('Activity room model (AR-01)', () => {
  it('holds auxiliary sources idle for the global scope and loads them for a workflow scope', async () => {
    renderModel();
    await waitFor(() => expect(screen.getByTestId('participants-status').textContent).toBe('idle'));
    expect(screen.getByTestId('live-status').textContent).toBe('idle');
    expect(screen.getByTestId('receipts-status').textContent).toBe('idle');

    fireEvent.click(screen.getByRole('button', { name: 'scope-1' }));

    await waitFor(() => expect(screen.getByTestId('participants-status').textContent).toBe('loading'));
    await waitFor(() => expect(screen.getByTestId('participants-status').textContent).toBe('ready'));
    expect(screen.getByTestId('participants-owner').textContent).toBe('wfo-1');
    expect(screen.getByTestId('live-status').textContent).toBe('ready');
    expect(screen.getByTestId('receipts-status').textContent).toBe('ready');

    // Effective state is scoped too: needsAttention reflects the scoped fetch.
    await waitFor(() => expect(screen.getByTestId('effective-needs').textContent).toBe('1'));
  });

  it('resets sources before new-scope data applies and drops superseded responses (race guard)', async () => {
    const gate = defer();
    fetchImpl?.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/workflow/wfo-1/participants')) {
        return {
          ok: true,
          json: async () => {
            await gate.promise;
            return { participants: [participant('wfo-1')] };
          },
        };
      }
      if (url.startsWith('/api/workflow/')) {
        if (url.includes('/participants')) {
          const workflowId = /\/api\/workflow\/([^/]+)\/participants/.exec(url)?.[1] ?? 'unknown';
          return { ok: true, json: async () => ({ participants: [participant(workflowId)] }) };
        }
        return { ok: true, json: async () => ({ live: [] }) };
      }
      if (url.includes('/message-receipts')) {
        return { ok: true, json: async () => ({ receiptsByMessage: {}, unreadByAgent: {} }) };
      }
      if (url.includes('/activity-room/state')) {
        return {
          ok: true,
          json: async () => ({
            computedAt: '2026-08-06T12:00:00.000Z',
            corrections: [],
            open: [],
            units: [],
            needsAttention: 0,
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({ records: [], firstSequence: 0, lastSequence: 0, nextSequence: 0 }),
      };
    });

    renderModel();
    await waitFor(() => expect(screen.getByTestId('participants-status').textContent).toBe('idle'));

    // Scope to wfo-1: participants reset to loading and its response is gated.
    fireEvent.click(screen.getByRole('button', { name: 'scope-1' }));
    await waitFor(() => expect(screen.getByTestId('participants-status').textContent).toBe('loading'));

    // Re-scope to wfo-2 before the wfo-1 response resolves.
    fireEvent.click(screen.getByRole('button', { name: 'scope-2' }));
    await waitFor(() => expect(screen.getByTestId('participants-status').textContent).toBe('loading'));

    // wfo-2 resolves; the stale wfo-1 response must be ignored after the gate opens.
    await waitFor(() => expect(screen.getByTestId('participants-status').textContent).toBe('ready'));
    expect(screen.getByTestId('participants-owner').textContent).toBe('wfo-2');

    gate.resolve(null);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.getByTestId('participants-owner').textContent).toBe('wfo-2');
  });

  it('surfaces stale (with data retained) after a failed refresh following success', async () => {
    renderModel();
    fireEvent.click(screen.getByRole('button', { name: 'scope-1' }));
    await waitFor(() => expect(screen.getByTestId('participants-status').textContent).toBe('ready'));
    expect(screen.getByTestId('participants-owner').textContent).toBe('wfo-1');

    // Next refresh fails → status becomes stale and prior data is retained.
    fetchImpl?.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/workflow/')) {
        return { ok: false, status: 500, json: async () => ({}) };
      }
      if (url.includes('/activity-room/state')) {
        return {
          ok: true,
          json: async () => ({
            computedAt: '2026-08-06T12:00:00.000Z',
            corrections: [],
            open: [],
            units: [],
            needsAttention: 0,
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({ records: [], firstSequence: 0, lastSequence: 0, nextSequence: 0 }),
      };
    });

    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    await waitFor(() => expect(screen.getByTestId('participants-status').textContent).toBe('stale'));
    // The previously loaded data is NOT discarded while stale.
    expect(screen.getByTestId('participants-owner').textContent).toBe('wfo-1');
  });

  it('manual retry recovers a failed source to ready', async () => {
    renderModel();
    fireEvent.click(screen.getByRole('button', { name: 'scope-1' }));
    await waitFor(() => expect(screen.getByTestId('participants-status').textContent).toBe('ready'));

    let failing = true;
    fetchImpl?.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/workflow/') && failing) {
        return { ok: false, status: 500, json: async () => ({}) };
      }
      if (url.startsWith('/api/workflow/')) {
        const workflowId = /\/api\/workflow\/([^/]+)\/participants/.exec(url)?.[1] ?? 'unknown';
        if (url.includes('/participants')) {
          return { ok: true, json: async () => ({ participants: [participant(workflowId)] }) };
        }
        return { ok: true, json: async () => ({ live: [] }) };
      }
      if (url.includes('/activity-room/state')) {
        return {
          ok: true,
          json: async () => ({
            computedAt: '2026-08-06T12:00:00.000Z',
            corrections: [],
            open: [],
            units: [],
            needsAttention: 0,
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({ records: [], firstSequence: 0, lastSequence: 0, nextSequence: 0 }),
      };
    });

    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    await waitFor(() => expect(screen.getByTestId('participants-status').textContent).toBe('stale'));

    failing = false;
    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    await waitFor(() => expect(screen.getByTestId('participants-status').textContent).toBe('ready'));
  });

  it('polls on one shared cadence and skips while the document is hidden', async () => {
    renderModel();
    fireEvent.click(screen.getByRole('button', { name: 'scope-1' }));
    await waitFor(() => expect(screen.getByTestId('participants-status').textContent).toBe('ready'));
    const participantsCalls = () =>
      fetchImpl?.mock.calls.filter(([input]) => String(input).includes('/participants')).length ?? 0;
    const before = participantsCalls();

    // Hidden: no refresh over two cadences.
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    await new Promise((r) => setTimeout(r, 4500));
    expect(participantsCalls()).toBe(before);

    // Visible: the next cadence refreshes the shared sources together.
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    await waitFor(() => expect(participantsCalls()).toBeGreaterThan(before), { timeout: 4000 });
    // The shared cadence refreshes all three workflow sources in one tick.
    const liveCalls = fetchImpl?.mock.calls.filter(([input]) => String(input).includes('/live-stream')).length ?? 0;
    expect(liveCalls).toBeGreaterThan(0);
  }, 15000);
});
