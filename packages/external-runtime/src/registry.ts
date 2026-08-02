/**
 * ExternalRuntimeRegistry — orchestrates external coding-agent runtimes.
 *
 * Registers adapters, runs workspace discovery, tracks runtime instances and
 * connection state, prevents duplicates, refreshes snapshots, subscribes to
 * supported live event sources, normalizes events, reconnects with bounded
 * exponential backoff, and shuts down cleanly. Degrades gracefully: runtime
 * failures never block workspace startup.
 */

import type { ExternalAgentRuntimeAdapter } from './adapter';
import type {
  AdapterCapabilityStatus,
  ExternalRuntimeCapability,
  ExternalRuntimeConnection,
  ExternalRuntimeConnectionStatus,
  ExternalRuntimeEvent,
  ExternalRuntimeEventObserver,
  ExternalRuntimeInstance,
  ExternalRuntimeIntegrationLevel,
  ExternalRuntimeTarget,
  ExternalRuntimeType,
  ExternalSessionQuery,
  ExternalSessionSummary,
  RuntimeAdapterVerificationStatus,
} from './types';
import { ExternalAdapterError } from './types';

const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_BACKOFF_MS = 500;
const BACKOFF_FACTOR = 2;

interface TrackedConnection {
  readonly id: string;
  readonly instance: ExternalRuntimeInstance;
  reconnectAttempts: number;
  subscriptionCount: number;
  disconnect: (() => Promise<void>) | null;
}

export interface RegistryObserver {
  onEvent?(event: ExternalRuntimeEvent): void;
  onRuntimeChanged?(instance: ExternalRuntimeInstance): void;
}

export class ExternalRuntimeRegistry {
  private readonly adapters = new Map<ExternalRuntimeType, ExternalAgentRuntimeAdapter>();
  private readonly instances = new Map<string, ExternalRuntimeInstance>();
  private readonly connections = new Map<string, TrackedConnection>();
  private readonly observers: RegistryObserver[] = [];
  private readonly retryTimers = new Set<ReturnType<typeof setTimeout>>();
  private closed = false;

  constructor(
    private readonly workspacePath: string,
    private readonly workspaceId?: string,
  ) {}

  registerAdapter(adapter: ExternalAgentRuntimeAdapter): void {
    this.adapters.set(adapter.runtimeType, adapter);
  }

  hasAdapter(runtimeType: ExternalRuntimeType): boolean {
    return this.adapters.has(runtimeType);
  }

  observe(observer: RegistryObserver): void {
    this.observers.push(observer);
  }

  // ─── Discovery ──────────────────────────────────────────────

  /** Run detection for all registered adapters; never throws. */
  async discover(): Promise<readonly ExternalRuntimeInstance[]> {
    const detected: ExternalRuntimeInstance[] = [];
    for (const adapter of this.adapters.values()) {
      const now = new Date().toISOString();
      try {
        const result = await adapter.detect({
          workspacePath: this.workspacePath,
          workspaceId: this.workspaceId,
          timeoutMs: 3000,
        });
        if (!result.detected) continue;
        const id = `${result.runtimeType}-${now}-${Math.random().toString(36).slice(2, 6)}`;
        const supported = [...adapter.capabilities];
        const instance: ExternalRuntimeInstance = {
          id,
          runtimeType: result.runtimeType,
          displayName: displayNameFor(result.runtimeType),
          version: result.version,
          executablePath: result.executablePath,
          serverUrl: result.serverUrl,
          processId: result.runningProcesses[0],
          workspacePath: this.workspacePath,
          connectionStatus: 'discovered',
          // Honest default: integration level reflects what was actually
          // exercised, not what the adapter supports. Upgraded on verify().
          integrationLevel: 'discovery-only',
          supportedCapabilities: supported,
          availableCapabilities: [],
          verificationStatus: 'unit-tested',
          discoveredAt: now,
          lastSeenAt: now,
          capabilities: supported,
          isPrimary: result.runtimeType === 'opencode',
          isSecondary: result.runtimeType !== 'opencode',
        };
        this.instances.set(id, instance);
        detected.push(instance);
        this.emitRuntimeChanged(instance);
        this.emit({
          id: `ext-${now}-${Math.random().toString(36).slice(2, 8)}`,
          schemaVersion: 1,
          category: 'runtime',
          type: 'external-runtime.discovered',
          runtimeType: instance.runtimeType,
          runtimeInstanceId: instance.id,
          workspaceId: this.workspaceId,
          ingestedAt: now,
          payload: {
            displayName: instance.displayName,
            version: instance.version,
            integrationLevel: instance.integrationLevel,
            verificationStatus: instance.verificationStatus,
          },
          provenance: 'resolved',
          observationLevel: 'observed',
          idempotencyKey: `discovered-${id}`,
        });
      } catch (err) {
        this.emit({
          id: `ext-${now}-${Math.random().toString(36).slice(2, 8)}`,
          schemaVersion: 1,
          category: 'runtime',
          type: 'external-runtime.discovery-failed',
          runtimeType: adapter.runtimeType,
          runtimeInstanceId: `${adapter.runtimeType}-unknown`,
          workspaceId: this.workspaceId,
          ingestedAt: now,
          payload: { error: safeError(err) },
          provenance: 'unknown',
          observationLevel: 'partial',
          idempotencyKey: `discovery-failed-${adapter.runtimeType}-${now}`,
        });
      }
    }
    return detected;
  }

  listInstances(): readonly ExternalRuntimeInstance[] {
    return [...this.instances.values()].sort((a, b) => Number(b.isPrimary ?? false) - Number(a.isPrimary ?? false));
  }

  getInstance(id: string): ExternalRuntimeInstance | null {
    return this.instances.get(id) ?? null;
  }

  // ─── Connection ─────────────────────────────────────────────

  /** Connect to a runtime instance; deduplicates by instance id. */
  async connect(instanceId: string, target?: Partial<ExternalRuntimeTarget>): Promise<ExternalRuntimeConnection> {
    const instance = this.instances.get(instanceId);
    if (!instance) throw new ExternalAdapterError('not-detected', 'unknown', `unknown instance ${instanceId}`);
    const existing = this.connections.get(instanceId);
    if (existing) {
      return {
        id: existing.id,
        runtimeInstanceId: instanceId,
        runtimeType: instance.runtimeType,
        connectedAt: new Date().toISOString(),
        mode: 'server',
      };
    }

    const adapter = this.adapters.get(instance.runtimeType);
    if (!adapter)
      throw new ExternalAdapterError(
        'unsupported-capability',
        instance.runtimeType,
        `no adapter for ${instance.runtimeType}`,
      );

    const connection = await adapter.connect({
      runtimeType: instance.runtimeType,
      executablePath: instance.executablePath,
      serverUrl: instance.serverUrl,
      workspacePath: this.workspacePath,
      ...(target ?? {}),
    });

    this.connections.set(instanceId, {
      id: connection.id,
      instance: { ...instance, connectionStatus: 'connected' },
      reconnectAttempts: 0,
      subscriptionCount: 0,
      disconnect: null,
    });
    this.verify(instanceId, { connectionStatus: 'connected' });
    this.emit({
      id: `ext-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      schemaVersion: 1,
      category: 'runtime',
      type: 'external-runtime.connected',
      runtimeType: instance.runtimeType,
      runtimeInstanceId: instanceId,
      workspaceId: this.workspaceId,
      ingestedAt: new Date().toISOString(),
      payload: { connectionId: connection.id },
      provenance: 'resolved',
      observationLevel: 'observed',
      idempotencyKey: `connected-${instanceId}-${connection.id}`,
    });
    return connection;
  }

  async disconnect(instanceId: string): Promise<void> {
    const tracked = this.connections.get(instanceId);
    if (!tracked) return;
    await tracked.disconnect?.().catch(() => {});
    this.connections.delete(instanceId);
    const instance = this.instances.get(instanceId);
    if (instance) this.instances.set(instanceId, { ...instance, connectionStatus: 'disconnected' });
  }

  isConnected(instanceId: string): boolean {
    return this.connections.has(instanceId);
  }

  /** Adapter registered for a runtime type (undefined when unknown). */
  adapterFor(runtimeType: ExternalRuntimeType): ExternalAgentRuntimeAdapter | undefined {
    return this.adapters.get(runtimeType);
  }

  /** Connection id for a connected instance (undefined when not connected). */
  connectionIdFor(instanceId: string): string | undefined {
    return this.connections.get(instanceId)?.id;
  }

  /**
   * Upgrade an instance's observed state after evidence is collected.
   * `availableCapabilities` are capabilities actually exercised; the
   * integration level reflects what was actually achieved, not what the
   * adapter supports.
   */
  verify(
    instanceId: string,
    updates: {
      availableCapabilities?: readonly ExternalRuntimeCapability[];
      integrationLevel?: ExternalRuntimeIntegrationLevel;
      verificationStatus?: RuntimeAdapterVerificationStatus;
      connectionStatus?: ExternalRuntimeConnectionStatus;
    },
  ): ExternalRuntimeInstance | null {
    const instance = this.instances.get(instanceId);
    if (!instance) return null;
    const next: ExternalRuntimeInstance = {
      ...instance,
      connectionStatus: updates.connectionStatus ?? instance.connectionStatus,
      integrationLevel: updates.integrationLevel ?? instance.integrationLevel,
      verificationStatus: updates.verificationStatus ?? instance.verificationStatus,
      availableCapabilities: updates.availableCapabilities ?? instance.availableCapabilities,
      lastSeenAt: new Date().toISOString(),
    };
    this.instances.set(instanceId, next);
    this.emitRuntimeChanged(next);
    return next;
  }

  // ─── Live events ────────────────────────────────────────────

  /**
   * Subscribe to an instance's live event source. Prevents duplicate
   * subscriptions per instance and wires reconnection with bounded backoff.
   */
  async subscribe(instanceId: string, observer: ExternalRuntimeEventObserver): Promise<() => void> {
    const tracked = this.connections.get(instanceId);
    if (!tracked)
      throw new ExternalAdapterError(
        'connection-failed',
        this.getInstance(instanceId)?.runtimeType ?? 'unknown',
        `not connected: ${instanceId}`,
      );

    const adapter = this.adapters.get(tracked.instance.runtimeType);
    if (!adapter) throw new ExternalAdapterError('unsupported-capability', tracked.instance.runtimeType, 'no adapter');

    // Re-entrant guard: one live subscription per instance.
    if (tracked.subscriptionCount > 0) {
      return () => {};
    }

    const wrapped: ExternalRuntimeEventObserver = (event) => {
      if (this.closed) return;
      this.emit(event);
      void observer(event);
    };

    const subscription = await adapter.subscribe(tracked.id, wrapped);
    tracked.subscriptionCount += 1;

    const cancelReconnect = () => {
      for (const t of this.retryTimers) clearTimeout(t);
      this.retryTimers.clear();
    };

    // Reconnect-on-disconnect with bounded exponential backoff.
    const scheduleReconnect = () => {
      if (this.closed || tracked.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;
      const delay = INITIAL_BACKOFF_MS * BACKOFF_FACTOR ** tracked.reconnectAttempts;
      const timer = setTimeout(() => {
        this.retryTimers.delete(timer);
        void this.reconnect(instanceId, wrapped).catch(() => {
          tracked.reconnectAttempts += 1;
          scheduleReconnect();
        });
      }, delay);
      this.retryTimers.add(timer);
    };

    tracked.disconnect = async () => {
      cancelReconnect();
      subscription.unsubscribe();
      tracked.subscriptionCount = Math.max(0, tracked.subscriptionCount - 1);
    };

    // Detect disconnects emitted by the adapter stream.
    this.observe({
      onEvent: (event) => {
        if (event.runtimeInstanceId !== instanceId) return;
        if (event.type === 'external-runtime.disconnected' || event.type === 'external-runtime.stream-failed') {
          scheduleReconnect();
        }
      },
    });

    return () => {
      void tracked.disconnect?.();
    };
  }

  private async reconnect(instanceId: string, observer: ExternalRuntimeEventObserver): Promise<void> {
    const tracked = this.connections.get(instanceId);
    const instance = this.getInstance(instanceId);
    if (!tracked || !instance || this.closed) return;
    const adapter = this.adapters.get(instance.runtimeType);
    if (!adapter) return;
    const subscription = await adapter.subscribe(tracked.id, observer);
    tracked.reconnectAttempts = 0;
    tracked.subscriptionCount = Math.max(1, tracked.subscriptionCount);
    tracked.disconnect = async () => {
      subscription.unsubscribe();
      tracked.subscriptionCount = Math.max(0, tracked.subscriptionCount - 1);
    };
    this.verify(instanceId, { connectionStatus: 'connected' });
  }

  // ─── Read APIs ──────────────────────────────────────────────

  async listSessions(query?: ExternalSessionQuery): Promise<readonly ExternalSessionSummary[]> {
    const out: ExternalSessionSummary[] = [];
    for (const tracked of this.connections.values()) {
      const adapter = this.adapters.get(tracked.instance.runtimeType);
      if (!adapter || !adapter.capabilities.includes('session-discovery')) continue;
      try {
        const sessions = await adapter.listSessions(tracked.id, query);
        out.push(...sessions);
      } catch {
        /* instance unavailable */
      }
    }
    return out.sort((a, b) => (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? ''));
  }

  async getSession(sessionId: string) {
    for (const tracked of this.connections.values()) {
      const adapter = this.adapters.get(tracked.instance.runtimeType);
      if (!adapter || !adapter.capabilities.includes('session-details')) continue;
      try {
        const session = await adapter.getSession(tracked.id, sessionId);
        if (session) return session;
      } catch {
        /* try next */
      }
    }
    return null;
  }

  // ─── Shutdown ───────────────────────────────────────────────

  async close(): Promise<void> {
    this.closed = true;
    for (const t of this.retryTimers) clearTimeout(t);
    this.retryTimers.clear();
    await Promise.all([...this.connections.keys()].map((id) => this.disconnect(id).catch(() => {})));
    this.connections.clear();
  }

  // ─── Event publication ──────────────────────────────────────

  emit(event: ExternalRuntimeEvent): void {
    for (const observer of this.observers) {
      try {
        observer.onEvent?.(event);
      } catch {
        /* observer errors never break the registry */
      }
    }
  }

  private emitRuntimeChanged(instance: ExternalRuntimeInstance): void {
    for (const observer of this.observers) {
      try {
        observer.onRuntimeChanged?.(instance);
      } catch {
        /* ignore */
      }
    }
  }
}

function displayNameFor(runtimeType: ExternalRuntimeType): string {
  switch (runtimeType) {
    case 'opencode':
      return 'OpenCode';
    case 'claude-code':
      return 'Claude Code';
    case 'openai-codex':
      return 'OpenAI Codex';
    default:
      return 'External Runtime';
  }
}

function safeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
