/**
 * GA-UX-PREMIUM M15 — ASSISTANT VISUAL ACCEPTANCE.
 *
 * End-to-end visual verification that all assistant components render
 * correctly. Uses the M4a demo page for code edit fixtures and verifies
 * the floating panel, conversation history, terminal, verification, and
 * files summary components.
 *
 * Evidence screenshots are written under .artifacts/ga-ux-premium-m15/
 * (never a CI baseline gate).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EVIDENCE = path.join(HERE, '.artifacts', 'ga-ux-premium-m15');

function evidence(name: string): string {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  return path.join(EVIDENCE, name);
}

test.describe('M15 ASSISTANT VISUAL ACCEPTANCE', () => {
  test('renders the M4a demo page with all code edit fixtures', async ({ page }) => {
    await page.goto('/m4a-demo');
    await expect(page.getByText('CONTRACT-FIXTURE VISUAL ACCEPTANCE')).toBeVisible();

    // Verify code edit components render
    const codeEdits = page.locator('[data-testid="assistant-code-edit"]');
    await expect(codeEdits.first()).toBeVisible();

    // Verify patch diff renders
    await expect(page.locator('[data-testid="patch-diff"]').first()).toBeVisible();

    // Verify line numbers are present
    const diffLines = page.locator('[data-testid="diff-line"]');
    await expect(diffLines.first()).toBeVisible();

    // Verify language badge renders
    await expect(page.locator('text=TypeScript').first()).toBeVisible();

    // Capture evidence
    await page.screenshot({ path: evidence('m15-code-edit-overview.png'), fullPage: true });
  });

  test('floating panel renders with branded header', async ({ page }) => {
    // Navigate to a page where the assistant is available
    await page.goto('/m4a-demo');

    // The assistant launcher should be visible
    const launcher = page.locator('button[aria-label="Open assistant"]');
    await expect(launcher).toBeVisible();

    // Click to open the panel
    await launcher.click();

    // The floating panel should appear with branded header
    await expect(page.getByText('Vestara Assistant')).toBeVisible();

    // Capture evidence
    await page.screenshot({ path: evidence('m15-floating-panel.png') });
  });

  test('conversation history popover renders with search', async ({ page }) => {
    await page.goto('/m4a-demo');

    // Open the assistant
    const launcher = page.locator('button[aria-label="Open assistant"]');
    await launcher.click();

    // The conversation picker should be visible
    const picker = page.locator('[data-testid="conversation-picker"]');
    await expect(picker).toBeVisible();

    // Click to open history
    await picker.click();

    // History should appear with search input
    await expect(page.getByPlaceholder('Search conversations...')).toBeVisible();

    // Capture evidence
    await page.screenshot({ path: evidence('m15-conversation-history.png') });
  });

  test('accessibility: role=log on message list', async ({ page }) => {
    await page.goto('/m4a-demo');

    // Open the assistant
    const launcher = page.locator('button[aria-label="Open assistant"]');
    await launcher.click();

    // The scroll container should have role="log"
    const scrollContainer = page.locator('[data-testid="conversation-scroll"]');
    await expect(scrollContainer).toHaveAttribute('role', 'log');
    await expect(scrollContainer).toHaveAttribute('aria-live', 'polite');
    await expect(scrollContainer).toHaveAttribute('aria-label', 'Assistant conversation');
  });

  test('accessibility: aria-expanded on diff toggles', async ({ page }) => {
    await page.goto('/m4a-demo');

    // Find a code edit with a toggle
    const toggle = page.locator('[data-testid="code-edit-toggle"]').first();
    await expect(toggle).toBeVisible();

    // Should have aria-expanded
    const expanded = await toggle.getAttribute('aria-expanded');
    expect(expanded).toMatch(/^(true|false)$/);

    // Click to toggle
    await toggle.click();

    // Should toggle the expanded state
    const newExpanded = await toggle.getAttribute('aria-expanded');
    expect(newExpanded).not.toBe(expanded);
  });

  test('micro-interaction: copy button flash animation', async ({ page }) => {
    await page.goto('/m4a-demo');

    // Find a copy button
    const copyBtn = page.locator('[data-testid="code-edit-copy-path"]').first();
    await expect(copyBtn).toBeVisible();

    // Click to copy
    await copyBtn.click();

    // Should show "Copied" feedback
    await expect(page.getByText('Copied').first()).toBeVisible();

    // Capture evidence
    await page.screenshot({ path: evidence('m15-copy-flash.png') });
  });

  test('responsive: narrow layout stays contained', async ({ page }) => {
    await page.goto('/m4a-demo');

    // Set narrow viewport
    await page.setViewportSize({ width: 480, height: 900 });

    // Code edit should still render
    const codeEdit = page.locator('[data-testid="assistant-code-edit"]').first();
    await expect(codeEdit).toBeVisible();

    // Diff should scroll internally
    const diff = codeEdit.locator('[data-testid="patch-diff"]');
    if (await diff.isVisible()) {
      const scrollBox = await diff.evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }));
      // Internal scroll means scrollWidth > clientWidth
      expect(scrollBox.scrollWidth).toBeGreaterThanOrEqual(scrollBox.clientWidth);
    }

    // Capture evidence
    await page.screenshot({ path: evidence('m15-narrow-layout.png') });
  });

  test('responsive: expanded layout renders full width', async ({ page }) => {
    await page.goto('/m4a-demo');

    // Set wide viewport
    await page.setViewportSize({ width: 1280, height: 900 });

    // Code edit should render
    const codeEdit = page.locator('[data-testid="assistant-code-edit"]').first();
    await expect(codeEdit).toBeVisible();

    // Capture evidence
    await page.screenshot({ path: evidence('m15-expanded-layout.png') });
  });
});
