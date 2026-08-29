/**
 * Page stability helpers.
 *
 * Before capturing we wait for the app to settle and neutralize everything
 * that would make screenshots flaky: transitions, animations, blinking
 * cursors, spinners, and live counters.
 */

import type { Page } from '@playwright/test';

export interface StabilityOptions {
  waitForNetworkIdle?: boolean;
  settleTimeoutMs?: number;
}

const ANIMATION_OVERRIDES = `
  *, *::before, *::after {
    transition: none !important;
    animation: none !important;
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    caret-color: transparent !important;
    scroll-behavior: auto !important;
  }
  [class*="animate-"], .animate-pulse, .animate-ping, .animate-bounce, .animate-spin,
  [data-live], .live-indicator, .toast, [role="status"] {
    animation: none !important;
    opacity: 1 !important;
  }
`;

/** Inject CSS that disables animations, transitions, and cursors. */
export async function disableAnimations(page: Page): Promise<void> {
  await page.addStyleTag({ content: ANIMATION_OVERRIDES });
}

/** Wait until fonts are loaded. */
export async function waitForFonts(page: Page): Promise<void> {
  await page.evaluate(() => (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready);
}

/**
 * Wait for the app to be stable: load, optional network idle, fonts, a
 * settlement pause, and reduced-motion honored for respect of user preference.
 */
export async function waitForStability(page: Page, options: StabilityOptions = {}): Promise<void> {
  await page.waitForLoadState('load', { timeout: 20_000 }).catch(() => {});
  if (options.waitForNetworkIdle !== false) {
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  }
  await waitForFonts(page);
  await page.waitForTimeout(options.settleTimeoutMs ?? 800);
}

/** Emulate prefers-reduced-motion for stable, accessible captures. */
export async function emulateReducedMotion(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
}
