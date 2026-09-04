/**
 * GA-UX-PREMIUM M4A — CONTRACT-FIXTURE VISUAL ACCEPTANCE.
 *
 * Deterministic fixture evidence for AssistantCodeEdit (patch / hunks /
 * unavailable representations, lifecycle, truncation, narrow + expanded
 * widths). This is NOT live OpenCode diff evidence — the fixtures are built
 * from the authoritative assistant.execution.v1 contract while live diff
 * acceptance is deferred to M4B. Evidence screenshots are written under
 * .artifacts/ga-ux-premium-m4a/ (never a CI baseline gate).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EVIDENCE = path.join(HERE, '.artifacts', 'ga-ux-premium-m4a');

function evidence(name: string): string {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  return path.join(EVIDENCE, name);
}

test.describe('M4A CONTRACT-FIXTURE VISUAL ACCEPTANCE', () => {
  test('renders the deterministic fixture matrix and captures evidence', async ({ page }) => {
    await page.goto('/m4a-demo');
    await expect(page.getByText('CONTRACT-FIXTURE VISUAL ACCEPTANCE')).toBeVisible();

    // Patch representation: small patch renders its diff verbatim.
    const smallPatch = page.locator('[data-testid="assistant-code-edit"]').filter({ hasText: 'ConversationPanel.tsx' }).first();
    await expect(smallPatch.getByTestId('patch-diff')).toBeVisible();
    await expect(smallPatch.getByTestId('patch-diff')).toContainText('return conversation.title ?? fallback');
    await expect(smallPatch.getByTestId('code-edit-counts')).toContainText('+5');
    await expect(smallPatch.getByTestId('code-edit-counts')).toContainText('-4');

    // Large patch defaults collapsed (deterministic rule).
    const large = page.locator('[data-testid="assistant-code-edit"]').filter({ hasText: '+30' }).first();
    await expect(large.getByTestId('code-edit-toggle')).toHaveAttribute('aria-expanded', 'false');
    await large.getByTestId('code-edit-toggle').click();
    await expect(large.getByTestId('patch-diff')).toBeVisible();

    // Added / Deleted file operations.
    await expect(page.locator('[data-testid="assistant-code-edit"]').filter({ hasText: 'packages/feature/src/index.ts' }).first()).toContainText('Added');
    await expect(page.locator('[data-testid="assistant-code-edit"]').filter({ hasText: 'packages/legacy/src/gone.ts' }).first()).toContainText('Deleted');

    // Truncated patch surfaces the warning.
    await expect(page.getByTestId('code-edit-truncated').first()).toContainText('Diff preview truncated');

    // Unavailable diff shows the restrained marker, no fake diff.
    const unavailable = page.locator('[data-testid="assistant-code-edit"]').filter({ hasText: 'Diff unavailable' }).first();
    await expect(unavailable.getByTestId('code-edit-unavailable')).toContainText('Diff unavailable');
    await expect(unavailable.getByTestId('patch-diff')).toHaveCount(0);

    // Structured hunks representation.
    const hunks = page.locator('[data-testid="assistant-code-edit"]').filter({ hasText: 'useThing.ts' }).first();
    await expect(hunks.getByTestId('hunk-diff')).toBeVisible();
    await expect(hunks.getByTestId('hunk-diff')).toContainText('@@ -10,4 +10,5 @@');

    await page.screenshot({ path: evidence('m4a-fixture-matrix.png'), fullPage: true });

    // Narrow containment (internal scroll, panel never widened).
    await page.setViewportSize({ width: 480, height: 900 });
    const narrow = page.locator('[data-testid="assistant-code-edit"]').filter({ hasText: 'aVeryLongIdentifierThatWouldForceThePanel' }).first();
    await expect(narrow.getByTestId('patch-diff')).toBeVisible();
    const scrollBox = await narrow.getByTestId('patch-diff').evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    expect(scrollBox.scrollWidth).toBeGreaterThan(scrollBox.clientWidth);
    await page.screenshot({ path: evidence('m4a-narrow-containment.png') });

    // Expanded width.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: evidence('m4a-expanded-width.png') });
  });
});