import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TelemetryProvider } from '../src/contexts/TelemetryContext.js';
import { ThemeProvider } from '../src/lib/theme.js';
import ActivityRoomPage from '../src/pages/activity/ActivityRoomPage.js';
import type { ActivityRecord } from '../src/pages/activity/activity-types.js';

let nextSequence = 1;
function record(id: string, content: string): ActivityRecord {
  const seq = nextSequence++;
  return {
    id, sequence: seq, timestamp: `2026-08-06T12:00:${String(seq).padStart(2, '0')}.000Z`,
    actor: { type: 'agent', id: 'engineer', displayName: 'engineer', role: 'agent' },
    kind: 'agent-message', agentId: 'engineer', messageKind: 'message', content, evidenceRefs: [],
  };
}
class MockWebSocket {
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  readyState = 0;
  constructor(_url: string) { queueMicrotask(() => this.onopen?.()); }
  send(_data: string): void {}
  close(): void { this.onclose?.(); }
}
let fetchImpl: ReturnType<typeof vi.fn> | undefined;
function renderRoom() {
  return render(<ThemeProvider><TelemetryProvider><ActivityRoomPage /></TelemetryProvider></ThemeProvider>);
}

beforeEach(() => {
  nextSequence = 1;
  vi.stubGlobal('WebSocket', MockWebSocket);
  fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ records: [record('activity:evt-1', 'seeded one')], firstSequence: 1, lastSequence: 1, nextSequence: 2 }) }));
  vi.stubGlobal('fetch', fetchImpl);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('probe hardening', async () => {
  const many = Array.from({ length: 320 }, (_, index) => record(`activity:bulk-${index}`, `bulk ${index}`));
  fetchImpl?.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    const before = Number(new URL(url, 'http://x').searchParams.get('beforeSequence') ?? 0);
    const page = before ? many.filter((r) => r.sequence < before).slice(-250) : many.slice(-250);
    return { ok: true, json: async () => ({ records: page, firstSequence: 1, lastSequence: many.length, nextSequence: many.length + 1 }) };
  });
  renderRoom();
  await waitFor(() => expect(screen.getByText(/^250 records$/)).toBeTruthy(), { timeout: 8000 });
  console.log('STEP1 done: 250 records');
  expect(screen.getByText('bulk 319')).toBeTruthy();
  console.log('STEP2 done: bulk 319');
  expect(screen.queryByText('bulk 200')).toBeNull();
  console.log('STEP3 done: bulk 200 null');
  expect(screen.getByText('Load older history')).toBeTruthy();
  console.log('STEP4 done: load older');
  fireEvent.click(screen.getByText('Load older history'));
  console.log('STEP5 clicked');
  await waitFor(() => expect(screen.getByText('bulk 200')).toBeTruthy(), { timeout: 8000 });
  console.log('STEP6 done: bulk 200');
  await waitFor(() => expect(screen.getByText(/^320 records$/)).toBeTruthy(), { timeout: 8000 });
  console.log('STEP7 done: 320 records');
}, 60000);
