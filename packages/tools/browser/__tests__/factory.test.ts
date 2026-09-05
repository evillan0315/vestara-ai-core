import { describe, expect, it } from 'vitest';
import {
  BROWSER_TOOL_NAMES,
  type BrowserDriver,
  type BrowserNavigationResult,
  type BrowserObserveResult,
  type BrowserPoint,
  type BrowserScreenshotResult,
  BrowserSession,
  type BrowserSnapshotResult,
  createBrowserToolSet,
} from '../src/index';

const BASE = 'http://app.local:5173';

class FakeBrowserDriver implements BrowserDriver {
  readonly id = 'fake';

  async navigate(url: string): Promise<BrowserNavigationResult> {
    return { url, title: 'Fake Page' };
  }

  async snapshot(): Promise<BrowserSnapshotResult> {
    return { url: BASE, title: 'Fake Page', text: 'hello' };
  }

  async screenshot(): Promise<BrowserScreenshotResult> {
    return { url: BASE, width: 640, height: 480, bytes: new Uint8Array([1]) };
  }

  async observe(): Promise<BrowserObserveResult> {
    return { url: BASE, title: 'Fake Page', observationId: 'obs', elements: [] };
  }

  async click(_selector: string, _point: BrowserPoint | undefined): Promise<void> {}
  async clickRef(_ref: string): Promise<void> {}
  async type(_selector: string, _text: string, _submit: boolean): Promise<void> {}
  async typeRef(_ref: string, _text: string, _submit: boolean): Promise<void> {}
  async scroll(): Promise<void> {}
  async back(): Promise<void> {}
  async forward(): Promise<void> {}
  async reload(): Promise<void> {}
  async waitForNavigation(): Promise<BrowserNavigationResult> {
    return { url: BASE, title: 'Fake Page' };
  }
  async close(): Promise<void> {}
}

describe('createBrowserToolSet', () => {
  it('binds all canonical browser tools to a session', () => {
    const session = new BrowserSession(new FakeBrowserDriver(), { baseUrl: BASE });
    const tools = createBrowserToolSet(session);
    expect(tools.map((t) => t.name)).toEqual(BROWSER_TOOL_NAMES);
    expect(tools).toHaveLength(BROWSER_TOOL_NAMES.length);
  });

  it('includes observe and ref-based tools', () => {
    const session = new BrowserSession(new FakeBrowserDriver(), { baseUrl: BASE });
    const names = createBrowserToolSet(session).map((t) => t.name);
    expect(names).toContain('browser.observe');
    expect(names).toContain('browser.click');
    expect(names).toContain('browser.type');
    expect(names).toContain('browser.scroll');
    expect(names).toContain('browser.wait');
    expect(names).toContain('browser.back');
    expect(names).toContain('browser.forward');
    expect(names).toContain('browser.reload');
  });

  it('declares risk levels consistent with the permission model', () => {
    const session = new BrowserSession(new FakeBrowserDriver(), { baseUrl: BASE });
    const risks = new Map(createBrowserToolSet(session).map((t) => [t.name, t.risk]));
    expect(risks.get('browser.navigate')).toBe('medium');
    expect(risks.get('browser.observe')).toBe('low');
    expect(risks.get('browser.click')).toBe('medium');
    expect(risks.get('browser.type')).toBe('medium');
    expect(risks.get('browser.scroll')).toBe('low');
  });
});
