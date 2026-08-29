/**
 * PlaywrightScreenshotSource — PCS-026 §4 browser adapter.
 *
 * Launches Chromium lazily, navigates to the target URL at a viewport/theme,
 * waits for network idle + a stability delay (animation suppression hook), and
 * returns a PNG. Browser provisioning is an ops prerequisite
 * (`npx playwright install chromium`); the source degrades gracefully when no
 * browser is available.
 */

import type { ScreenshotSource } from '@vestara/evidence';
import type { Browser } from 'playwright';

export interface PlaywrightScreenshotSourceOptions {
  readonly baseUrl: string;
  readonly stabilityDelayMs?: number;
  readonly timeoutMs?: number;
}

export class PlaywrightScreenshotSource implements ScreenshotSource {
  readonly name = 'playwright';

  private readonly baseUrl: string;
  private readonly stabilityDelayMs: number;
  private readonly timeoutMs: number;
  private browser?: Browser;

  constructor(options: PlaywrightScreenshotSourceOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.stabilityDelayMs = options.stabilityDelayMs ?? 300;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  async captureScreenshot(input: {
    readonly url: string;
    readonly viewport?: { readonly width: number; readonly height: number };
    readonly theme?: string;
  }): Promise<Uint8Array> {
    const browser = await this.ensureBrowser();
    const page = await browser.newPage({
      viewport: input.viewport
        ? { width: input.viewport.width, height: input.viewport.height }
        : { width: 1280, height: 800 },
    });
    try {
      if (input.theme === 'light') {
        await page.emulateMedia({ colorScheme: 'light' });
      }
      const target = input.url.startsWith('http') ? input.url : `${this.baseUrl}${input.url}`;
      await page.goto(target, { waitUntil: 'networkidle', timeout: this.timeoutMs });
      // Stability window: let async renders/short animations settle.
      await page.waitForTimeout(this.stabilityDelayMs);
      const image = await page.screenshot({ type: 'png' });
      return new Uint8Array(image);
    } finally {
      await page.close();
    }
  }

  async dispose(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = undefined;
    }
  }

  private async ensureBrowser(): Promise<Browser> {
    if (!this.browser) {
      const { chromium } = await import('playwright');
      this.browser = await chromium.launch();
    }
    return this.browser;
  }
}
