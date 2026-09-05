/**
 * @vestara/voice-browser — Governed Browser Engine Adapter
 *
 * The "bridge" between the voice-browser pipeline and the governed
 * @vestara/browser-runtime. Implements the `BrowserEngine` interface by
 * delegating every action to a `BrowserRuntimeService` managed session, so
 * voice-driven browsing runs on the governed path (Playwright, evidence,
 * permission policy, and human-takeover) rather than a third driver.
 *
 * Usage:
 * ```ts
 * const adapter = new BrowserEngineAdapter(runtime, 'agent-1:task-1', { autoApprove: true });
 * const pipeline = new DefaultVoiceBrowserPipeline({ browserEngine: adapter });
 * ```
 */

import type { BrowserRuntimeService, ManagedBrowserSession } from '@vestara/browser-runtime';
import type { ActionResult, BrowserAction, BrowserEngine, BrowserPage } from './types.js';

type Session = ManagedBrowserSession['session'];

export interface BrowserEngineAdapterOptions {
  readonly signal?: AbortSignal;
  /** Auto-approve `ask` actions (click/type). Default true for smooth voice flow. */
  readonly autoApprove?: boolean;
}

function toDataUrl(bytes: Uint8Array): string {
  return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
}

/**
 * Adapts a governed `BrowserRuntimeService` session to the voice-browser
 * `BrowserEngine` contract. Each action is authorized, recorded, and executed
 * against the managed session's `BrowserSession`.
 */
export class BrowserEngineAdapter implements BrowserEngine {
  readonly id = 'vestara-governed';
  readonly name = 'Vestara Governed Browser';

  constructor(
    private readonly runtime: BrowserRuntimeService,
    private readonly sessionId: string,
    private readonly options: BrowserEngineAdapterOptions = {},
  ) {}

  private key(): string {
    return this.sessionId;
  }

  private session(): Session {
    const managed = this.runtime.getSession(this.sessionId);
    if (!managed || managed.status === 'closed') {
      throw new Error(`Browser session not found or closed: ${this.sessionId}`);
    }
    this.runtime.assertAgentControl(this.sessionId);
    return managed.session;
  }

  private actionName(type: BrowserAction['type']): string {
    switch (type) {
      case 'go_back':
        return 'browser.back';
      case 'go_forward':
        return 'browser.forward';
      case 'extract_text':
        return 'browser.snapshot';
      default:
        return `browser.${type}`;
    }
  }

  private async run(
    action: BrowserAction,
    operation: (session: Session, key: string) => Promise<unknown>,
    extractText?: () => Promise<string>,
  ): Promise<ActionResult> {
    const actionName = this.actionName(action.type);
    const started = Date.now();
    this.runtime.recordActionStarted(this.sessionId, actionName, { actionType: action.type });
    try {
      const decision = await this.runtime.authorizeAction(actionName, this.sessionId, {
        autoApprove: this.options.autoApprove ?? true,
      });
      if (decision.decision === 'denied') throw new Error(decision.reason ?? 'Action denied');
      if (decision.decision === 'awaiting-approval') throw new Error('Action requires user approval');

      await operation(this.session(), this.key());
      const extractedText = extractText ? await extractText() : undefined;
      this.runtime.recordActionCompleted(this.sessionId, actionName, { duration: Date.now() - started });
      return { success: true, action, extractedText, duration: Date.now() - started };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.runtime.recordActionFailed(this.sessionId, actionName, message);
      return { success: false, action, error: message, duration: Date.now() - started };
    }
  }

  async navigate(url: string): Promise<ActionResult> {
    const action: BrowserAction = { type: 'navigate', value: url };
    return this.run(action, (s, k) => s.navigate(url, k, this.options.signal));
  }

  async click(selector: string): Promise<ActionResult> {
    const action: BrowserAction = { type: 'click', selector };
    return this.run(action, (s, k) => s.click(selector, undefined, k, this.options.signal));
  }

  async type(selector: string, text: string): Promise<ActionResult> {
    const action: BrowserAction = { type: 'type', selector, value: text };
    return this.run(action, (s, k) => s.type(selector, text, false, k, this.options.signal));
  }

  async scroll(direction: 'up' | 'down' | 'left' | 'right', amount?: number): Promise<ActionResult> {
    const action: BrowserAction = { type: 'scroll', scrollDirection: direction, scrollAmount: amount };
    if (direction !== 'up' && direction !== 'down') {
      const started = Date.now();
      this.runtime.recordActionStarted(this.sessionId, 'browser.scroll', {});
      const error = `scroll direction '${direction}' is not supported by the governed driver`;
      this.runtime.recordActionFailed(this.sessionId, 'browser.scroll', error);
      return { success: false, action, error, duration: Date.now() - started };
    }
    return this.run(action, (s, k) => s.scroll(direction, amount ?? 500, k, this.options.signal));
  }

  async goBack(): Promise<ActionResult> {
    const action: BrowserAction = { type: 'go_back' };
    return this.run(action, (s, k) => s.back(k, this.options.signal));
  }

  async goForward(): Promise<ActionResult> {
    const action: BrowserAction = { type: 'go_forward' };
    return this.run(action, (s, k) => s.forward(k, this.options.signal));
  }

  async reload(): Promise<ActionResult> {
    const action: BrowserAction = { type: 'reload' };
    return this.run(action, (s, k) => s.reload(k, this.options.signal));
  }

  async screenshot(): Promise<string> {
    this.runtime.recordActionStarted(this.sessionId, 'browser.screenshot', {});
    try {
      // Viewport-only capture — full-page screenshots of long pages can exceed
      // API request deadlines when driven through the voice path.
      const result = await this.session().screenshot(this.key(), this.options.signal, { fullPage: false });
      this.runtime.recordActionCompleted(this.sessionId, 'browser.screenshot', { url: result.url });
      return toDataUrl(result.bytes);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.runtime.recordActionFailed(this.sessionId, 'browser.screenshot', message);
      throw error;
    }
  }

  async getText(selector?: string): Promise<string> {
    const result = await this.session().snapshot(this.key(), this.options.signal);
    return result.text;
  }

  async getCurrentPage(): Promise<BrowserPage> {
    const result = await this.session().snapshot(this.key(), this.options.signal);
    return { url: result.url, title: result.title, content: result.text };
  }

  async close(): Promise<void> {
    await this.session().close(this.key());
  }
}
