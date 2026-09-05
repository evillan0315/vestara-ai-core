/**
 * @vestara/browser-runtime — Browser Runtime Service (LB-007)
 *
 * Kernel-level VestaraService that manages browser session lifecycle,
 * emits normalized events to the EventBus, and provides managed access
 * to browser capabilities for the Agent Harness and Browser Agent.
 */

import type { EventBus } from '@vestara/event-bus';
import type { HealthStatus, ServiceStatus, VestaraService } from '@vestara/shared';
import {
  type BrowserNavigationResult,
  type BrowserObserveResult,
  BrowserObserver,
  type BrowserScreenshotResult,
  BrowserSession,
  type BrowserSessionOptions,
  type BrowserSnapshotResult,
  PlaywrightBrowserDriver,
} from '@vestara/tools-browser';
import {
  BROWSER_ACTION_COMPLETED,
  BROWSER_ACTION_FAILED,
  BROWSER_ACTION_STARTED,
  BROWSER_CONTROL_RETURNED,
  BROWSER_CONTROL_TAKEN,
  BROWSER_NAVIGATION_COMPLETED,
  BROWSER_NAVIGATION_STARTED,
  BROWSER_OBSERVATION_CREATED,
  BROWSER_PERMISSION_DENIED,
  BROWSER_PERMISSION_GRANTED,
  BROWSER_PERMISSION_REQUESTED,
  BROWSER_SESSION_CREATED,
  BROWSER_SESSION_ERROR,
  BROWSER_SESSION_READY,
  BROWSER_SESSION_STOPPED,
  BROWSER_STEP_COMPLETED,
  BROWSER_STEP_FAILED,
  BROWSER_STEP_STARTED,
  BROWSER_TASK_COMPLETED,
  BROWSER_TASK_FAILED,
  BROWSER_TASK_STARTED,
  BROWSER_VIEWPORT_CAPTURED,
  type BrowserControlMode,
  type BrowserPermissionLevel,
  type BrowserPermissionRule,
  DEFAULT_BROWSER_PERMISSIONS,
  evaluateBrowserPermission,
} from './browser-events';

// ─── Options ────────────────────────────────────────────────

export interface BrowserRuntimeServiceOptions {
  readonly workspaceId: string;
  readonly defaultBaseUrl?: string;
  readonly allowedOrigins?: readonly string[];
  readonly sessionOptions?: Partial<BrowserSessionOptions>;
  readonly eventBus?: EventBus;
  readonly permissionRules?: readonly BrowserPermissionRule[];
  /** Close sessions idle longer than this (ms). 0 disables idle pruning. */
  readonly idleTimeoutMs?: number;
  /** Maximum number of concurrent managed sessions. 0 disables the limit. */
  readonly maxSessions?: number;
  /** Driver factory — defaults to Playwright; injectable for tests. */
  readonly driverFactory?: (options: BrowserSessionOptions) => import('@vestara/tools-browser').BrowserDriver;
}

// ─── Managed session info ───────────────────────────────────

export interface ManagedBrowserSession {
  readonly id: string;
  readonly ownerId: string;
  readonly session: BrowserSession;
  readonly observer: BrowserObserver;
  status: 'active' | 'idle' | 'closed';
  /** Who currently controls the browser (agent by default). */
  controlMode: BrowserControlMode;
  createdAt: string;
  lastActivityAt: string;
}

// ─── Runtime stats ──────────────────────────────────────────

export interface BrowserRuntimeStats {
  readonly totalSessionsCreated: number;
  readonly activeSessions: number;
  readonly totalActions: number;
  readonly totalNavigations: number;
  readonly totalObservations: number;
  readonly errors: number;
  readonly startedAt: string;
  readonly uptime: number;
}

// ─── Authorization decision ─────────────────────────────────

export interface BrowserAuthorizationDecision {
  readonly decision: 'allowed' | 'denied' | 'awaiting-approval';
  readonly level: BrowserPermissionLevel;
  readonly reason?: string;
}

// ─── Service ────────────────────────────────────────────────

/**
 * Browser Runtime Service — a kernel-level VestaraService that owns
 * browser session lifecycle, emits events, and enforces permission policy.
 *
 * Usage:
 * ```ts
 * const runtime = new BrowserRuntimeService({
 *   workspaceId: 'ws-1',
 *   eventBus: kernel.eventBus,
 * });
 * await runtime.initialize();
 * await runtime.start();
 * const session = runtime.createSession('agent-browser', 'task-1', { baseUrl: 'https://example.com' });
 * ```
 */
export class BrowserRuntimeService implements VestaraService {
  readonly id = 'browser-runtime';
  readonly version = '0.1.0';

  private _status: ServiceStatus = 'uninitialized';
  private readonly startedAt = Date.now();
  private readonly sessions = new Map<string, ManagedBrowserSession>();
  private readonly pendingApprovals = new Set<string>();
  private _eventBus?: EventBus;
  private idleTimer?: ReturnType<typeof setInterval>;
  private readonly options: Required<
    Pick<BrowserRuntimeServiceOptions, 'workspaceId' | 'defaultBaseUrl' | 'allowedOrigins'>
  > &
    Omit<BrowserRuntimeServiceOptions, 'workspaceId' | 'defaultBaseUrl' | 'allowedOrigins'>;

  private stats = {
    totalSessionsCreated: 0,
    totalActions: 0,
    totalNavigations: 0,
    totalObservations: 0,
    errors: 0,
  };

  constructor(options: BrowserRuntimeServiceOptions) {
    this.options = {
      ...options,
      defaultBaseUrl: options.defaultBaseUrl ?? 'about:blank',
      allowedOrigins: options.allowedOrigins?.length ? options.allowedOrigins : ['*'],
    };
    this._eventBus = options.eventBus;
  }

  get status(): ServiceStatus {
    return this._status;
  }

  /**
   * Inject the event bus after construction (e.g. after the kernel boots,
   * since `kernel.eventBus` is unavailable until then). Follows the
   * `hostRuntime.setEventBus` pattern.
   */
  setEventBus(eventBus?: EventBus): void {
    this._eventBus = eventBus;
  }

  // ─── Lifecycle ──────────────────────────────────────────

  async initialize(): Promise<void> {
    this._status = 'initializing';
    this._status = 'initialized';
  }

  async start(): Promise<void> {
    if (this._status === 'uninitialized') await this.initialize();
    this._status = 'starting';
    await this.emit('browser.runtime.started', {});
    this._status = 'running';
    this.startIdlePruning();
  }

  async stop(): Promise<void> {
    this._status = 'stopping';
    this.stopIdlePruning();
    // Close all active sessions
    for (const [id, managed] of this.sessions) {
      if (managed.status !== 'closed') {
        try {
          await managed.session.close();
          managed.status = 'closed';
        } catch {
          // Ignore close errors during shutdown
        }
        await this.emit(BROWSER_SESSION_STOPPED, { sessionId: id });
      }
    }
    this._status = 'stopped';
  }

  async dispose(): Promise<void> {
    await this.stop();
    this.sessions.clear();
    this._status = 'disposed';
  }

  async health(): Promise<HealthStatus> {
    const activeSessions = [...this.sessions.values()].filter((s) => s.status !== 'closed').length;
    const hasErrors = this.stats.errors > 0;
    return {
      status: hasErrors ? 'degraded' : 'healthy',
      serviceId: this.id,
      version: this.version,
      uptime: Date.now() - this.startedAt,
      lastHealthCheck: new Date().toISOString(),
      dependencies: [],
      message: hasErrors ? `${this.stats.errors} errors recorded` : undefined,
    };
  }

  // ─── Session management ─────────────────────────────────

  /**
   * Create a new managed browser session. The session is isolated by
   * ownerId and can be retrieved later via `getSession()`.
   */
  createSession(
    ownerId: string,
    taskId: string,
    sessionOptions?: Partial<BrowserSessionOptions>,
  ): ManagedBrowserSession {
    const sessionId = `${ownerId}:${taskId}`;
    const existing = this.sessions.get(sessionId);
    if (existing && existing.status !== 'closed') {
      return existing;
    }

    const maxSessions = this.options.maxSessions ?? 0;
    const activeCount = [...this.sessions.values()].filter((s) => s.status !== 'closed').length;
    if (maxSessions > 0 && activeCount >= maxSessions) {
      throw new Error(`Browser session limit reached (${maxSessions} active sessions)`);
    }

    const options: BrowserSessionOptions = {
      ...sessionOptions,
      ...this.options.sessionOptions,
      baseUrl: sessionOptions?.baseUrl ?? this.options.defaultBaseUrl,
      allowedOrigins: sessionOptions?.allowedOrigins?.length
        ? sessionOptions.allowedOrigins
        : this.options.allowedOrigins,
    };

    const driver = (this.options.driverFactory ?? ((driverOptions) => new PlaywrightBrowserDriver(driverOptions)))(
      options,
    );
    const session = new BrowserSession(driver, options);
    const observer = new BrowserObserver();

    const managed: ManagedBrowserSession = {
      id: sessionId,
      ownerId,
      session,
      observer,
      status: 'active',
      controlMode: 'agent',
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
    };

    this.sessions.set(sessionId, managed);
    this.stats.totalSessionsCreated++;

    this.emit(BROWSER_SESSION_CREATED, {
      sessionId,
      ownerId,
      taskId,
      baseUrl: options.baseUrl,
    });

    this.emit(BROWSER_SESSION_READY, { sessionId });

    return managed;
  }

  /**
   * Retrieve a managed session by its ID.
   */
  getSession(sessionId: string): ManagedBrowserSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Retrieve or create a session for an agent:task pair.
   */
  getOrCreateSession(
    ownerId: string,
    taskId: string,
    sessionOptions?: Partial<BrowserSessionOptions>,
  ): ManagedBrowserSession {
    const sessionId = `${ownerId}:${taskId}`;
    const existing = this.sessions.get(sessionId);
    if (existing && existing.status !== 'closed') return existing;
    return this.createSession(ownerId, taskId, sessionOptions);
  }

  /**
   * Close a specific session.
   */
  async closeSession(sessionId: string): Promise<void> {
    const managed = this.sessions.get(sessionId);
    if (!managed || managed.status === 'closed') return;

    try {
      await managed.session.close();
    } catch {
      // Ignore close errors
    }
    managed.status = 'closed';
    this.emit(BROWSER_SESSION_STOPPED, { sessionId });
  }

  // ─── Permission authorization (LB-012) ───────────────────

  /**
   * Evaluate whether a browser action is permitted for a given session.
   * Returns the permission level ('allow', 'ask', 'deny').
   */
  checkPermission(action: string): BrowserPermissionLevel {
    const rule = evaluateBrowserPermission(action, this.options.permissionRules ?? DEFAULT_BROWSER_PERMISSIONS);
    return rule.level;
  }

  /**
   * Authorize a browser action for a session.
   *
   * - `allow` → immediately `allowed`
   * - `deny` → immediately `denied`
   * - `ask` → emits `browser.permission.requested`; returns `awaiting-approval`
   *   unless `autoApprove` is set, in which case it is granted immediately.
   */
  async authorizeAction(
    action: string,
    sessionId: string,
    options: { readonly autoApprove?: boolean; readonly reason?: string } = {},
  ): Promise<BrowserAuthorizationDecision> {
    const rule = evaluateBrowserPermission(action, this.options.permissionRules ?? DEFAULT_BROWSER_PERMISSIONS);
    if (rule.level === 'deny') {
      return { decision: 'denied', level: 'deny', reason: rule.reason ?? 'Denied by policy' };
    }
    if (rule.level === 'allow') {
      this.touchSession(sessionId);
      return { decision: 'allowed', level: 'allow', reason: rule.reason };
    }
    // ask
    const approvalKey = `${sessionId}:${action}`;
    await this.emit(BROWSER_PERMISSION_REQUESTED, {
      sessionId,
      action,
      reason: options.reason ?? rule.reason ?? 'Requires user confirmation',
    });
    if (options.autoApprove) {
      this.pendingApprovals.delete(approvalKey);
      await this.emit(BROWSER_PERMISSION_GRANTED, { sessionId, action, auto: true });
      this.touchSession(sessionId);
      return { decision: 'allowed', level: 'ask', reason: rule.reason };
    }
    this.pendingApprovals.add(approvalKey);
    return { decision: 'awaiting-approval', level: 'ask', reason: rule.reason };
  }

  /**
   * Grant a pending approval request for a session action.
   * Returns true if the request was pending and was granted.
   */
  async approveAction(sessionId: string, action: string): Promise<boolean> {
    const approvalKey = `${sessionId}:${action}`;
    if (!this.pendingApprovals.has(approvalKey)) return false;
    this.pendingApprovals.delete(approvalKey);
    await this.emit(BROWSER_PERMISSION_GRANTED, { sessionId, action });
    this.touchSession(sessionId);
    return true;
  }

  /**
   * Deny a pending approval request for a session action.
   * Returns true if the request was pending and was denied.
   */
  async denyAction(sessionId: string, action: string): Promise<boolean> {
    const approvalKey = `${sessionId}:${action}`;
    if (!this.pendingApprovals.has(approvalKey)) return false;
    this.pendingApprovals.delete(approvalKey);
    await this.emit(BROWSER_PERMISSION_DENIED, { sessionId, action });
    return true;
  }

  /** True when a session action currently has a pending approval request. */
  hasPendingApproval(sessionId: string, action: string): boolean {
    return this.pendingApprovals.has(`${sessionId}:${action}`);
  }

  // ─── Human takeover (LB-013) ─────────────────────────────

  /**
   * A human takes control of the browser session. Agent execution should
   * pause; element references are invalidated because the human may change
   * browser state.
   */
  takeControl(sessionId: string): void {
    const managed = this.sessions.get(sessionId);
    if (!managed || managed.status === 'closed') throw new Error(`Session not found: ${sessionId}`);
    managed.controlMode = 'human';
    // Invalidate all prior observation state — the human may have changed the page.
    managed.observer.clear();
    managed.session.elementObserver.clear();
    this.touchSession(sessionId);
    this.emit(BROWSER_CONTROL_TAKEN, { sessionId });
  }

  /**
   * Control returns to the agent. The agent must observe the page again
   * before acting, since the human may have changed browser state.
   */
  returnControl(sessionId: string): void {
    const managed = this.sessions.get(sessionId);
    if (!managed || managed.status === 'closed') throw new Error(`Session not found: ${sessionId}`);
    managed.controlMode = 'agent';
    managed.observer.clear();
    managed.session.elementObserver.clear();
    this.touchSession(sessionId);
    this.emit(BROWSER_CONTROL_RETURNED, { sessionId });
  }

  /** True when a human currently controls the session. */
  isHumanControlled(sessionId: string): boolean {
    return this.sessions.get(sessionId)?.controlMode === 'human';
  }

  /**
   * Guard for agent execution: throws if a human currently controls the
   * session. Call before any agent-driven browser action.
   */
  assertAgentControl(sessionId: string): void {
    if (this.isHumanControlled(sessionId)) {
      throw new Error(`Agent cannot act while human controls session: ${sessionId}`);
    }
  }

  // ─── Session lifecycle hardening (LB-018) ────────────────

  /**
   * Close sessions idle longer than `maxIdleMs`. Uses the configured
   * `idleTimeoutMs` when no argument is given.
   */
  async closeIdleSessions(maxIdleMs?: number): Promise<string[]> {
    const threshold = maxIdleMs ?? this.options.idleTimeoutMs ?? 0;
    if (threshold <= 0) return [];
    const now = Date.now();
    const closed: string[] = [];
    for (const [sessionId, managed] of this.sessions) {
      if (managed.status === 'closed') continue;
      const idle = now - new Date(managed.lastActivityAt).getTime();
      if (idle >= threshold) {
        await this.closeSession(sessionId);
        closed.push(sessionId);
      }
    }
    return closed;
  }

  /**
   * Recovery path: replace a closed or failed session with a fresh one.
   * Returns the new managed session.
   */
  recoverSession(
    ownerId: string,
    taskId: string,
    sessionOptions?: Partial<BrowserSessionOptions>,
  ): ManagedBrowserSession {
    const sessionId = `${ownerId}:${taskId}`;
    const existing = this.sessions.get(sessionId);
    if (existing && existing.status !== 'closed') {
      return existing;
    }
    if (existing) {
      this.sessions.delete(sessionId);
    }
    return this.createSession(ownerId, taskId, sessionOptions);
  }

  // ─── Stats ──────────────────────────────────────────────

  getStats(): BrowserRuntimeStats {
    const activeSessions = [...this.sessions.values()].filter((s) => s.status !== 'closed').length;
    return {
      ...this.stats,
      activeSessions,
      startedAt: new Date(this.startedAt).toISOString(),
      uptime: Date.now() - this.startedAt,
    };
  }

  /**
   * Get all managed sessions (for UI projection / Activity Room).
   */
  listSessions(): readonly ManagedBrowserSession[] {
    return [...this.sessions.values()];
  }

  // ─── Event emission ─────────────────────────────────────

  /** Record an action started (updates stats + emits event). */
  recordActionStarted(sessionId: string, action: string, details: Record<string, unknown> = {}): void {
    this.stats.totalActions++;
    this.touchSession(sessionId);
    this.emit(BROWSER_ACTION_STARTED, { sessionId, action, ...details });
  }

  /** Record an action completed. */
  recordActionCompleted(sessionId: string, action: string, details: Record<string, unknown> = {}): void {
    this.touchSession(sessionId);
    this.emit(BROWSER_ACTION_COMPLETED, { sessionId, action, ...details });
  }

  /** Record an action failed. */
  recordActionFailed(sessionId: string, action: string, error: string, details: Record<string, unknown> = {}): void {
    this.stats.errors++;
    this.touchSession(sessionId);
    this.emit(BROWSER_ACTION_FAILED, { sessionId, action, error, ...details });
  }

  /** Record a navigation started. */
  recordNavigationStarted(sessionId: string, url: string): void {
    this.stats.totalNavigations++;
    this.touchSession(sessionId);
    this.emit(BROWSER_NAVIGATION_STARTED, { sessionId, url });
  }

  /** Record a navigation completed. */
  recordNavigationCompleted(sessionId: string, url: string, title: string): void {
    this.touchSession(sessionId);
    this.emit(BROWSER_NAVIGATION_COMPLETED, { sessionId, url, title });
  }

  /** Record an observation created. */
  recordObservationCreated(sessionId: string, observationId: string, elementCount: number): void {
    this.stats.totalObservations++;
    this.touchSession(sessionId);
    this.emit(BROWSER_OBSERVATION_CREATED, { sessionId, observationId, elementCount });
  }

  // ─── Live viewport streaming ─────────────────────────────

  /**
   * Publish a fresh viewport capture to the event bus / WS clients.
   * `dataUrl` is a `data:image/png;base64,...` string so the UI can render
   * the live browser surface without polling.
   */
  recordViewportCaptured(sessionId: string, url: string, width: number, height: number, dataUrl: string): void {
    this.touchSession(sessionId);
    this.emit(BROWSER_VIEWPORT_CAPTURED, { sessionId, url, width, height, dataUrl });
  }

  // ─── Task + step recording (LB-011) ─────────────────────

  /** Record a task started. */
  recordTaskStarted(taskId: string, sessionId: string, objective: string): void {
    this.touchSession(sessionId);
    this.emit(BROWSER_TASK_STARTED, { taskId, sessionId, objective });
  }

  /** Record a step started. */
  recordStepStarted(sessionId: string, taskId: string, stepId: string, index: number, description: string): void {
    this.touchSession(sessionId);
    this.emit(BROWSER_STEP_STARTED, { sessionId, taskId, stepId, index, description });
  }

  /** Record a step completed. */
  recordStepCompleted(sessionId: string, taskId: string, stepId: string, index: number, description: string): void {
    this.touchSession(sessionId);
    this.emit(BROWSER_STEP_COMPLETED, { sessionId, taskId, stepId, index, description });
  }

  /** Record a step failed. */
  recordStepFailed(sessionId: string, taskId: string, stepId: string, index: number, error: string): void {
    this.stats.errors++;
    this.touchSession(sessionId);
    this.emit(BROWSER_STEP_FAILED, { sessionId, taskId, stepId, index, error });
  }

  /** Record a task completed. */
  recordTaskCompleted(taskId: string, sessionId: string, summary: Readonly<Record<string, unknown>>): void {
    this.touchSession(sessionId);
    this.emit(BROWSER_TASK_COMPLETED, { taskId, sessionId, summary });
  }

  /** Record a task failed. */
  recordTaskFailed(taskId: string, sessionId: string, error: string): void {
    this.stats.errors++;
    this.touchSession(sessionId);
    this.emit(BROWSER_TASK_FAILED, { taskId, sessionId, error });
  }

  // ─── Private helpers ────────────────────────────────────

  private startIdlePruning(): void {
    this.stopIdlePruning();
    if (!this.options.idleTimeoutMs || this.options.idleTimeoutMs <= 0) return;
    const period = Math.min(this.options.idleTimeoutMs, 60_000);
    this.idleTimer = setInterval(() => {
      void this.closeIdleSessions();
    }, period);
  }

  private stopIdlePruning(): void {
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = undefined;
    }
  }

  private touchSession(sessionId: string): void {
    const managed = this.sessions.get(sessionId);
    if (managed) {
      managed.lastActivityAt = new Date().toISOString();
    }
  }

  private async emit(type: string, payload: Record<string, unknown>): Promise<void> {
    await this._eventBus?.emit({
      type,
      source: this.id,
      actor: { id: this.id, role: 'system' },
      payload: { workspaceId: this.options.workspaceId, ...payload },
      metadata: { correlationId: `browser-${this.options.workspaceId}` },
    });
  }
}
