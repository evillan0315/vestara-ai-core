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
  BROWSER_NAVIGATION_COMPLETED,
  BROWSER_NAVIGATION_STARTED,
  BROWSER_OBSERVATION_CREATED,
  BROWSER_SESSION_CREATED,
  BROWSER_SESSION_ERROR,
  BROWSER_SESSION_READY,
  BROWSER_SESSION_STOPPED,
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
}

// ─── Managed session info ───────────────────────────────────

export interface ManagedBrowserSession {
  readonly id: string;
  readonly ownerId: string;
  readonly session: BrowserSession;
  readonly observer: BrowserObserver;
  status: 'active' | 'idle' | 'closed';
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
      defaultBaseUrl: options.defaultBaseUrl ?? 'about:blank',
      allowedOrigins: options.allowedOrigins ?? ['*'],
      ...options,
    };
  }

  get status(): ServiceStatus {
    return this._status;
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
  }

  async stop(): Promise<void> {
    this._status = 'stopping';
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

    const options: BrowserSessionOptions = {
      baseUrl: sessionOptions?.baseUrl ?? this.options.defaultBaseUrl,
      allowedOrigins: sessionOptions?.allowedOrigins ?? this.options.allowedOrigins,
      ...sessionOptions,
      ...this.options.sessionOptions,
    };

    const driver = new PlaywrightBrowserDriver(options);
    const session = new BrowserSession(driver, options);
    const observer = new BrowserObserver();

    const managed: ManagedBrowserSession = {
      id: sessionId,
      ownerId,
      session,
      observer,
      status: 'active',
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
    return this.sessions.get(sessionId) ?? this.createSession(ownerId, taskId, sessionOptions);
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

  // ─── Permission enforcement ─────────────────────────────

  /**
   * Evaluate whether a browser action is permitted for a given session.
   * Returns the permission level ('allow', 'ask', 'deny').
   */
  checkPermission(action: string): BrowserPermissionLevel {
    const rule = evaluateBrowserPermission(action, this.options.permissionRules ?? DEFAULT_BROWSER_PERMISSIONS);
    return rule.level;
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

  // ─── Private helpers ────────────────────────────────────

  private touchSession(sessionId: string): void {
    const managed = this.sessions.get(sessionId);
    if (managed) {
      managed.lastActivityAt = new Date().toISOString();
    }
  }

  private async emit(type: string, payload: Record<string, unknown>): Promise<void> {
    await this.options.eventBus?.emit({
      type,
      source: this.id,
      actor: { id: this.id, role: 'system' },
      payload: { workspaceId: this.options.workspaceId, ...payload },
      metadata: { correlationId: `browser-${this.options.workspaceId}` },
    });
  }
}
