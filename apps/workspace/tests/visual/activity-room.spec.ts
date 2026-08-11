/**
 * Activity Room E2E + visual evidence (AAR-001H).
 *
 * Runs against the live Workspace (vite dev on 5173, proxying /api and /ws to
 * the API on 3001). Covers the behavioral surface: render, message send with
 * optimistic state, detail modal, scoping, API→WS→UI liveness, and reload
 * persistence — plus semantic a11y assertions and screenshot evidence.
 *
 * Evidence captures are written under .artifacts/activity-room/.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EVIDENCE = path.join(HERE, '.artifacts', 'activity-room');
const UNIQUE = `e2e-probe-${Date.now()}`;

function evidence(name: string): string {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  return path.join(EVIDENCE, name);
}

test.describe('Activity Room E2E (AAR-001H)', () => {
  test('renders, messages, inspects, scopes, stays live, and survives reload', async ({ page, request }) => {
    // ─── Render + a11y semantics ───────────────────────────────
    await page.goto('/activity');
    await expect(page.getByRole('heading', { name: 'Activity Room' })).toBeVisible();
    await expect(page.getByText('Participants')).toBeVisible();
    await expect(page.getByRole('log', { name: 'Activity stream' })).toBeVisible();
    await expect(page.getByLabel('Message composer')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'All activity' })).toBeVisible();

    // ─── Effective state (Direction 2): "what is true now" at a glance ────
    await expect(page.getByText('Effective state')).toBeVisible();
    await expect(page.getByText('derived from history')).toBeVisible();
    // The collapsed summary shows the positive "nothing needs you" state.
    await expect(page.getByText('Nothing needs your attention')).toBeVisible();
    // Expanding reveals the readable correction (no record ids).
    await page.getByRole('button', { name: /Effective state/ }).click();
    await expect(page.getByText(/Corrected:/)).toBeVisible();
    await expect(page.getByText(/Corrected:/).locator('..')).toContainText('Developer reports implementation complete');
    await page.locator('main').nth(1).screenshot({ path: evidence('00-effective-state.png') });

    // ─── API → WS → UI liveness (workflow E2E integration) ─────
    // A workflow-scoped record posted to the API must arrive over the
    // WebSocket and feed the scope selector without a reload.
    const workflowId = `wfo-${UNIQUE}`;
    const liveProbe = `live-${UNIQUE}`;
    const res = await request.post('/api/messages', {
      data: { content: liveProbe, workflowId, targets: [{ type: 'all-agents' }] },
    });
    expect(res.ok()).toBeTruthy();
    await expect(page.getByText(liveProbe).first()).toBeVisible({ timeout: 10_000 });

    // ─── Scoping ────────────────────────────────────────────────
    const workflowSelect = page.getByLabel('Scope to workflow');
    await expect(workflowSelect).toBeVisible();
    await workflowSelect.selectOption(workflowId);
    await expect(page.getByText(new RegExp(`workflow ${workflowId}`))).toBeVisible();
    await page.screenshot({ path: evidence('01-scoped.png') });
    await page.getByRole('button', { name: 'All activity' }).click();
    await expect(page.getByText('All activity')).toBeVisible();

    // ─── Layout: the room fits the viewport; composer stays visible; only the
    // stream scrolls (no page-level scrollbar for normal use).
    await expect(page.getByLabel('Message composer')).toBeInViewport();
    const outerOverflow = await page.evaluate(() => {
      const main = document.querySelector('main.overflow-auto');
      return main ? main.scrollHeight - main.clientHeight : -1;
    });
    expect(outerOverflow).toBeLessThanOrEqual(0);

    // ─── Human messaging (optimistic → server) ─────────────────
    const composer = page.getByLabel('Message composer');
    const messageText = `AAR-001H ${UNIQUE} to all agents`;
    await composer.fill(messageText);
    await composer.press('Enter');
    await expect(page.getByText(messageText).first()).toBeVisible();
    // The optimistic record is replaced by the server record (send state clears).
    await expect(page.getByText('Sending…')).toBeHidden({ timeout: 10_000 });
    await page.screenshot({ path: evidence('02-after-send.png'), fullPage: true });

    // ─── Detail modal + progressive disclosure ──────────────────
    await page.getByRole('button', { name: /^Inspect / }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // The human-readable summary is shown first; technical details are
    // collapsed behind the disclosure control.
    await expect(dialog.getByText('Technical details')).toBeVisible();
    await dialog.getByText('Technical details').click();
    await expect(dialog.getByText('Raw payload')).toBeVisible();
    await page.screenshot({ path: evidence('03-detail-modal.png') });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // ─── Reload persistence ─────────────────────────────────────
    await page.reload();
    await expect(page.getByText(liveProbe).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(messageText).first()).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: evidence('04-after-reload.png') });
  });
});
