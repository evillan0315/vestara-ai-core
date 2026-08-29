/**
 * Dynamic-content masking.
 *
 * Charts, notifications, live counters, avatars, dates, and session ids make
 * screenshots flaky. Masks paint over these regions before capture. Masking is
 * route-specific: global defaults plus per-route overrides.
 */

import type { Page } from '@playwright/test';
import type { RouteDefinition } from '../routes/manifest.js';

export interface Mask {
  selector: string;
  color?: string;
}

/** Selectors that are commonly dynamic across pages. */
export const DEFAULT_MASKS: Mask[] = [
  { selector: '[data-mask]' },
  { selector: '[class*="notification"]', color: '#1a1a1a' },
  { selector: '[class*="toast"]' },
  { selector: '.toast' },
  { selector: '[class*="live-"]' },
  { selector: '[data-live-counter]' },
];

/** Route-specific masks keyed by route id. */
export const ROUTE_MASKS: Record<string, Mask[]> = {
  dashboard: [{ selector: '.recharts-wrapper' }, { selector: '[class*="StatCard"]' }],
  overview: [{ selector: '.recharts-wrapper' }],
  ops: [{ selector: '.recharts-wrapper' }, { selector: '[class*="Sparkline"]' }],
  diagnostics: [{ selector: '.recharts-wrapper' }],
  execution: [{ selector: '.recharts-wrapper' }],
  chat: [{ selector: '[class*="typing"]' }, { selector: '.thinking' }],
  terminal: [{ selector: '.xterm' }],
};

/** Mask selectors for a route (defaults merged with route-specific). */
export function masksFor(route: RouteDefinition): Mask[] {
  return [...DEFAULT_MASKS, ...(route.masks ?? []).map((selector) => ({ selector })), ...(ROUTE_MASKS[route.id] ?? [])];
}

/** Apply all masks for a route by painting rectangles over matched elements. */
export async function applyMasks(page: Page, route: RouteDefinition): Promise<number> {
  const masks = masksFor(route);
  let masked = 0;
  for (const mask of masks) {
    const count = await page
      .locator(mask.selector)
      .count()
      .catch(() => 0);
    for (let i = 0; i < count; i += 1) {
      await page
        .locator(mask.selector)
        .nth(i)
        .evaluate((el, color) => {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) return;
          const overlay = document.createElement('div');
          overlay.setAttribute('data-visual-mask', '1');
          overlay.style.position = 'fixed';
          overlay.style.left = `${rect.left}px`;
          overlay.style.top = `${rect.top}px`;
          overlay.style.width = `${rect.width}px`;
          overlay.style.height = `${rect.height}px`;
          overlay.style.backgroundColor = color ?? '#151518';
          overlay.style.zIndex = '2147483647';
          document.body.appendChild(overlay);
        }, mask.color ?? '#151518');
      masked += 1;
    }
  }
  return masked;
}
