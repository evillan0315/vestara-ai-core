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

function roughlyEqual(actual: { x: number; y: number; width: number; height: number } | null, expected: { x: number; y: number; width: number; height: number } | null, tolerance = 6): boolean {
  if (!actual || !expected) return false;
  return (
    Math.abs(actual.x - expected.x) <= tolerance &&
    Math.abs(actual.y - expected.y) <= tolerance &&
    Math.abs(actual.width - expected.width) <= tolerance &&
    Math.abs(actual.height - expected.height) <= tolerance
  );
}

test('VE-1: hover highlights the real boundary and click identifies the semantic component', async ({ page }) => {
  await page.addInitScript(() => {
    class FixtureWebSocket {
      static OPEN = 1;
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
  await page.route('**/api/visual-config**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ overrides: {} }) }));
  await page.route('**/api/activity-room**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ records: fixtureRecords, firstSequence: 1, lastSequence: 3, nextSequence: 4 }),
    });
  });

  await page.goto('/activity');
  await expect(page.getByText('Implementation is complete.')).toBeVisible();

  // Enter Visual Edit mode.
  await page.getByRole('button', { name: 'Visual Edit' }).click();

  // Hover the composer: highlight must bound the actual composer element.
  const composer = page.locator('[data-ve-name="Activity Composer"]');
  await composer.hover();
  await expect(page.getByTestId('ve-highlight')).toBeVisible();
  expect(roughlyEqual(await page.getByTestId('ve-highlight').boundingBox(), await composer.boundingBox())).toBe(true);

  // Hover an agent message: identifies Activity Message.
  const agentMessage = page.getByText('Implementation is complete.').locator('xpath=ancestor::*[@data-ve-target="message"]').first();
  await agentMessage.hover();
  await expect(page.getByTestId('ve-highlight')).toContainText('Activity Message');

  // Hover a human message: still Activity Message (right side).
  const humanMessage = page.getByText('Continue with verification.').locator('xpath=ancestor::*[@data-ve-target="message"]').first();
  await humanMessage.hover();
  await expect(page.getByTestId('ve-highlight')).toContainText('Activity Message');

  // Hover an organizational event: identifies Organizational Event, no bubble.
  const systemEvent = page.getByText('Verification completed').locator('xpath=ancestor::*[@data-ve-target="event"]').first();
  await systemEvent.hover();
  await expect(page.getByTestId('ve-highlight')).toContainText('Organizational Event');

  // Nested/ambiguous: hovering the Inspect action inside a message must resolve
  // to the message (the closest semantic target), not an inner control.
  await page.getByRole('button', { name: /^Inspect / }).first().hover();
  await expect(page.getByTestId('ve-highlight')).toContainText('Activity Message');

  // Click the composer: the selection panel identifies the semantic component.
  await composer.click();
  const panel = page.getByTestId('ve-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Activity Composer');
  await expect(panel).toContainText('Preview only');

  // Normal behavior preserved when Visual Edit is off.
  await page.getByRole('button', { name: 'Visual Edit: On' }).click();
  await composer.hover();
  await expect(page.getByTestId('ve-highlight')).toHaveCount(0);
  await expect(page.getByTestId('ve-panel')).toHaveCount(0);
});

test('VE-2: preview-only manipulation of the selected element (no source changes)', async ({ page }) => {
  await page.addInitScript(() => {
    class FixtureWebSocket {
      static OPEN = 1;
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
  await page.route('**/api/visual-config**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ overrides: {} }) }));
  await page.route('**/api/activity-room**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ records: fixtureRecords, firstSequence: 1, lastSequence: 3, nextSequence: 4 }),
    });
  });

  await page.goto('/activity');
  await expect(page.getByText('Implementation is complete.')).toBeVisible();

  // Enter Visual Edit and select the Developer (agent) message.
  await page.getByRole('button', { name: 'Visual Edit' }).click();
  const agentMessage = page.getByText('Implementation is complete.').locator('xpath=ancestor::*[@data-ve-target="message"]').first();
  await agentMessage.click();

  const panel = page.getByTestId('ve-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Activity Message');
  await expect(panel).toContainText('Preview only');

  // The agent message starts left-aligned via its class (self-start); inline
  // preview overrides it.
  const style = (): Promise<{ alignSelf: string; backgroundColor: string; className: string }> =>
    agentMessage.evaluate((el) => ({
      alignSelf: (el as HTMLElement).style.alignSelf,
      backgroundColor: (el as HTMLElement).style.backgroundColor,
      className: (el as HTMLElement).className,
    }));

  // Alignment preview.
  await panel.getByRole('button', { name: 'right' }).click();
  expect((await style()).alignSelf).toBe('flex-end');
  await panel.getByRole('button', { name: 'left' }).click();
  expect((await style()).alignSelf).toBe('flex-start');

  // Presentation preview (minimal removes the bubble).
  await panel.getByRole('button', { name: 'minimal' }).click();
  expect((await style()).backgroundColor).toBe('rgba(0, 0, 0, 0)');

  // Preview is runtime-only: the source class is untouched.
  expect((await style()).className).toContain('self-start');

  // Reset restores the original rendered state (inline styles cleared).
  await panel.getByRole('button', { name: 'Reset' }).click();
  const after = await style();
  expect(after.alignSelf).toBe('');
  expect(after.backgroundColor).toBe('');
  expect(after.className).toContain('self-start');
});

test('VE-3: visual manipulation produces an accurate, implementation-neutral Design Intent', async ({ page }) => {
  await page.addInitScript(() => {
    class FixtureWebSocket {
      static OPEN = 1;
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
  await page.route('**/api/visual-config**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ overrides: {} }) }));
  await page.route('**/api/activity-room**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ records: fixtureRecords, firstSequence: 1, lastSequence: 3, nextSequence: 4 }),
    });
  });

  await page.goto('/activity');
  await expect(page.getByText('Implementation is complete.')).toBeVisible();

  await page.getByRole('button', { name: 'Visual Edit' }).click();

  // Select the Developer message and apply operations: left, compact, minimal.
  const agentMessage = page.getByText('Implementation is complete.').locator('xpath=ancestor::*[@data-ve-target="message"]').first();
  await agentMessage.click();
  const panel = page.getByTestId('ve-panel');
  await expect(panel).toBeVisible();

  await panel.getByRole('button', { name: 'left' }).click();
  await panel.getByRole('button', { name: 'compact' }).click();
  await panel.getByRole('button', { name: 'minimal' }).click();

  // Inspect the generated Design Intent.
  await panel.getByRole('button', { name: 'View intent' }).click();
  const intent = page.getByTestId('ve-intent');
  await expect(intent).toBeVisible();
  await expect(intent).toContainText('Target: Activity Message');
  await expect(intent).toContainText('Instance: fixture-agent-message');
  await expect(intent).toContainText('alignment = left');
  await expect(intent).toContainText('density = compact');
  await expect(intent).toContainText('presentation = minimal');
  await expect(intent).toContainText('Scope: instance');
  await expect(intent).toContainText('Provenance: Director visual manipulation');
});

test('VE-4: Design Intent resolves to an Implementation Proposal (no source mutation)', async ({ page }) => {
  await page.addInitScript(() => {
    class FixtureWebSocket {
      static OPEN = 1;
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
  await page.route('**/api/visual-config**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ overrides: {} }) }));
  await page.route('**/api/activity-room**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ records: fixtureRecords, firstSequence: 1, lastSequence: 3, nextSequence: 4 }),
    });
  });

  await page.goto('/activity');
  await expect(page.getByText('Implementation is complete.')).toBeVisible();

  await page.getByRole('button', { name: 'Visual Edit' }).click();

  const agentMessage = page.getByText('Implementation is complete.').locator('xpath=ancestor::*[@data-ve-target="message"]').first();
  await agentMessage.click();
  const panel = page.getByTestId('ve-panel');
  await expect(panel).toBeVisible();

  await panel.getByRole('button', { name: 'right' }).click();
  await panel.getByRole('button', { name: 'compact' }).click();
  await panel.getByRole('button', { name: 'bubble' }).click();

  // Generate and inspect the implementation proposal.
  await panel.getByRole('button', { name: 'View proposal' }).click();
  const proposal = page.getByTestId('ve-proposal');
  await expect(proposal).toBeVisible();
  await expect(proposal).toContainText('Resolved target: ActivityItem (human/agent message variant)');
  await expect(proposal).toContainText('Affected source: apps/workspace/src/pages/activity/ActivityItem.tsx');
  await expect(proposal).toContainText('right aligned');
  await expect(proposal).toContainText('compact density');
  await expect(proposal).toContainText('bubble presentation');
  await expect(proposal).toContainText('Scope: instance');
  await expect(proposal).toContainText('Risk: Low');

  // Proposal is inspection-only: the message element's source class is untouched.
  const className = await agentMessage.evaluate((el) => (el as HTMLElement).className);
  expect(className).toContain('self-start');
});

test('VE-5: Apply crosses the write boundary through visual configuration, exactly scoped and reversible', async ({ page }) => {
  await page.addInitScript(() => {
    class FixtureWebSocket {
      static OPEN = 1;
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
  await page.route('**/api/visual-config**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ overrides: {} }) }));
  await page.route('**/api/activity-room**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ records: fixtureRecords, firstSequence: 1, lastSequence: 3, nextSequence: 4 }),
    });
  });

  await page.goto('/activity');
  await expect(page.getByText('Implementation is complete.')).toBeVisible();

  await page.getByRole('button', { name: 'Visual Edit' }).click();

  // Select the agent message and prepare an alignment change.
  const agentMessage = page.getByText('Implementation is complete.').locator('xpath=ancestor::*[@data-ve-target="message"]').first();
  await agentMessage.click();
  const panel = page.getByTestId('ve-panel');
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'right' }).click();

  // Apply crosses the write boundary through visual configuration.
  await panel.getByRole('button', { name: 'Apply' }).click();
  const applied = page.getByTestId('ve-applied');
  await expect(applied).toContainText('Saved and verified');

  // The running React UI reflects the configuration even after Visual Edit is off
  // (the write is config-driven, not a transient preview mutation).
  await page.getByRole('button', { name: 'Visual Edit: On' }).click();
  await expect(agentMessage).toHaveCSS('align-self', 'flex-end');
  // Source TSX is not rewritten — the class still declares the original variant.
  expect(await agentMessage.evaluate((el) => (el as HTMLElement).className)).toContain('self-start');

  // Undo restores the previous rendered state.
  await page.getByRole('button', { name: 'Visual Edit' }).click();
  await agentMessage.click();
  await expect(page.getByTestId('ve-panel')).toBeVisible();
  await page.getByTestId('ve-applied').getByRole('button', { name: 'Undo' }).click();
  await expect(agentMessage).toHaveCSS('align-self', 'flex-start');

  // Refusal: a component without an instance (the composer) cannot be applied
  // with instance scope — Vestara refuses rather than broadening the intent.
  await panel.getByRole('button', { name: 'Done' }).click();
  const composer = page.locator('[data-ve-name="Activity Composer"]');
  await composer.click();
  await panel.getByRole('button', { name: 'left' }).click();
  await panel.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByTestId('ve-refusal')).toContainText('Could not safely apply this change');
  await expect(page.getByTestId('ve-refusal')).toContainText('No changes were saved');
});

test('VE-6: the visual verifier independently proves the rendered result matches the intent', async ({ page }) => {
  await page.addInitScript(() => {
    class FixtureWebSocket {
      static OPEN = 1;
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
  await page.route('**/api/visual-config**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ overrides: {} }) }));
  await page.route('**/api/activity-room**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ records: fixtureRecords, firstSequence: 1, lastSequence: 3, nextSequence: 4 }),
    });
  });

  await page.goto('/activity');
  await expect(page.getByText('Implementation is complete.')).toBeVisible();

  await page.getByRole('button', { name: 'Visual Edit' }).click();
  const agentMessage = page.getByText('Implementation is complete.').locator('xpath=ancestor::*[@data-ve-target="message"]').first();
  await agentMessage.click();
  const panel = page.getByTestId('ve-panel');
  await panel.getByRole('button', { name: 'right' }).click();
  await panel.getByRole('button', { name: 'compact' }).click();
  await panel.getByRole('button', { name: 'minimal' }).click();
  await panel.getByRole('button', { name: 'Apply' }).click();

  // Verify: automatic after Apply — the ordinary path shows only "Saved and
  // verified"; the details disclose the verification internals.
  await page.getByTestId('ve-applied').getByRole('button', { name: 'View details' }).click();
  const verdict = page.getByTestId('ve-verdict');
  await expect(verdict).toBeVisible();
  await expect(verdict).toContainText('alignment: expected flex-end / observed flex-end · MATCH');
  await expect(verdict).toContainText('density: expected 2px / observed 2px · MATCH');
  await expect(verdict).toContainText('presentation: expected rgba(0, 0, 0, 0) / observed rgba(0, 0, 0, 0) · MATCH');
  await expect(verdict).toContainText('Changed matching instances: 1');
  await expect(verdict).toContainText('Unexpected changed instances: 0');
  await expect(verdict).toContainText('Message still inspectable (action present): ok');
  await expect(verdict).toContainText('Conclusion: VERIFIED');

  // Drift detection: if the rendered state diverges from the intent (e.g., a
  // manual override), a diagnostic re-verify reports PARTIAL — it does not
  // trust the config store.
  await agentMessage.evaluate((el) => ((el as HTMLElement).style.alignSelf = 'center'));
  await page.getByTestId('ve-verdict').getByRole('button', { name: /Re-verify/ }).click();
  await expect(page.getByTestId('ve-verdict')).toContainText('alignment: expected flex-end / observed center · PARTIAL');
  await expect(page.getByTestId('ve-verdict')).toContainText('Conclusion: PARTIAL');
});

test('VE milestone: the applied visual decision is durable across reload', async ({ page }) => {
  let persisted: Record<string, { alignment?: string; density?: string; presentation?: string }> = {};

  await page.addInitScript(() => {
    class FixtureWebSocket {
      static OPEN = 1;
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
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ records: fixtureRecords, firstSequence: 1, lastSequence: 3, nextSequence: 4 }),
    });
  });
  await page.route('**/api/visual-config', async (route) => {
    const request = route.request();
    if (request.method() === 'PUT') {
      persisted = (JSON.parse(request.postData() ?? '{}') as { overrides?: typeof persisted }).overrides ?? persisted;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ overrides: persisted }) });
  });

  await page.goto('/activity');
  await expect(page.getByText('Implementation is complete.')).toBeVisible();

  // Apply an alignment change (right) through Visual Edit.
  await page.getByRole('button', { name: 'Visual Edit' }).click();
  const agentMessage = page.getByText('Implementation is complete.').locator('xpath=ancestor::*[@data-ve-target="message"]').first();
  await agentMessage.click();
  const panel = page.getByTestId('ve-panel');
  await panel.getByRole('button', { name: 'right' }).click();
  const put = page.waitForResponse((response) => response.url().includes('/api/visual-config') && response.request().method() === 'PUT');
  await panel.getByRole('button', { name: 'Apply' }).click();
  await put;
  await expect(page.getByTestId('ve-applied')).toContainText('Saved and verified');
  expect(persisted['fixture-agent-message']?.alignment).toBe('right');

  // Reload: the durable representation, not transient DOM state, reconstructs
  // the visual decision. No Visual Edit interaction on the reloaded page.
  await page.reload();
  await expect(page.getByText('Implementation is complete.')).toBeVisible();
  await expect(agentMessage).toHaveCSS('align-self', 'flex-end');
});





