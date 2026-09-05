import { BrowserRuntimeService } from '@vestara/browser-runtime';
import type { EmitEvent, EventBus } from '@vestara/event-bus';
import type {
  BrowserDriver,
  BrowserNavigationResult,
  BrowserObserveResult,
  BrowserPoint,
  BrowserScreenshotResult,
  BrowserSnapshotResult,
} from '@vestara/tools-browser';
import { describe, expect, it, vi } from 'vitest';
import { BrowserEngineAdapter } from '../dist/index.js';

const BASE = 'http://app.local:5173';

function createTestEventBus(): EventBus & { events: EmitEvent[] } {
  const events: EmitEvent[] = [];
  return {
    events,
    async emit(event: EmitEvent) {
      events.push(event);
    },
    subscribe: vi.fn() as unknown as EventBus['subscribe'],
    once: vi.fn() as unknown as EventBus['once'],
    unsubscribeAll: vi.fn() as unknown as EventBus['unsubscribeAll'],
    getMetrics: () => ({
      totalEmitted: events.length,
      totalProcessed: 0,
      totalFailed: 0,
      avgLatency: 0,
      activeSubscribers: 0,
    }),
  };
}

class FakeBrowserDriver implements BrowserDriver {
  readonly id = 'fake';
  navigations: string[] = [];
  clickLog: Array<{ selector?: string; point?: BrowserPoint; ref?: string }> = [];
  typeLog: Array<{ selector?: string; text: string }> = [];
  scrollLog: Array<{ direction: string; amount: number }> = [];
  backCount = 0;
  forwardCount = 0;
  reloadCount = 0;
  screenshotCount = 0;

  async navigate(url: string): Promise<BrowserNavigationResult> {
    this.navigations.push(url);
    return { url, title: 'Fake Page' };
  }

  async snapshot(): Promise<BrowserSnapshotResult> {
    return { url: BASE, title: 'Fake Page', text: 'hello world' };
  }

  async screenshot(): Promise<BrowserScreenshotResult> {
    this.screenshotCount++;
    return { url: BASE, width: 640, height: 480, bytes: new Uint8Array([1, 2, 3, 4]) };
  }

  async observe(): Promise<BrowserObserveResult> {
    return { url: BASE, title: 'Fake Page', observationId: 'obs', elements: [] };
  }

  async click(selector: string, point: BrowserPoint | undefined): Promise<void> {
    this.clickLog.push({ selector, point });
  }

  async clickRef(ref: string): Promise<void> {
    this.clickLog.push({ ref });
  }

  async type(selector: string, text: string): Promise<void> {
    this.typeLog.push({ selector, text });
  }

  async typeRef(ref: string, text: string): Promise<void> {
    this.typeLog.push({ ref, text });
  }

  async scroll(direction: 'up' | 'down', amount: number): Promise<void> {
    this.scrollLog.push({ direction, amount });
  }

  async back(): Promise<void> {
    this.backCount++;
  }

  async forward(): Promise<void> {
    this.forwardCount++;
  }

  async reload(): Promise<void> {
    this.reloadCount++;
  }

  async waitForNavigation(): Promise<BrowserNavigationResult> {
    return { url: BASE, title: 'Fake Page' };
  }

  async close(): Promise<void> {}
}

async function setup(options: { autoApprove?: boolean } = {}) {
  const eventBus = createTestEventBus();
  const runtime = new BrowserRuntimeService({
    workspaceId: 'ws-1',
    eventBus,
    driverFactory: () => new FakeBrowserDriver(),
  });
  await runtime.start();
  const session = runtime.createSession('agent-1', 'task-1', { baseUrl: BASE });
  const adapter = new BrowserEngineAdapter(runtime, session.id, { autoApprove: options.autoApprove ?? true });
  const driver = (session.session as unknown as { driver: FakeBrowserDriver }).driver;
  return { runtime, session, adapter, driver, eventBus };
}

describe('BrowserEngineAdapter (bridge to governed runtime)', () => {
  it('navigates through the governed session', async () => {
    const { adapter, driver } = await setup();
    const result = await adapter.navigate('http://example.com');
    expect(result.success).toBe(true);
    expect(result.action.type).toBe('navigate');
    expect(driver.navigations).toContain('http://example.com/');
  });

  it('clicks and types through the governed session', async () => {
    const { adapter, driver } = await setup();
    const click = await adapter.click('#submit');
    const type = await adapter.type('#email', 'a@b.co');
    expect(click.success).toBe(true);
    expect(type.success).toBe(true);
    expect(driver.clickLog).toContainEqual({ selector: '#submit', point: undefined });
    expect(driver.typeLog).toContainEqual({ selector: '#email', text: 'a@b.co' });
  });

  it('scrolls up/down but rejects unsupported directions', async () => {
    const { adapter, driver } = await setup();
    const down = await adapter.scroll('down', 500);
    expect(down.success).toBe(true);
    expect(driver.scrollLog).toContainEqual({ direction: 'down', amount: 500 });

    const left = await adapter.scroll('left');
    expect(left.success).toBe(false);
    expect(left.error).toMatch(/not supported/);
  });

  it('goes back/forward/reloads', async () => {
    const { adapter, driver } = await setup();
    await adapter.goBack();
    await adapter.goForward();
    await adapter.reload();
    expect(driver.backCount).toBe(1);
    expect(driver.forwardCount).toBe(1);
    expect(driver.reloadCount).toBe(1);
  });

  it('returns a screenshot as a data URL', async () => {
    const { adapter, driver } = await setup();
    const dataUrl = await adapter.screenshot();
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(driver.screenshotCount).toBe(1);
  });

  it('returns current page text and metadata', async () => {
    const { adapter } = await setup();
    const page = await adapter.getCurrentPage();
    expect(page).toMatchObject({ url: BASE, title: 'Fake Page', content: 'hello world' });
    const text = await adapter.getText();
    expect(text).toBe('hello world');
  });

  it('blocks actions while a human controls the session', async () => {
    const { runtime, session, adapter } = await setup();
    runtime.takeControl(session.id);
    const result = await adapter.navigate('http://example.com');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/human controls|not found|session/i);
  });

  it('records action events on the runtime', async () => {
    const { adapter, eventBus } = await setup();
    await adapter.navigate('http://example.com');
    expect(eventBus.events.some((e) => e.type === 'browser.action.started')).toBe(true);
    expect(eventBus.events.some((e) => e.type === 'browser.action.completed')).toBe(true);
  });
});
