/**
 * @vestara/tools-browser — shared browser session + navigation + information
 * policy.
 *
 * One lazy-launched Playwright Chromium session per ToolRuntime instance, shared
 * by the browser.* tools. Navigation is confined to the base origin plus any
 * allowed origins (`*` allows any http/https target); data: and javascript:
 * URLs are rejected. Information governance is enforced per origin: each target
 * resolves to a classification, retention policy, and redaction mode that shape
 * what content leaves the provider. The driver boundary keeps the session
 * unit-testable without a running browser.
 */

import type { Browser, Page } from 'playwright';

/**
 * Replay step — conforms structurally to PCS-026 `ReplayStep` (type 'run-scenario'
 * + target + optional command) so the trace can be consumed by the evidence
 * bundle's replay descriptor without a package dependency on `@vestara/evidence`.
 */
export interface BrowserReplayStep {
  readonly type: 'run-scenario';
  readonly target: string;
  readonly command?: string;
}

/**
 * Replay descriptor — conforms structurally to PCS-026 `EvidenceReplayDescriptor`
 * (mode 'execution' + steps + requires). Execution replay claims only the
 * captured dependency (Chromium runtime); everything else stays a bundle
 * limitation.
 */
export interface BrowserReplayDescriptor {
  readonly mode: 'execution';
  readonly steps: readonly BrowserReplayStep[];
  readonly requires: { readonly runtime: string };
}

export interface BrowserSessionOptions {
  readonly baseUrl: string;
  /** Origins allowed in addition to baseUrl; '*' allows any http/https target. */
  readonly allowedOrigins?: readonly string[];
  /** Per-origin governance policies; an entry also allows its origin. */
  readonly originPolicies?: readonly OriginPolicy[];
  /** Information classification applied to evidence (default: 'internal'). */
  readonly classification?: InformationClassification;
  /** Retention policy label recorded on evidence (default: 'workspace-default'). */
  readonly retentionPolicy?: string;
  /** Default redaction mode when no origin policy applies (default: 'off'). */
  readonly redaction?: RedactionMode;
  readonly stabilityDelayMs?: number;
  readonly timeoutMs?: number;
}

export type InformationClassification = 'public' | 'internal' | 'confidential' | 'restricted' | 'regulated';

export type InformationRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type RedactionStatus = 'unredacted' | 'redacted' | 'not-applicable';

export type RedactionMode = 'off' | 'secrets' | 'full';

/**
 * Per-origin governance policy (ENG-007 enforcement). Attaches an information
 * classification, retention policy, and redaction mode to a target origin so
 * sensitive content is handled before it leaves the provider.
 */
export interface OriginPolicy {
  readonly origin: string;
  readonly classification?: InformationClassification;
  readonly retentionPolicy?: string;
  readonly redaction?: RedactionMode;
}

export interface ResolvedPolicy {
  readonly origin: string;
  readonly route: string;
  readonly classification: InformationClassification;
  readonly informationRisk: InformationRiskLevel;
  readonly retentionPolicy: string;
  readonly redaction: RedactionMode;
}

/**
 * ENG-007 — governance metadata retained on browser evidence artifacts.
 * A browser action may be operationally read-only while retrieving or persisting
 * confidential information; low mutation risk does not imply low information
 * risk. Every browser evidence artifact carries origin, route, classification,
 * derived information risk, redaction status, retention policy, and the
 * requesting agent.
 */
export interface EvidenceGovernance {
  readonly origin: string;
  readonly route: string;
  readonly classification: InformationClassification;
  readonly informationRisk: InformationRiskLevel;
  readonly redactionStatus: RedactionStatus;
  readonly retentionPolicy: string;
  readonly requestingAgent: string;
}

export function informationRiskFor(classification: InformationClassification): InformationRiskLevel {
  switch (classification) {
    case 'public':
      return 'low';
    case 'internal':
      return 'medium';
    case 'confidential':
      return 'high';
    case 'restricted':
      return 'high';
    case 'regulated':
      return 'critical';
  }
}

export function isInformationClassification(value: unknown): value is InformationClassification {
  return (
    value === 'public' ||
    value === 'internal' ||
    value === 'confidential' ||
    value === 'restricted' ||
    value === 'regulated'
  );
}

export function isRedactionMode(value: unknown): value is RedactionMode {
  return value === 'off' || value === 'secrets' || value === 'full';
}

// ─── Secret redaction ───────────────────────────────────────────

const SECRET_PATTERNS: ReadonlyArray<RegExp> = [
  /bearer[ \t]+[a-z0-9._~+/=-]+/gi,
  /\b(?:api[_-]?key|token|secret|password|passwd)\b[=:][ \t]*[^\s,;]+/gi,
  /\b(?:sk-|pk-|ghp_|gho_|glpat-|xox[baprs]-)[a-z0-9_-]{16,}/gi,
  /\beyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\b/gi,
  /\b[0-9a-f]{40,}\b/gi,
];

export function redactText(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, '[REDACTED]');
  return out;
}

// ─── Navigation + driver contracts ──────────────────────────────

export interface BrowserNavigationResult {
  readonly url: string;
  readonly title: string;
}

export interface BrowserSnapshotResult {
  readonly url: string;
  readonly title: string;
  readonly text: string;
}

export interface BrowserScreenshotResult {
  readonly url: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: Uint8Array;
}

// ─── Element reference + observer types ─────────────────────────

export interface BrowserElementRef {
  readonly ref: string;
  readonly role: string;
  readonly name: string;
  readonly disabled?: boolean;
  readonly focused?: boolean;
  readonly checked?: boolean;
  readonly expanded?: boolean;
  readonly level?: number;
  readonly value?: string;
  readonly description?: string;
}

export interface BrowserObserveResult {
  readonly url: string;
  readonly title: string;
  readonly observationId: string;
  readonly elements: readonly BrowserElementRef[];
}

export class BrowserObserver {
  private observationCounter = 0;
  private readonly observations = new Map<string, Array<{ element: BrowserElementRef; locatorDescription: string }>>();

  store(result: BrowserObserveResult): void {
    const stored = result.elements.map((el) => ({
      element: el,
      locatorDescription: `${el.role} "${el.name}"`,
    }));
    this.observations.set(result.observationId, stored);
  }

  getElements(observationId: string): readonly BrowserElementRef[] {
    return (this.observations.get(observationId) ?? []).map((s) => s.element);
  }

  resolveElementRef(
    observationId: string,
    ref: string,
  ): { element: BrowserElementRef; locatorDescription: string } | undefined {
    const stored = this.observations.get(observationId);
    if (!stored) return undefined;
    const entry = stored.find((s) => s.element.ref === ref);
    return entry ? { element: entry.element, locatorDescription: entry.locatorDescription } : undefined;
  }

  nextObservationId(): string {
    return `obs-${++this.observationCounter}`;
  }

  hasObservation(observationId: string): boolean {
    return this.observations.has(observationId);
  }

  clear(): void {
    this.observations.clear();
    this.observationCounter = 0;
  }
}

export function resolveElementToLocator(
  page: import('playwright').Page,
  element: BrowserElementRef,
  allElements: readonly BrowserElementRef[],
): import('playwright').Locator {
  const role = element.role;
  const sameRoleName = allElements.filter((e) => e.role === element.role && e.name === element.name);
  const index = sameRoleName.indexOf(element);
  if (sameRoleName.length === 1) {
    return page.getByRole(role as Parameters<import('playwright').Page['getByRole']>[0], {
      name: element.name,
      exact: true,
    });
  }
  return page
    .getByRole(role as Parameters<import('playwright').Page['getByRole']>[0], { name: element.name, exact: true })
    .nth(index);
}

export interface BrowserPoint {
  readonly x: number;
  readonly y: number;
}

export interface BrowserDriver {
  readonly id: string;
  /** Each operation is scoped to a session key (agent:task) so pages never leak state across actors. */
  navigate(url: string, key: string, signal?: AbortSignal): Promise<BrowserNavigationResult>;
  snapshot(key: string, signal?: AbortSignal): Promise<BrowserSnapshotResult>;
  screenshot(key: string, signal?: AbortSignal): Promise<BrowserScreenshotResult>;
  click(selector: string, point: BrowserPoint | undefined, key: string, signal?: AbortSignal): Promise<void>;
  type(selector: string, text: string, submit: boolean, key: string, signal?: AbortSignal): Promise<void>;
  /** Close one session's page, or release everything when no key is given. */
  close(key?: string): Promise<void>;
  observe(key: string, signal?: AbortSignal): Promise<BrowserObserveResult>;
  clickRef(ref: string, key: string, signal?: AbortSignal): Promise<void>;
  typeRef(ref: string, text: string, submit: boolean, key: string, signal?: AbortSignal): Promise<void>;
  scroll(direction: 'up' | 'down', amount: number, key: string, signal?: AbortSignal): Promise<void>;
  back(key: string, signal?: AbortSignal): Promise<void>;
  forward(key: string, signal?: AbortSignal): Promise<void>;
  reload(key: string, signal?: AbortSignal): Promise<void>;
  waitForNavigation(key: string, signal?: AbortSignal): Promise<BrowserNavigationResult>;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function abortError(): Error {
  const error = new Error('Browser operation aborted');
  error.name = 'AbortError';
  return error;
}

/** Isolation boundary for browser state: one page per agent:task. */
export function sessionKey(agentId: string, taskId: string): string {
  return taskId ? `${agentId}:${taskId}` : agentId;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

/**
 * Resolve a raw navigation target against the base URL and enforce the origin
 * policy. Relative paths resolve against baseUrl; absolute http(s) targets must
 * match the base origin or an allowed origin (or '*').
 */
export function resolveBrowserUrl(baseUrl: string, allowedOrigins: readonly string[] | undefined, raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('Navigation target must not be empty');
  const lowered = trimmed.toLowerCase();
  if (lowered.startsWith('javascript:') || lowered.startsWith('data:'))
    throw new Error('data: and javascript: navigation targets are not allowed');
  if (!/^https?:\/\//i.test(trimmed) && !trimmed.startsWith('/') && !trimmed.startsWith('#'))
    throw new Error(`Navigation target must be an http(s) URL or a path: ${raw}`);

  const target = /^https?:\/\//i.test(trimmed) ? new URL(trimmed) : new URL(trimmed, baseUrl);
  const origin = target.origin;
  const base = new URL(baseUrl);

  if (allowedOrigins?.includes('*')) return target.href;
  const allowed = new Set([
    base.origin,
    ...(allowedOrigins ?? []).map((entry) => new URL(entry.includes('://') ? entry : `https://${entry}`).origin),
  ]);
  if (allowed.has(origin)) return target.href;
  const hostAllowed = (allowedOrigins ?? []).some(
    (entry) => !entry.includes('://') && entry.toLowerCase() === target.hostname.toLowerCase(),
  );
  if (!hostAllowed) throw new Error(`Navigation target origin not allowed: ${origin}`);
  return target.href;
}

export function normalizeOrigin(value: string): string {
  const url = new URL(value.includes('://') ? value : `https://${value}`);
  return url.origin;
}

/** True when a policy/allowed entry governs the target URL (scheme-tolerant for bare hostnames). */
export function originMatches(entry: string, target: string): boolean {
  const targetUrl = new URL(target);
  if (entry.includes('://')) return new URL(entry).origin === targetUrl.origin;
  return entry.toLowerCase() === targetUrl.hostname.toLowerCase();
}

// ─── ARIA roles used for interactive-element collection ─────────

const INTERACTIVE_ARIA_ROLES = [
  'button',
  'link',
  'textbox',
  'checkbox',
  'radio',
  'combobox',
  'slider',
  'tab',
  'menuitem',
  'option',
] as const;

/**
 * Playwright-backed driver. One browser is launched lazily; each session key
 * owns an isolated page, so concurrent agents never share navigation, cookies,
 * or form state. Abort signals cancel in-flight navigation and close the
 * affected page so partial state is never reused. The browser is released when
 * the last page closes. Degrades gracefully when Chromium is not provisioned.
 */
export class PlaywrightBrowserDriver implements BrowserDriver {
  readonly id = 'playwright';

  private readonly stabilityDelayMs: number;
  private readonly timeoutMs: number;
  private browser?: Browser;
  private readonly pages = new Map<string, Page>();
  /** Per-key element observations keyed by observation ID. */
  private readonly elementObservations = new Map<string, Map<string, BrowserElementRef>>();

  constructor(options: BrowserSessionOptions) {
    this.stabilityDelayMs = options.stabilityDelayMs ?? 300;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  async navigate(url: string, key: string, signal?: AbortSignal): Promise<BrowserNavigationResult> {
    const page = await this.ensurePage(key, signal);
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: this.timeoutMs, signal });
      throwIfAborted(signal);
      await this.waitForStability(page, signal);
      return { url: page.url(), title: await page.title() };
    } catch (error) {
      if (isAbortError(error) || signal?.aborted) {
        await this.closePage(key);
        throw abortError();
      }
      throw error;
    }
  }

  async snapshot(key: string, signal?: AbortSignal): Promise<BrowserSnapshotResult> {
    throwIfAborted(signal);
    const page = await this.ensurePage(key, signal);
    const text = await page
      .locator('body')
      .innerText()
      .catch(() => '');
    return { url: page.url(), title: await page.title(), text };
  }

  async screenshot(key: string, signal?: AbortSignal): Promise<BrowserScreenshotResult> {
    throwIfAborted(signal);
    const page = await this.ensurePage(key, signal);
    const bytes = await page.screenshot({ type: 'png', fullPage: true });
    return {
      url: page.url(),
      width: page.viewportSize()?.width ?? 1280,
      height: page.viewportSize()?.height ?? 800,
      bytes: new Uint8Array(bytes),
    };
  }

  async click(selector: string, point: BrowserPoint | undefined, key: string, signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    const page = await this.ensurePage(key, signal);
    if (point) {
      await page.mouse.click(point.x, point.y);
    } else {
      await page.locator(selector).click();
    }
  }

  async type(selector: string, text: string, submit: boolean, key: string, signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    const page = await this.ensurePage(key, signal);
    await page.locator(selector).fill(text);
    if (submit) await page.keyboard.press('Enter');
  }

  async observe(key: string, signal?: AbortSignal): Promise<BrowserObserveResult> {
    throwIfAborted(signal);
    const page = await this.ensurePage(key, signal);
    const elements = await this.collectInteractiveElements(page);
    return {
      url: page.url(),
      title: await page.title(),
      observationId: `obs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      elements,
    };
  }

  async clickRef(ref: string, key: string, signal?: AbortSignal): Promise<void> {
    throw new Error('clickRef must be called through BrowserSession');
  }

  async typeRef(_ref: string, _text: string, _submit: boolean, _key: string, _signal?: AbortSignal): Promise<void> {
    throw new Error('typeRef must be called through BrowserSession');
  }

  async scroll(direction: 'up' | 'down', amount: number, key: string, signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    const page = await this.ensurePage(key, signal);
    const delta = direction === 'up' ? -amount : amount;
    await page.mouse.wheel(0, delta);
  }

  async back(key: string, signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    const page = await this.ensurePage(key, signal);
    await page.goBack();
  }

  async forward(key: string, signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    const page = await this.ensurePage(key, signal);
    await page.goForward();
  }

  async reload(key: string, signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    const page = await this.ensurePage(key, signal);
    await page.reload();
    await this.waitForStability(page, signal);
  }

  async waitForNavigation(key: string, signal?: AbortSignal): Promise<BrowserNavigationResult> {
    throwIfAborted(signal);
    const page = await this.ensurePage(key, signal);
    await page.waitForLoadState('networkidle');
    await this.waitForStability(page, signal);
    return { url: page.url(), title: await page.title() };
  }

  async close(key?: string): Promise<void> {
    if (key) {
      await this.closePage(key);
      this.elementObservations.delete(key);
      if (this.pages.size === 0) await this.closeBrowser();
      return;
    }
    for (const pageKey of [...this.pages.keys()]) await this.closePage(pageKey);
    this.elementObservations.clear();
    await this.closeBrowser();
  }

  private async closePage(key: string): Promise<void> {
    const page = this.pages.get(key);
    if (!page) return;
    this.pages.delete(key);
    await page.close().catch(() => {});
  }

  private async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = undefined;
    }
  }

  private async waitForStability(page: Page, signal?: AbortSignal): Promise<void> {
    if (!signal) {
      await page.waitForTimeout(this.stabilityDelayMs);
      return;
    }
    await Promise.race([
      page.waitForTimeout(this.stabilityDelayMs),
      new Promise<never>((_, reject) => {
        signal.addEventListener('abort', () => reject(abortError()), { once: true });
      }),
    ]);
  }

  private async ensurePage(key: string, signal?: AbortSignal): Promise<Page> {
    throwIfAborted(signal);
    let page = this.pages.get(key);
    if (page?.isClosed()) {
      this.pages.delete(key);
      page = undefined;
    }
    if (!page) {
      if (!this.browser) {
        const { chromium } = await import('playwright');
        this.browser = await chromium.launch();
      }
      page = await this.browser.newPage();
      this.pages.set(key, page);
    }
    return page;
  }

  private async collectInteractiveElements(page: Page): Promise<BrowserElementRef[]> {
    const refs: BrowserElementRef[] = [];
    const seen = new Set<string>();

    for (const role of INTERACTIVE_ARIA_ROLES) {
      try {
        const locator = page.getByRole(role as Parameters<Page['getByRole']>[0]);
        const count = await locator.count();
        for (let i = 0; i < count; i++) {
          const el = locator.nth(i);
          const name = (await el.getAttribute('aria-label')) ?? (await el.textContent()) ?? '';
          const key = `${role}:${name.trim()}`;
          if (seen.has(key)) continue;
          seen.add(key);

          const disabled = await el.isDisabled().catch(() => false);
          const focused = (await page.evaluate((e) => e === document.activeElement, await el.elementHandle())) ?? false;

          let checked: boolean | undefined;
          let expanded: boolean | undefined;
          let level: number | undefined;
          let value: string | undefined;

          if (role === 'checkbox' || role === 'radio') {
            checked = await el.isChecked().catch(() => undefined);
          }
          if (role === 'combobox' || role === 'slider') {
            value = await el.inputValue().catch(() => undefined);
          }
          const ariaExpanded = await el.getAttribute('aria-expanded');
          if (ariaExpanded !== null) expanded = ariaExpanded === 'true';
          const ariaLevel = await el.getAttribute('aria-level');
          if (ariaLevel !== null) level = Number.parseInt(ariaLevel, 10);

          refs.push({
            ref: `ref-${refs.length}`,
            role,
            name: name.trim(),
            disabled: disabled || undefined,
            focused: focused || undefined,
            checked,
            expanded,
            level,
            value,
          });
        }
      } catch {
        // Role not supported in this Playwright version — skip silently.
      }
    }

    return refs;
  }
}

/**
 * Shared browser session used by the browser.* tools. Owns the navigation and
 * information policies; every action delegates to the injected driver, scoped
 * to a session key so each agent:task owns isolated browser state.
 */
export class BrowserSession {
  private readonly lastUrlByKey = new Map<string, string>();
  private readonly traceByKey = new Map<string, BrowserReplayStep[]>();
  private readonly observer = new BrowserObserver();

  constructor(
    private readonly driver: BrowserDriver,
    private readonly options: BrowserSessionOptions,
  ) {}

  get driverId(): string {
    return this.driver.id;
  }

  get elementObserver(): BrowserObserver {
    return this.observer;
  }

  resolveUrl(raw: string): string {
    const policyOrigins = (this.options.originPolicies ?? []).map((policy) => policy.origin);
    const allowed = [...(this.options.allowedOrigins ?? []), ...policyOrigins];
    return resolveBrowserUrl(this.options.baseUrl, allowed, raw);
  }

  async navigate(raw: string, key: string, signal?: AbortSignal): Promise<BrowserNavigationResult> {
    const result = await this.driver.navigate(this.resolveUrl(raw), key, signal);
    this.lastUrlByKey.set(key, result.url);
    this.appendTrace(key, { type: 'run-scenario', target: result.url, command: `navigate ${raw.trim()}` });
    return result;
  }

  async snapshot(key: string, signal?: AbortSignal): Promise<BrowserSnapshotResult> {
    const result = await this.driver.snapshot(key, signal);
    this.lastUrlByKey.set(key, result.url);
    return result;
  }

  async screenshot(key: string, signal?: AbortSignal): Promise<BrowserScreenshotResult> {
    return this.driver.screenshot(key, signal);
  }

  async click(selector: string, point: BrowserPoint | undefined, key: string, signal?: AbortSignal): Promise<void> {
    await this.driver.click(selector, point, key, signal);
    this.appendTrace(key, {
      type: 'run-scenario',
      target: this.lastUrlByKey.get(key) ?? this.options.baseUrl,
      command: point ? `click ${point.x},${point.y}` : `click ${selector}`,
    });
  }

  async type(selector: string, text: string, submit: boolean, key: string, signal?: AbortSignal): Promise<void> {
    await this.driver.type(selector, text, submit, key, signal);
    this.appendTrace(key, {
      type: 'run-scenario',
      target: this.lastUrlByKey.get(key) ?? this.options.baseUrl,
      command: submit ? `type ${selector} (submit)` : `type ${selector}`,
    });
  }

  async observe(key: string, signal?: AbortSignal): Promise<BrowserObserveResult> {
    const observationId = this.observer.nextObservationId();
    const result = await this.driver.observe(key, signal);
    // Replace driver-generated ID with session-managed sequential ID
    const sessionResult: BrowserObserveResult = { ...result, observationId };
    this.observer.store(sessionResult);
    return sessionResult;
  }

  async clickRef(observationId: string, ref: string, key: string, signal?: AbortSignal): Promise<void> {
    const resolved = this.observer.resolveElementRef(observationId, ref);
    if (!resolved) {
      const error = new Error(
        this.observer.hasObservation(observationId)
          ? `STALE_ELEMENT_REFERENCE: ref "${ref}" not found in observation "${observationId}"`
          : `STALE_ELEMENT_REFERENCE: observation "${observationId}" not found — observe again`,
      );
      error.name = 'StaleElementReferenceError';
      throw error;
    }
    await this.driver.clickRef(ref, key, signal);
    this.appendTrace(key, {
      type: 'run-scenario',
      target: this.lastUrlByKey.get(key) ?? this.options.baseUrl,
      command: `click ref=${ref} (${resolved.element.role} "${resolved.element.name}")`,
    });
  }

  async typeRef(
    observationId: string,
    ref: string,
    text: string,
    submit: boolean,
    key: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const resolved = this.observer.resolveElementRef(observationId, ref);
    if (!resolved) {
      const error = new Error(
        this.observer.hasObservation(observationId)
          ? `STALE_ELEMENT_REFERENCE: ref "${ref}" not found in observation "${observationId}"`
          : `STALE_ELEMENT_REFERENCE: observation "${observationId}" not found — observe again`,
      );
      error.name = 'StaleElementReferenceError';
      throw error;
    }
    await this.driver.typeRef(ref, text, submit, key, signal);
    this.appendTrace(key, {
      type: 'run-scenario',
      target: this.lastUrlByKey.get(key) ?? this.options.baseUrl,
      command: `type ref=${ref} (${resolved.element.role} "${resolved.element.name}")${submit ? ' (submit)' : ''}`,
    });
  }

  async scroll(direction: 'up' | 'down', amount: number, key: string, signal?: AbortSignal): Promise<void> {
    await this.driver.scroll(direction, amount, key, signal);
    this.appendTrace(key, {
      type: 'run-scenario',
      target: this.lastUrlByKey.get(key) ?? this.options.baseUrl,
      command: `scroll ${direction} ${amount}px`,
    });
  }

  async back(key: string, signal?: AbortSignal): Promise<BrowserNavigationResult> {
    await this.driver.back(key, signal);
    const result = await this.driver.snapshot(key, signal);
    this.lastUrlByKey.set(key, result.url);
    this.appendTrace(key, {
      type: 'run-scenario',
      target: result.url,
      command: 'back',
    });
    return { url: result.url, title: result.title };
  }

  async forward(key: string, signal?: AbortSignal): Promise<BrowserNavigationResult> {
    await this.driver.forward(key, signal);
    const result = await this.driver.snapshot(key, signal);
    this.lastUrlByKey.set(key, result.url);
    this.appendTrace(key, {
      type: 'run-scenario',
      target: result.url,
      command: 'forward',
    });
    return { url: result.url, title: result.title };
  }

  async reload(key: string, signal?: AbortSignal): Promise<BrowserNavigationResult> {
    await this.driver.reload(key, signal);
    const result = await this.driver.snapshot(key, signal);
    this.lastUrlByKey.set(key, result.url);
    this.appendTrace(key, {
      type: 'run-scenario',
      target: result.url,
      command: 'reload',
    });
    return { url: result.url, title: result.title };
  }

  async waitForNavigation(key: string, signal?: AbortSignal): Promise<BrowserNavigationResult> {
    const result = await this.driver.waitForNavigation(key, signal);
    this.lastUrlByKey.set(key, result.url);
    return result;
  }

  async close(key?: string): Promise<void> {
    await this.driver.close(key);
    this.observer.clear();
    if (key) this.traceByKey.delete(key);
  }

  /** The most recently observed page URL for a session key, or the configured base URL. */
  lastKnownUrl(key: string): string {
    return this.lastUrlByKey.get(key) ?? this.options.baseUrl;
  }

  /** The recorded interaction trace for a session key (ENG-008 — shared evidence contract). */
  traceFor(key: string): readonly BrowserReplayStep[] {
    return this.traceByKey.get(key) ?? [];
  }

  /**
   * PCS-026 replay descriptor for the session key's interaction sequence.
   * Execution replay claims only the captured dependency (Chromium runtime); all
   * else is left to the evidence bundle's limitations.
   */
  replayDescriptor(key: string): BrowserReplayDescriptor {
    return {
      mode: 'execution',
      steps: this.traceFor(key),
      requires: { runtime: 'playwright-chromium' },
    };
  }

  private appendTrace(key: string, step: BrowserReplayStep): void {
    const trace = this.traceByKey.get(key) ?? [];
    trace.push(step);
    this.traceByKey.set(key, trace);
  }

  /** Resolve the information policy that governs a target URL (ENG-007). */
  policyFor(url: string): ResolvedPolicy {
    const target = url || this.options.baseUrl;
    const parsed = new URL(target);
    const policy = (this.options.originPolicies ?? []).find((entry) => originMatches(entry.origin, parsed.origin));
    const classification = policy?.classification ?? this.options.classification ?? 'internal';
    return {
      origin: parsed.origin,
      route: parsed.pathname,
      classification,
      informationRisk: informationRiskFor(classification),
      retentionPolicy: policy?.retentionPolicy ?? this.options.retentionPolicy ?? 'workspace-default',
      redaction: policy?.redaction ?? this.options.redaction ?? 'off',
    };
  }

  /** Apply the resolved redaction mode to snapshot text before it leaves the provider. */
  redactSnapshot(text: string, url: string): { readonly text: string; readonly redactionStatus: RedactionStatus } {
    const { redaction } = this.policyFor(url);
    if (redaction === 'full') return { text: '[REDACTED — full redaction policy]', redactionStatus: 'redacted' };
    if (redaction === 'secrets') return { text: redactText(text), redactionStatus: 'redacted' };
    return { text, redactionStatus: 'unredacted' };
  }

  /** Governance metadata for an evidence artifact, per ENG-007. */
  governance(
    url: string,
    requestingAgent: string,
    redactionStatus: RedactionStatus = 'unredacted',
  ): EvidenceGovernance {
    const policy = this.policyFor(url);
    return {
      origin: policy.origin,
      route: policy.route,
      classification: policy.classification,
      informationRisk: policy.informationRisk,
      redactionStatus,
      retentionPolicy: policy.retentionPolicy,
      requestingAgent,
    };
  }
}
