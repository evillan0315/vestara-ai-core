/**
 * PageScreenshotRunner — one responsibility: open a route, stabilize, mask,
 * and capture a single screenshot buffer.
 */

import type { Page } from '@playwright/test';
import type { Config, Theme } from '../config.js';
import { installVisualApiFixtures } from '../fixtures/api.js';
import { applyMasks } from '../helpers/masks.js';
import { disableAnimations, emulateReducedMotion, waitForStability } from '../helpers/stability.js';
import { themeInitScript } from '../helpers/theme.js';
import type { RouteDefinition } from '../routes/manifest.js';

/** Fixed instant every capture runs at, so time-derived text is stable. */
const VISUAL_FIXED_TIME = new Date('2026-01-01T00:00:00.000Z');

export class PageScreenshotRunner {
  constructor(private readonly config: Config) {}

  /**
   * Navigate to a route and capture it. Theme is applied via an init script
   * so the app boots deterministically in the requested theme.
   */
  async capture(page: Page, route: RouteDefinition, theme: Theme): Promise<Buffer> {
    await page.addInitScript(themeInitScript(theme));
    await installVisualApiFixtures(page, route);
    // Freeze wall-clock time. The app's designed offline fixtures derive relative
    // timestamps from Date.now() at module load (overview.fixtures.ts:15-16), and
    // the mask set covers notifications and charts but has no date selector
    // (helpers/masks.ts), so without this the same render diffs between runs
    // purely on elapsed time. setFixedTime fixes Date only; timers still run.
    await page.clock.setFixedTime(VISUAL_FIXED_TIME);
    await page
      .goto(`${this.config.baseURL}${route.url}`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      .catch(() => {
        /* the app may redirect or render error boundaries; capture what is shown */
      });

    await waitForStability(page, {
      waitForNetworkIdle: this.config.waitForNetworkIdle,
      settleTimeoutMs: this.config.stabilityTimeoutMs,
    });

    if (route.id === 'activity') {
      await page.getByText('Activity Stream').waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
      await page.getByText('Live', { exact: true }).first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
      await this.pinActivityStreamToLatest(page);
    }

    await disableAnimations(page);
    await emulateReducedMotion(page);
    await applyMasks(page, route);
    await page.waitForTimeout(200);

    return page.screenshot({ fullPage: false, animations: 'disabled' });
  }

  private async pinActivityStreamToLatest(page: Page): Promise<void> {
    const stream = page.getByRole('log', { name: 'Activity stream' });
    await stream.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
    await stream.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    }).catch(() => {});

    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(resolve);
          });
        }),
    );

    await stream.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    }).catch(() => {});
  }
}
