/**
 * Files page end-to-end suite — REAL API + REAL UI, no mocks.
 *
 * Prerequisites: API on :3001 and workspace UI on :5173 (see
 * playwright.e2e.config.ts). Auth is a real username login (editor role).
 * All mutations target timestamped scratch files at the workspace root and
 * are deleted afterwards, so the repo is left untouched.
 */

import { expect, test, type Page } from '@playwright/test';

const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:3001';

async function apiToken(username: string): Promise<string> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status}`);
  const data = (await res.json()) as { user: { token: string } };
  return data.user.token;
}

async function apiFetch(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init?.headers },
  });
  return res;
}

test.describe('Files page', () => {
  let errors: string[];
  let pageErrors: string[];
  let scratchName = '';

  test.beforeEach(async ({ page }) => {
    errors = [];
    pageErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    // Real login through the UI.
    await page.goto('/login');
    await page.getByLabel('USERNAME').fill(`e2e-files-${Date.now()}`);
    await page.getByRole('button', { name: 'Continue → Desktop' }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
  });

  test.afterEach(async ({ page }) => {
    // Best-effort scratch cleanup: deletes are approval-gated (402 +
    // approvalId), so replay the two-step approve flow through the API.
    if (scratchName) {
      try {
        const token = await page.evaluate(() => window.localStorage.getItem('vestara-auth-token') ?? '');
        if (token) {
          const del = await apiFetch('/api/files/delete', token, {
            method: 'POST',
            body: JSON.stringify({ path: scratchName }),
          });
          if (del.status === 402) {
            const { approvalId } = (await del.json()) as { approvalId: string };
            await apiFetch(`/api/files/approvals/${approvalId}/approve`, token, { method: 'POST', body: '{}' });
            await apiFetch('/api/files/delete', token, {
              method: 'POST',
              body: JSON.stringify({ path: scratchName, approvalId }),
            });
          }
        }
      } catch {
        // UI assertions already cover deletion; cleanup is best-effort.
      }
      scratchName = '';
    }
    expect(pageErrors, `page errors: ${pageErrors.join('\n')}`).toEqual([]);
    expect(errors, `console errors: ${errors.join('\n')}`).toEqual([]);
  });

  async function openFiles(page: Page) {
    await page.goto('/files');
    await expect(page.getByRole('heading', { name: 'Files' })).toBeAttached();
    await expect(page.getByRole('tree', { name: 'Repository tree' })).toBeVisible();
    // The app shell polls /api/agents|settings|health on boot without a
    // session (pre-existing behavior, unrelated to Files). Scope the error
    // gate to the authenticated Files phase.
    errors = [];
    pageErrors = [];
  }

  test('shell renders: header, browser, mode tabs, inspector', async ({ page }) => {
    await openFiles(page);

    // Compact header.
    await expect(page.getByText('WORKSPACE', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Search files \(Command K\)/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Workspace storage statistics' })).toBeVisible();

    // Browser panel chrome.
    await expect(page.getByText('FILE BROWSER', { exact: true })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Filter by type' })).toBeVisible();
    await expect(page.getByLabel('Filter in browser')).toBeVisible();

    // Tree has real rows (scoped to the browser rail).
    const rows = page.getByLabel('File browser panel').locator('[data-row-index]');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(5);

    // Mode tabs + inspector rail.
    await expect(page.getByRole('tablist', { name: 'Work area modes' })).toBeVisible();
    await expect(page.getByLabel('File inspector panel')).toBeVisible();
  });

  test('tree filter narrows rows and expand reveals children', async ({ page }) => {
    await openFiles(page);
    const panel = page.getByLabel('File browser panel');

    const filter = page.getByLabel('Filter in browser');
    await filter.fill('AGENTS.md');
    const rows = panel.locator('[data-row-index]');
    await expect(panel.locator('button[title="AGENTS.md"]')).toBeVisible();
    await expect(panel.locator('button[title="README.md"]')).toBeHidden();

    await filter.fill('');
    const before = await rows.count();
    // Expand the first collapsed directory row.
    const firstDir = rows.locator('button').filter({ hasText: /▸/ }).first();
    if (await firstDir.count()) {
      await firstDir.click();
      await expect.poll(async () => rows.count()).toBeGreaterThan(before);
    }
  });

  test('open file in editor with status footer', async ({ page }) => {
    await openFiles(page);

    await page.getByLabel('Filter in browser').fill('AGENTS.md');
    await page.getByLabel('File browser panel').locator('button[title="AGENTS.md"]').first().click();

    // Editor mode with Monaco + cursor footer.
    await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Ln 1, Col 1/)).toBeVisible();
  });

  test('quick-open palette opens files and closes on Escape', async ({ page }) => {
    await openFiles(page);

    await page.keyboard.press('ControlOrMeta+k');
    const palette = page.getByRole('dialog', { name: 'Quick open files' });
    await expect(palette).toBeVisible();
    await palette.getByLabel('Search files by name or path').fill('AGENTS.md');
    await page.keyboard.press('Enter');
    await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 30_000 });

    await page.keyboard.press('ControlOrMeta+k');
    await expect(page.getByRole('dialog', { name: 'Quick open files' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Quick open files' })).toBeHidden();
  });

  test('create → edit → save → delete scratch file round-trip', async ({ page }) => {
    await openFiles(page);
    scratchName = `e2e-scratch-${Date.now()}.txt`;
    const marker = `hello e2e ${Date.now()}`;

    page.on('dialog', (dialog) => {
      if (dialog.type() === 'prompt') void dialog.accept(scratchName);
      else void dialog.accept();
    });

    // Create via header New menu (lands in the workspace root).
    await page.getByRole('button', { name: 'Create new file or folder' }).click();
    await page.getByRole('menuitem', { name: 'File' }).click();

    // Open via quick-open, type, save.
    await page.keyboard.press('ControlOrMeta+k');
    const palette = page.getByRole('dialog', { name: 'Quick open files' });
    await expect(palette).toBeVisible();
    await palette.getByLabel('Search files by name or path').fill(scratchName);
    await page.keyboard.press('Enter');
    const editor = page.locator('.monaco-editor');
    await expect(editor).toBeVisible({ timeout: 30_000 });
    await editor.click();
    await page.keyboard.type(marker);
    await page.getByRole('button', { name: 'Save file' }).click();
    await expect(page.getByText(/Saved /)).toBeVisible();

    // Verify bytes through the real content endpoint.
    const token = await page.evaluate(() => window.localStorage.getItem('vestara-auth-token') ?? '');
    expect(token).not.toBe('');
    const contentRes = await apiFetch(`/api/files/content?path=${encodeURIComponent(scratchName)}`, token);
    expect(contentRes.ok).toBe(true);
    const contentData = (await contentRes.json()) as { content: string };
    expect(contentData.content).toContain(marker);

    // Delete via tree context menu (approval-gated: confirm, then approve).
    await page.getByLabel('Filter in browser').fill(scratchName);
    const row = page.getByLabel('File browser panel').locator(`button[title="${scratchName}"]`).first();
    await expect(row).toBeVisible();
    await row.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Delete…' }).click();
    await page.getByRole('button', { name: 'Review & approve' }).click();
    await expect(row).toBeHidden({ timeout: 15_000 });
    scratchName = '';
  });

  test('inspector shows details, actions, and git status', async ({ page }) => {
    await openFiles(page);

    await page.getByLabel('Filter in browser').fill('AGENTS.md');
    await page.getByLabel('File browser panel').locator('button[title="AGENTS.md"]').first().click();

    const inspector = page.getByLabel('File inspector panel');
    await expect(inspector.getByText('DETAILS', { exact: true })).toBeVisible();
    await expect(inspector.getByText('ACTIONS', { exact: true })).toBeVisible();
    await expect(inspector.getByRole('button', { name: 'Download' })).toBeVisible();
    const gitCard = inspector.getByLabel('Git status');
    await expect(gitCard).toBeVisible();
    await expect(gitCard.getByText(/On branch/)).not.toBeEmpty();
  });

  test('mode tabs switch work area and stats popover opens', async ({ page }) => {
    await openFiles(page);

    await page.getByRole('tab', { name: 'Preview' }).click();
    await expect(page.getByText('Nothing to preview')).toBeVisible();

    await page.getByRole('tab', { name: 'Search' }).click();
    await expect(page.getByLabel('Search file contents (prefix glob: for filename patterns)')).toBeVisible();

    await page.getByRole('tab', { name: 'Files', exact: true }).click();
    await expect(page.locator('[data-row-index]').first()).toBeVisible();

    await page.getByRole('button', { name: 'Workspace storage statistics' }).click();
    await expect(page.getByText('WORKSPACE STATS', { exact: true })).toBeVisible();
  });

  test('browser collapse/expand and resizer', async ({ page }) => {
    await openFiles(page);

    const panel = page.getByLabel('File browser panel');
    const before = await panel.evaluate((el) => el.getBoundingClientRect().width);

    await page.getByRole('button', { name: 'Collapse file browser' }).click();
    await expect(page.getByRole('button', { name: 'Expand file browser' })).toBeVisible();
    await page.getByRole('button', { name: 'Expand file browser' }).click();
    await expect(page.getByLabel('File browser panel')).toBeVisible();

    const separator = page.getByRole('separator', { name: 'Resize file browser' });
    const box = await separator.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + 60, box!.y + box!.height / 2, { steps: 5 });
    await page.mouse.up();
    const after = await panel.evaluate((el) => el.getBoundingClientRect().width);
    expect(Math.abs(after - before)).toBeGreaterThan(10);
  });
});
