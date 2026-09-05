/**
 * @vestara/voice-browser — Browser Automation Engine
 *
 * Provides a provider-agnostic browser automation abstraction.
 * The engine executes BrowserActions against a real browser (Playwright,
 * Puppeteer) or a headless stub for testing.
 *
 * Architecture Traceability:
 *   PCS-020 → Voice Interaction Pipeline
 *   UX-011  → Visual Action Feedback
 */

import type { Logger } from '@vestara/logger';
import type { ActionResult, BrowserAction, BrowserEngine, BrowserPage } from './types.js';

/**
 * PlaywrightBrowserEngine — real browser automation via Playwright.
 *
 * When Playwright is available, this drives a real Chromium instance.
 * Falls back to a stub that simulates actions for testing/dev.
 */
export class PlaywrightBrowserEngine implements BrowserEngine {
  readonly id = 'playwright';
  readonly name = 'Playwright Chromium';
  private browser: unknown = null;
  private page: unknown = null;
  private logger?: Logger;
  private history: string[] = [];
  private historyIndex = -1;
  private _currentUrl = 'about:blank';

  constructor(options?: { logger?: Logger }) {
    this.logger = options?.logger?.child({ component: 'browser-engine' });
  }

  async initialize(): Promise<void> {
    try {
      // Dynamic import — Playwright is an optional peer dependency.
      // When available, launches a real Chromium instance.
      let pw: Record<string, unknown> | null = null;
      try {
        // Use Function constructor to avoid TypeScript module resolution
        // at compile time — playwright is optional.
        pw = (await new Function('return import("playwright")')()) as Record<string, unknown>;
      } catch {
        // Playwright not installed
      }
      if (!pw) {
        this.logger?.warn('Playwright not installed, using stub engine');
        return;
      }
      const chromium = (pw as Record<string, unknown>).chromium as {
        launch: (opts?: Record<string, unknown>) => Promise<unknown>;
      };
      const browser = await chromium.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      this.browser = browser;
      const ctx = browser as { newContext: () => Promise<{ newPage: () => Promise<unknown> }> };
      const context = await ctx.newContext();
      this.page = await context.newPage();
      this.logger?.info('Playwright browser launched');
    } catch {
      this.logger?.warn('Playwright not available, using stub engine');
      this.page = null;
    }
  }

  async navigate(url: string): Promise<ActionResult> {
    const start = Date.now();
    try {
      if (this.page) {
        await (this.page as { goto: (url: string, opts?: Record<string, unknown>) => Promise<void> }).goto(url, {
          waitUntil: 'domcontentloaded',
        });
      }
      this._currentUrl = url;
      this.history.push(url);
      this.historyIndex = this.history.length - 1;
      this.logger?.info('Navigated', { url });
      return {
        success: true,
        action: { type: 'navigate', value: url },
        duration: Date.now() - start,
      };
    } catch (error) {
      return {
        success: false,
        action: { type: 'navigate', value: url },
        error: error instanceof Error ? error.message : 'Navigation failed',
        duration: Date.now() - start,
      };
    }
  }

  async click(selector: string): Promise<ActionResult> {
    const start = Date.now();
    try {
      if (this.page) {
        await (this.page as { click: (s: string) => Promise<void> }).click(selector);
      }
      this.logger?.info('Clicked', { selector });
      return {
        success: true,
        action: { type: 'click', selector },
        duration: Date.now() - start,
      };
    } catch (error) {
      return {
        success: false,
        action: { type: 'click', selector },
        error: error instanceof Error ? error.message : `Click failed: ${selector}`,
        duration: Date.now() - start,
      };
    }
  }

  async type(selector: string, text: string): Promise<ActionResult> {
    const start = Date.now();
    try {
      if (this.page) {
        await (
          this.page as { click: (s: string) => Promise<void>; type: (s: string, t: string) => Promise<void> }
        ).click(selector);
        await (this.page as { type: (s: string, t: string) => Promise<void> }).type(selector, text);
      }
      this.logger?.info('Typed', { selector, length: text.length });
      return {
        success: true,
        action: { type: 'type', selector, value: text },
        duration: Date.now() - start,
      };
    } catch (error) {
      return {
        success: false,
        action: { type: 'type', selector, value: text },
        error: error instanceof Error ? error.message : `Type failed: ${selector}`,
        duration: Date.now() - start,
      };
    }
  }

  async scroll(direction: 'up' | 'down' | 'left' | 'right', amount = 50): Promise<ActionResult> {
    const start = Date.now();
    try {
      if (this.page) {
        const deltaMap: Record<string, { x: number; y: number }> = {
          up: { x: 0, y: -amount * 10 },
          down: { x: 0, y: amount * 10 },
          left: { x: -amount * 10, y: 0 },
          right: { x: amount * 10, y: 0 },
        };
        const delta = deltaMap[direction] ?? { x: 0, y: 0 };
        await (this.page as { mouse: { wheel: (d: { x: number; y: number }) => Promise<void> } }).mouse.wheel(delta);
      }
      this.logger?.info('Scrolled', { direction, amount });
      return {
        success: true,
        action: { type: 'scroll', scrollDirection: direction, scrollAmount: amount },
        duration: Date.now() - start,
      };
    } catch (error) {
      return {
        success: false,
        action: { type: 'scroll', scrollDirection: direction, scrollAmount: amount },
        error: error instanceof Error ? error.message : 'Scroll failed',
        duration: Date.now() - start,
      };
    }
  }

  async goBack(): Promise<ActionResult> {
    const start = Date.now();
    try {
      if (this.page) {
        await (this.page as { goBack: () => Promise<void> }).goBack();
      }
      if (this.historyIndex > 0) {
        this.historyIndex--;
        this._currentUrl = this.history[this.historyIndex] ?? this._currentUrl;
      }
      return {
        success: true,
        action: { type: 'go_back' },
        duration: Date.now() - start,
      };
    } catch (error) {
      return {
        success: false,
        action: { type: 'go_back' },
        error: error instanceof Error ? error.message : 'Go back failed',
        duration: Date.now() - start,
      };
    }
  }

  async goForward(): Promise<ActionResult> {
    const start = Date.now();
    try {
      if (this.page) {
        await (this.page as { goForward: () => Promise<void> }).goForward();
      }
      if (this.historyIndex < this.history.length - 1) {
        this.historyIndex++;
        this._currentUrl = this.history[this.historyIndex] ?? this._currentUrl;
      }
      return {
        success: true,
        action: { type: 'go_forward' },
        duration: Date.now() - start,
      };
    } catch (error) {
      return {
        success: false,
        action: { type: 'go_forward' },
        error: error instanceof Error ? error.message : 'Go forward failed',
        duration: Date.now() - start,
      };
    }
  }

  async reload(): Promise<ActionResult> {
    const start = Date.now();
    try {
      if (this.page) {
        await (this.page as { reload: () => Promise<void> }).reload();
      }
      return {
        success: true,
        action: { type: 'reload' },
        duration: Date.now() - start,
      };
    } catch (error) {
      return {
        success: false,
        action: { type: 'reload' },
        error: error instanceof Error ? error.message : 'Reload failed',
        duration: Date.now() - start,
      };
    }
  }

  async screenshot(): Promise<string> {
    if (this.page) {
      const buf = await (this.page as { screenshot: () => Promise<Buffer> }).screenshot();
      return buf.toString('base64');
    }
    return '';
  }

  async getText(selector?: string): Promise<string> {
    if (this.page) {
      const target = selector ?? 'body';
      return await (this.page as { innerText: (s: string) => Promise<string> }).innerText(target);
    }
    return '';
  }

  async getCurrentPage(): Promise<BrowserPage> {
    let title = '';
    if (this.page) {
      title = await (this.page as { title: () => Promise<string> }).title();
    }
    return { url: this._currentUrl, title };
  }

  async close(): Promise<void> {
    if (this.browser) {
      await (this.browser as { close: () => Promise<void> }).close();
    }
    this.browser = null;
    this.page = null;
    this.logger?.info('Browser closed');
  }
}

/**
 * StubBrowserEngine — simulates browser actions for testing.
 * Records actions without a real browser.
 */
export class StubBrowserEngine implements BrowserEngine {
  readonly id = 'stub';
  readonly name = 'Stub Browser';
  private _currentUrl = 'about:blank';
  private _actions: BrowserAction[] = [];

  get actions(): ReadonlyArray<BrowserAction> {
    return this._actions;
  }

  async navigate(url: string): Promise<ActionResult> {
    this._actions.push({ type: 'navigate', value: url });
    this._currentUrl = url;
    return { success: true, action: { type: 'navigate', value: url }, duration: 1 };
  }

  async click(selector: string): Promise<ActionResult> {
    this._actions.push({ type: 'click', selector });
    return { success: true, action: { type: 'click', selector }, duration: 1 };
  }

  async type(selector: string, text: string): Promise<ActionResult> {
    this._actions.push({ type: 'type', selector, value: text });
    return { success: true, action: { type: 'type', selector, value: text }, duration: 1 };
  }

  async scroll(direction: 'up' | 'down' | 'left' | 'right', amount?: number): Promise<ActionResult> {
    this._actions.push({ type: 'scroll', scrollDirection: direction, scrollAmount: amount });
    return {
      success: true,
      action: { type: 'scroll', scrollDirection: direction, scrollAmount: amount },
      duration: 1,
    };
  }

  async goBack(): Promise<ActionResult> {
    this._actions.push({ type: 'go_back' });
    return { success: true, action: { type: 'go_back' }, duration: 1 };
  }

  async goForward(): Promise<ActionResult> {
    this._actions.push({ type: 'go_forward' });
    return { success: true, action: { type: 'go_forward' }, duration: 1 };
  }

  async reload(): Promise<ActionResult> {
    this._actions.push({ type: 'reload' });
    return { success: true, action: { type: 'reload' }, duration: 1 };
  }

  async screenshot(): Promise<string> {
    return 'stub-screenshot-base64';
  }

  async getText(_selector?: string): Promise<string> {
    return 'stub page text content';
  }

  async getCurrentPage(): Promise<BrowserPage> {
    return { url: this._currentUrl, title: 'Stub Page' };
  }

  async close(): Promise<void> {
    this._actions = [];
  }
}
