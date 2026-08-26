import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
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

beforeEach(() => {
  nextSequence = 1;
  vi.stubGlobal('WebSocket', MockWebSocket);
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/activity-room') && !url.includes('/state')) {
      const many = Array.from({ length: 320 }, (_, index) => record(`activity:bulk-${index}`, `bulk ${index}`));
      const before = Number(new URL(url, 'http://x').searchParams.get('beforeSequence') ?? 0);
      const page = before ? many.filter((r) => r.sequence < before).slice(-250) : many.slice(-250);
      return { ok: true, json: async () => ({ records: page, firstSequence: 1, lastSequence: many.length, nextSequence: many.length + 1 }) };
    }
    return { ok: true, json: async () => ({ records: [], firstSequence: 1, lastSequence: 0, nextSequence: 1 }) };
  });
  vi.stubGlobal('fetch', fetchMock);
});

it('probe', async () => {
  render(
    <ThemeProvider><TelemetryProvider><ActivityRoomPage /></TelemetryProvider></ThemeProvider>,
  );
  await new Promise((r) => setTimeout(r, 3000));
  const body = document.body.textContent ?? '';
  console.log('HAS 250 records:', body.includes('250 records'));
  console.log('HAS bulk 319:', body.includes('bulk 319'));
  console.log('HAS Load older:', body.includes('Load older history'));
  console.log('RECORD COUNT LINE:', body.match(/\d+ records/g));
  console.log('SNIPPET:', body.slice(0, 400));
}, 60000);
