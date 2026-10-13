/**
 * ViewportRunner — opens an isolated browser context sized for a viewport.
 *
 * Each capture gets its own context so device scale factor, touch, and mobile
 * emulation are exact, and parallel captures never interfere.
 */

import type { Browser, BrowserContext, Page } from '@playwright/test';
import { storageStatePath } from '../auth/roles.js';
import type { Theme, Viewport } from '../config.js';

export interface OpenResult {
  context: BrowserContext;
  page: Page;
}

export class ViewportRunner {
  async open(browser: Browser, viewport: Viewport, theme: Theme, roleId?: string): Promise<OpenResult> {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.deviceScaleFactor ?? 1,
      isMobile: viewport.isMobile ?? false,
      hasTouch: viewport.hasTouch ?? false,
      // Browser-level scheme follows the case theme (was hardcoded dark, so
      // light captures carried dark scrollbars/widgets and a false
      // prefers-color-scheme). Theme ids are 'dark' | 'light' by config.
      colorScheme: theme.id as 'dark' | 'light',
      // Authenticated identity per role (see auth/roles.ts). Storage states
      // are ensured by globalSetup; without one, authed routes redirect.
      ...(roleId ? { storageState: storageStatePath(roleId) } : {}),
    });
    const page = await context.newPage();
    return { context, page };
  }
}
