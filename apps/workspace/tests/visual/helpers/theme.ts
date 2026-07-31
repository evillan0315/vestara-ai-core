/**
 * Theme application.
 *
 * The Workspace theme is driven by the `vestara-theme` localStorage key
 * (`dark` | `light` | `system`) plus injected CSS variables. We set the key
 * before navigation so the app boots in the requested theme, then reload to
 * ensure the variables apply deterministically.
 */

import type { Page } from '@playwright/test';
import type { Theme } from '../config.js';

/** The localStorage key the app reads for its theme. */
export const THEME_STORAGE_KEY = 'vestara-theme';

/** Seed the theme preference before the page loads (call via addInitScript). */
export function themeInitScript(theme: Theme): string {
  return `() => { try { localStorage.setItem('${THEME_STORAGE_KEY}', '${theme.storageValue}'); } catch {} }`;
}

/** Apply a theme to an already-loaded page. */
export async function applyTheme(page: Page, theme: Theme): Promise<void> {
  await page.evaluate(
    ([key, value]) => {
      try {
        localStorage.setItem(key, value);
      } catch {}
    },
    [THEME_STORAGE_KEY, theme.storageValue] as const,
  );
}
