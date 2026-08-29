/**
 * ThemeRunner — selects and applies themes.
 *
 * Theme is seeded into localStorage before navigation (via init script) so
 * every capture is deterministic. Future themes (e.g. custom accent palettes)
 * are added to the config's THEMES list without touching this module.
 */

import type { BrowserContext } from '@playwright/test';
import type { Config, Theme } from '../config.js';
import { THEME_STORAGE_KEY } from '../helpers/theme.js';

export class ThemeRunner {
  constructor(private readonly config: Config) {}

  /** Themes selected for this run. */
  selected(): Theme[] {
    const filter = process.env.SCREENSHOT_THEME;
    if (!filter) return this.config.themes;
    return this.config.themes.filter((t) => t.id === filter || t.label.toLowerCase() === filter.toLowerCase());
  }

  /** Ensure the context starts in the requested theme. */
  seed(context: BrowserContext, theme: Theme): void {
    context.addInitScript(
      ([key, value]) => {
        try {
          localStorage.setItem(key, value);
        } catch {}
      },
      [THEME_STORAGE_KEY, theme.storageValue] as const,
    );
  }
}
