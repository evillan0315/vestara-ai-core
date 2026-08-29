/**
 * ViewportRunner — opens an isolated browser context sized for a viewport.
 *
 * Each capture gets its own context so device scale factor, touch, and mobile
 * emulation are exact, and parallel captures never interfere.
 */

import type { Browser, BrowserContext, Page } from '@playwright/test';
import type { Viewport } from '../config.js';

export interface OpenResult {
  context: BrowserContext;
  page: Page;
}

export class ViewportRunner {
  async open(browser: Browser, viewport: Viewport): Promise<OpenResult> {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.deviceScaleFactor ?? 1,
      isMobile: viewport.isMobile ?? false,
      hasTouch: viewport.hasTouch ?? false,
      colorScheme: 'dark',
    });
    const page = await context.newPage();
    return { context, page };
  }
}
