/**
 * PageScreenshotRunner — one responsibility: open a route, stabilize, mask,
 * and capture a single screenshot buffer.
 */

import type { Page } from '@playwright/test';
import type { Config, Theme } from '../config.js';
import { applyMasks } from '../helpers/masks.js';
import { disableAnimations, emulateReducedMotion, waitForStability } from '../helpers/stability.js';
import { themeInitScript } from '../helpers/theme.js';
import type { RouteDefinition } from '../routes/manifest.js';

export class PageScreenshotRunner {
  constructor(private readonly config: Config) {}

  /**
   * Navigate to a route and capture it. Theme is applied via an init script
   * so the app boots deterministically in the requested theme.
   */
  async capture(page: Page, route: RouteDefinition, theme: Theme): Promise<Buffer> {
    await page.addInitScript(themeInitScript(theme));
    await page
      .goto(`${this.config.baseURL}${route.url}`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      .catch(() => {
        /* the app may redirect or render error boundaries; capture what is shown */
      });

    await waitForStability(page, {
      waitForNetworkIdle: this.config.waitForNetworkIdle,
      settleTimeoutMs: this.config.stabilityTimeoutMs,
    });

    await disableAnimations(page);
    await emulateReducedMotion(page);
    await applyMasks(page, route);
    await page.waitForTimeout(200);

    return page.screenshot({ fullPage: false, animations: 'disabled' });
  }
}
