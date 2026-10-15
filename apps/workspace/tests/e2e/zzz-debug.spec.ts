import { expect, test } from '@playwright/test';

test('debug prompt and focus state', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('local-operator').fill('e2e-debug2');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
  await page.goto('/files');
  await expect(page.getByRole('tree', { name: 'Repository tree' })).toBeVisible();

  let dialogSeen = '';
  page.on('dialog', (dialog) => {
    dialogSeen = `${dialog.type()}:${dialog.message()}`;
    void dialog.accept('e2e-debug-file.txt');
  });

  await page.getByRole('button', { name: 'Create new file or folder' }).click();
  await page.getByRole('menuitem', { name: 'File', exact: true }).click();

  // If a native prompt is still open, JS is blocked and this times out.
  const title = await page.evaluate(() => document.title, null, { timeout: 5000 }).catch(() => 'EVALUATE_TIMEOUT_PROMPT_OPEN');
  console.log(`after-menu title=${title} dialogSeen=${dialogSeen}`);
  const active = await page.evaluate(() => {
    const el = document.activeElement;
    return el ? `${el.tagName}#${el.id}.${el.className}`.slice(0, 120) : 'none';
  });
  console.log(`activeElement=${active}`);
  await page.keyboard.press('ControlOrMeta+k');
  await page.waitForTimeout(1000);
  const ours = await page.getByRole('dialog', { name: 'Quick open files' }).count();
  console.log(`oursOpen=${ours}`);
  const dialogs = await page.evaluate(() =>
    [...document.querySelectorAll('[role="dialog"]')].map((el) => el.getAttribute('aria-label') ?? '(no label)'),
  );
  console.log(`dialogs=${JSON.stringify(dialogs)}`);
  // Dispatch a synthetic keydown directly and see if ours opens (bypasses CDP focus questions).
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(500);
  const ours2 = await page.getByRole('dialog', { name: 'Quick open files' }).count();
  console.log(`oursAfterSynthetic=${ours2}`);
});
