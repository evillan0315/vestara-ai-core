import { expect, test } from '@playwright/test';

const fixtureRecords = [
  {
    id: 'fixture-agent-message',
    sequence: 1,
    timestamp: '2026-08-09T08:00:00.000Z',
    actor: { type: 'agent', id: 'developer', displayName: 'Developer', role: 'developer' },
    kind: 'agent-message',
    agentId: 'developer',
    messageKind: 'message',
    content: 'Implementation is complete.',
    evidenceRefs: [],
  },
  {
    id: 'fixture-human-message',
    sequence: 2,
    timestamp: '2026-08-09T08:01:00.000Z',
    actor: { type: 'human', id: 'director', displayName: 'You', role: 'director' },
    kind: 'agent-message',
    agentId: 'developer',
    messageKind: 'message',
    content: 'Continue with verification.',
    effect: 'message',
    evidenceRefs: [],
  },
  {
    id: 'fixture-system-event',
    sequence: 3,
    timestamp: '2026-08-09T08:02:00.000Z',
    actor: { type: 'system', id: 'verifier', displayName: 'Verifier', role: 'verifier' },
    kind: 'verification',
    outcome: 'passed',
    checks: [{ name: 'tests', status: 'passed', summary: '21 tests passed' }],
    reason: 'Verification completed',
    evidenceRefs: [],
    effect: 'recognition',
  },
];

test('three semantic presentation modes are visually distinct', async ({ page }) => {
  // Keep this visual fixture deterministic: the real WebSocket would replay
  // the live durable store on top of the three records under test.
  await page.addInitScript(() => {
    class FixtureWebSocket {
      static OPEN = 1;
      static CONNECTING = 0;
      readyState = 0;
      onopen: (() => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      constructor() {
        queueMicrotask(() => {
          this.readyState = FixtureWebSocket.OPEN;
          this.onopen?.();
        });
      }
      send() {}
      close() {
        this.readyState = 3;
        this.onclose?.();
      }
    }
    window.WebSocket = FixtureWebSocket as unknown as typeof WebSocket;
  });
  await page.route('**/api/activity-room/state', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ computedAt: new Date().toISOString(), corrections: [], open: [], units: [], needsAttention: 0 }),
    });
  });
  await page.route('**/api/activity-room**', async (route) => {
    if (route.request().url().includes('/api/activity-room/state')) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ records: fixtureRecords, firstSequence: 1, lastSequence: 3, nextSequence: 4 }),
    });
  });

  await page.goto('/activity');

  await expect(page.getByText('Implementation is complete.')).toBeVisible();
  await expect(page.getByText('Continue with verification.')).toBeVisible();
  await expect(page.getByText('Verification completed')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible();

  const screenshotPath = 'tests/visual/.artifacts/activity-room/three-modes.png';
  await page.screenshot({ path: screenshotPath, fullPage: true });
});
