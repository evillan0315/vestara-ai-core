/**
 * OpenCode adapter — primary external runtime.
 *
 * Passive discovery, server probing, configuration + runtime intelligence
 * capture, and event normalization. Never executes arbitrary shell strings;
 * uses explicit executable arrays, timeouts, and abort signals. Never fails
 * when OpenCode is not installed.
 */

import type { ExternalAgentRuntimeAdapter, ExternalRuntimeIntelligenceAdapter } from '../adapter';
import { redact } from '../redact';
import { execFileSafe, which } from '../safe-process';
import type {
  AdapterCapabilityStatus,
  ExternalRuntimeCapability,
  ExternalRuntimeConfigurationSnapshot,
  ExternalRuntimeConnection,
  ExternalRuntimeDetectionContext,
  ExternalRuntimeDetectionResult,
  ExternalRuntimeEvent,
  ExternalRuntimeEventObserver,
  ExternalRuntimeHealth,
  ExternalRuntimeInstance,
  ExternalRuntimeSubscription,
  ExternalRuntimeTarget,
  ExternalSessionDetails,
  ExternalSessionQuery,
  ExternalSessionRuntimeSnapshot,
  ExternalSessionSummary,
} from '../types';
import { ExternalAdapterError } from '../types';
import { discoverOpencodeConfig } from './opencode-config';

export const OPENCODE_CAPABILITIES: readonly ExternalRuntimeCapability[] = [
  'installation-discovery',
  'version-discovery',
  'process-discovery',
  'server-discovery',
  'configuration-discovery',
  'effective-configuration',
  'session-discovery',
  'session-details',
  'live-events',
  'message-observation',
  'tool-observation',
  'command-observation',
  'file-observation',
  'diff-observation',
  'permission-observation',
  'diagnostic-observation',
  'todo-observation',
  'provider-observation',
  'model-observation',
  'mcp-observation',
  'plugin-observation',
];

const _KNOWN_EXECUTABLES = ['opencode'];

function homeDir(): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? '';
}

export class OpencodeAdapter implements ExternalAgentRuntimeAdapter, ExternalRuntimeIntelligenceAdapter {
  readonly runtimeType = 'opencode' as const;
  readonly capabilities = OPENCODE_CAPABILITIES;
  readonly supportsIntelligence = true as const;

  capabilityStatus(_instance: ExternalRuntimeInstance): readonly AdapterCapabilityStatus[] {
    return OPENCODE_CAPABILITIES.map((capability) => ({ capability, available: true }));
  }

  // ─── Passive discovery ──────────────────────────────────────

  async detect(context: ExternalRuntimeDetectionContext): Promise<ExternalRuntimeDetectionResult> {
    const executablePath = which('opencode');
    if (!executablePath) {
      return {
        runtimeType: 'opencode',
        detected: false,
        runningProcesses: [],
        message: 'opencode executable not found',
      };
    }

    let version: string | undefined;
    const versionResult = await execFileSafe(executablePath, ['--version'], { timeoutMs: context.timeoutMs ?? 3000 });
    if (versionResult.ok) version = versionResult.stdout.trim().split('\n')[0]?.slice(0, 60);

    const runningProcesses = this.findProcesses();

    // Server discovery: probe well-known local endpoints for a health check.
    const serverUrl = await this.probeServer();

    return {
      runtimeType: 'opencode',
      detected: true,
      executablePath,
      version,
      runningProcesses,
      serverUrl,
    };
  }

  private findProcesses(): number[] {
    // Best-effort: `pgrep` may not exist; never crash.
    try {
      const { execFileSync } = require('node:child_process') as typeof import('node:child_process');
      const out = execFileSync('pgrep', ['-f', 'opencode'], { encoding: 'utf8', timeout: 2000 });
      return out
        .split('\n')
        .map((line) => Number(line.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
    } catch {
      return [];
    }
  }

  private async probeServer(): Promise<string | undefined> {
    const candidates = ['http://127.0.0.1:4096', 'http://localhost:4096'];
    for (const base of candidates) {
      try {
        const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1500) });
        if (res.ok) return base;
      } catch {
        /* try next */
      }
    }
    return undefined;
  }

  // ─── Connection ─────────────────────────────────────────────

  async connect(target: ExternalRuntimeTarget): Promise<ExternalRuntimeConnection> {
    const mode: 'server' | 'process' = target.serverUrl ? 'server' : 'process';
    if (mode === 'server') {
      try {
        const res = await fetch(`${target.serverUrl}/api/health`, { signal: AbortSignal.timeout(2000) });
        if (!res.ok)
          throw new ExternalAdapterError('unreachable', 'opencode', `server at ${target.serverUrl} not healthy`);
      } catch (err) {
        if (err instanceof ExternalAdapterError) throw err;
        throw new ExternalAdapterError('unreachable', 'opencode', `cannot reach ${target.serverUrl}`);
      }
    } else if (!target.executablePath) {
      throw new ExternalAdapterError('not-detected', 'opencode', 'no executable and no server');
    }
    return {
      id: `oc-conn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      runtimeInstanceId: target.serverUrl ?? target.executablePath ?? 'opencode',
      runtimeType: 'opencode',
      connectedAt: new Date().toISOString(),
      mode,
    };
  }

  async disconnect(_connectionId: string): Promise<void> {
    /* nothing to clean up for passive connections */
  }

  async getHealth(connectionId: string): Promise<ExternalRuntimeHealth> {
    const serverUrl = connectionId.startsWith('http') ? connectionId : undefined;
    if (serverUrl) {
      try {
        const start = Date.now();
        const res = await fetch(`${serverUrl}/api/health`, { signal: AbortSignal.timeout(2000) });
        return {
          status: res.ok ? 'ok' : 'degraded',
          serverUrl,
          latencyMs: Date.now() - start,
          checkedAt: new Date().toISOString(),
        };
      } catch {
        return { status: 'unreachable', serverUrl, checkedAt: new Date().toISOString(), detail: 'server unreachable' };
      }
    }
    return {
      status: 'unknown',
      checkedAt: new Date().toISOString(),
      detail: 'process-only connection; no server health',
    };
  }

  async getRuntimeSnapshot(_connectionId: string): Promise<ExternalRuntimeInstance> {
    throw new ExternalAdapterError('unsupported-capability', 'opencode', 'snapshot is managed by the registry');
  }

  // ─── Configuration + intelligence ───────────────────────────

  async getConfiguration(connectionId: string): Promise<ExternalRuntimeConfigurationSnapshot> {
    const ctx = {
      workspacePath: this.workspacePath,
      runtimeInstanceId: connectionId,
      homeDir: homeDir(),
      now: new Date().toISOString(),
    };
    const parsed = discoverOpencodeConfig(ctx);
    return {
      id: `oc-config-${Date.now()}`,
      runtimeInstanceId: connectionId,
      runtimeType: 'opencode',
      sources: parsed.sources,
      effective: parsed.effective,
      effectiveValues: [],
      capturedAt: new Date().toISOString(),
    };
  }

  async listAgents(connectionId: string) {
    return discoverOpencodeConfig({
      workspacePath: this.workspacePath,
      runtimeInstanceId: connectionId,
      homeDir: homeDir(),
      now: new Date().toISOString(),
    }).agents;
  }

  async listSkills(connectionId: string) {
    return discoverOpencodeConfig({
      workspacePath: this.workspacePath,
      runtimeInstanceId: connectionId,
      homeDir: homeDir(),
      now: new Date().toISOString(),
    }).skills;
  }

  async listInstructions(connectionId: string) {
    return discoverOpencodeConfig({
      workspacePath: this.workspacePath,
      runtimeInstanceId: connectionId,
      homeDir: homeDir(),
      now: new Date().toISOString(),
    }).instructions;
  }

  async listCommands(connectionId: string) {
    return discoverOpencodeConfig({
      workspacePath: this.workspacePath,
      runtimeInstanceId: connectionId,
      homeDir: homeDir(),
      now: new Date().toISOString(),
    }).commands;
  }

  async listPlugins(connectionId: string) {
    return discoverOpencodeConfig({
      workspacePath: this.workspacePath,
      runtimeInstanceId: connectionId,
      homeDir: homeDir(),
      now: new Date().toISOString(),
    }).plugins;
  }

  async listMcpServers(connectionId: string) {
    return discoverOpencodeConfig({
      workspacePath: this.workspacePath,
      runtimeInstanceId: connectionId,
      homeDir: homeDir(),
      now: new Date().toISOString(),
    }).mcpServers;
  }

  async listProviders(connectionId: string) {
    return discoverOpencodeConfig({
      workspacePath: this.workspacePath,
      runtimeInstanceId: connectionId,
      homeDir: homeDir(),
      now: new Date().toISOString(),
    }).providers;
  }

  async listModels(connectionId: string) {
    return discoverOpencodeConfig({
      workspacePath: this.workspacePath,
      runtimeInstanceId: connectionId,
      homeDir: homeDir(),
      now: new Date().toISOString(),
    }).models;
  }

  async getSessionRuntimeSnapshot(
    _connectionId: string,
    sessionId: string,
  ): Promise<ExternalSessionRuntimeSnapshot | null> {
    const parsed = discoverOpencodeConfig({
      workspacePath: this.workspacePath,
      runtimeInstanceId: _connectionId,
      homeDir: homeDir(),
      now: new Date().toISOString(),
    });
    return {
      id: `oc-rt-${Date.now()}`,
      sessionId,
      runtimeInstanceId: _connectionId,
      runtimeType: 'opencode',
      availableSkillIds: parsed.skills.map((s) => s.name),
      // No evidence of loading: loaded skills are only set when Vestara
      // observes a skill being invoked during the session.
      loadedSkillIds: [],
      advertisedSkillIds: [],
      instructionSourceIds: parsed.instructions.map((i) => i.id),
      commandDefinitionIds: parsed.commands.map((c) => c.id),
      pluginIds: parsed.plugins.map((p) => p.id),
      mcpServerIds: parsed.mcpServers.map((m) => m.id),
      effectiveConfigurationHash: parsed.effectiveHash,
      configurationSourceIds: parsed.sources.map((s) => s.id),
      observedAt: new Date().toISOString(),
      provenance: 'resolved',
    };
  }

  // ─── Sessions (server-backed, tolerates absence) ────────────

  async listSessions(connectionId: string, _query?: ExternalSessionQuery): Promise<readonly ExternalSessionSummary[]> {
    const serverUrl = serverUrlOf(connectionId);
    if (!serverUrl) return [];
    try {
      const res = await fetch(`${serverUrl}/api/session/list`, { signal: AbortSignal.timeout(2500) });
      if (!res.ok) return [];
      const data = (await res.json()) as unknown;
      return normalizeSessionList(data, connectionId);
    } catch {
      return [];
    }
  }

  async getSession(connectionId: string, sessionId: string): Promise<ExternalSessionDetails> {
    const serverUrl = serverUrlOf(connectionId);
    if (!serverUrl)
      throw new ExternalAdapterError(
        'unsupported-capability',
        'opencode',
        'session details require a reachable server',
      );
    try {
      const res = await fetch(`${serverUrl}/api/session/${encodeURIComponent(sessionId)}`, {
        signal: AbortSignal.timeout(2500),
      });
      if (!res.ok) throw new ExternalAdapterError('connection-failed', 'opencode', `session ${sessionId} unavailable`);
      const data = (await res.json()) as unknown;
      return normalizeSessionDetail(data, connectionId, sessionId);
    } catch (err) {
      if (err instanceof ExternalAdapterError) throw err;
      throw new ExternalAdapterError('malformed-payload', 'opencode', 'failed to read session detail');
    }
  }

  // ─── Live events (server SSE, tolerant) ─────────────────────

  async subscribe(connectionId: string, observer: ExternalRuntimeEventObserver): Promise<ExternalRuntimeSubscription> {
    const serverUrl = serverUrlOf(connectionId);
    const subscriptionId = `oc-sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    if (!serverUrl) {
      // Passive process-only: no live stream. Emit a single disconnected event.
      observer(
        this.event(
          connectionId,
          'runtime',
          'external-runtime.disconnected',
          { detail: 'no live event stream (no server)' },
          'partial',
        ),
      );
      return { id: subscriptionId, runtimeInstanceId: connectionId, unsubscribe: () => {} };
    }

    const controller = new AbortController();
    const consumed = new Set<string>();

    const run = async () => {
      try {
        const res = await fetch(`${serverUrl}/api/event`, { signal: controller.signal });
        if (!res.ok || !res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6);
            let parsed: unknown;
            try {
              parsed = JSON.parse(raw);
            } catch {
              observer(
                this.event(
                  connectionId,
                  'runtime',
                  'external-runtime.malformed-event',
                  { raw: raw.slice(0, 256) },
                  'partial',
                ),
              );
              continue;
            }
            const externalId = String((parsed as { id?: unknown })?.id ?? '');
            const key = externalId || `${(parsed as { type?: unknown })?.type ?? 'event'}:${raw.length}`;
            if (consumed.has(key)) continue; // replay dedup
            consumed.add(key);
            observer(this.normalizeEvent(connectionId, parsed));
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        observer(
          this.event(connectionId, 'runtime', 'external-runtime.stream-failed', { error: String(err) }, 'partial'),
        );
      }
    };

    void run();
    return {
      id: subscriptionId,
      runtimeInstanceId: connectionId,
      unsubscribe: () => controller.abort(),
    };
  }

  public workspacePath = '';

  private event(
    connectionId: string,
    category: 'runtime' | 'session' | 'tool' | 'command' | 'file' | 'permission' | 'diagnostic' | 'todo',
    type: string,
    payload: Record<string, unknown>,
    level: 'observed' | 'partial' | 'inferred',
  ): ExternalRuntimeEvent {
    return {
      id: `ext-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      schemaVersion: 1,
      category,
      type,
      runtimeType: 'opencode',
      runtimeInstanceId: connectionId,
      ingestedAt: new Date().toISOString(),
      payload: redact(payload) as Record<string, unknown>,
      provenance: 'runtime-reported',
      observationLevel: level,
      idempotencyKey: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
  }

  private normalizeEvent(connectionId: string, raw: unknown): ExternalRuntimeEvent {
    const rec = (raw ?? {}) as Record<string, unknown>;
    const type = String(rec.type ?? 'external-runtime.event');
    const externalSessionId =
      typeof rec.sessionID === 'string'
        ? rec.sessionID
        : typeof rec.sessionId === 'string'
          ? String(rec.sessionId)
          : undefined;
    const payload = redact({ ...(rec as Record<string, unknown>) }) as Record<string, unknown>;
    return {
      id: `ext-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      schemaVersion: 1,
      category: categoryFor(type),
      type,
      runtimeType: 'opencode',
      runtimeInstanceId: connectionId,
      externalEventId: typeof rec.id === 'string' ? String(rec.id) : undefined,
      externalSessionId,
      externalTimestamp: typeof rec.time === 'string' ? String(rec.time) : undefined,
      ingestedAt: new Date().toISOString(),
      sequence: typeof rec.seq === 'number' ? Number(rec.seq) : undefined,
      payload,
      provenance: 'runtime-reported',
      observationLevel: 'observed',
      idempotencyKey: `${String(rec.id ?? '')}:${type}`,
    };
  }
}

// Export a factory for the wiring layer that captures the workspace path.
export function createOpencodeAdapter(): OpencodeAdapter {
  const adapter = new OpencodeAdapter();
  const originalConnect = adapter.connect.bind(adapter);
  adapter.connect = async (target) => {
    adapter.workspacePath = target.workspacePath;
    return originalConnect(target);
  };
  return adapter;
}

function serverUrlOf(connectionId: string): string | undefined {
  return connectionId.startsWith('http') ? connectionId : undefined;
}

function categoryFor(
  type: string,
): 'runtime' | 'session' | 'tool' | 'command' | 'file' | 'permission' | 'diagnostic' | 'todo' {
  if (type.includes('tool')) return 'tool';
  if (type.includes('command')) return 'command';
  if (type.includes('file') || type.includes('edit')) return 'file';
  if (type.includes('permission')) return 'permission';
  if (type.includes('diagnostic')) return 'diagnostic';
  if (type.includes('todo')) return 'todo';
  if (type.includes('session') || type.includes('message')) return 'session';
  return 'runtime';
}

function normalizeSessionList(data: unknown, connectionId: string): readonly ExternalSessionSummary[] {
  const rec = (data ?? {}) as Record<string, unknown>;
  const sessions = Array.isArray(rec.sessions) ? rec.sessions : Array.isArray(rec.data) ? rec.data : [];
  const now = new Date().toISOString();
  return (sessions as Record<string, unknown>[]).map((s) => {
    const id = String(s.id ?? '');
    return {
      id: `oc-session-${id}`,
      runtimeInstanceId: connectionId,
      runtimeType: 'opencode',
      externalSessionId: id,
      title: typeof s.title === 'string' ? String(s.title) : undefined,
      status: sessionStatusOf(s),
      integrationLevel: 'live-observation',
      agentId: typeof s.agent === 'string' ? String(s.agent) : undefined,
      providerId: typeof s.provider === 'string' ? String(s.provider) : undefined,
      modelId: typeof s.model === 'string' ? String(s.model) : undefined,
      startedAt:
        typeof s.time === 'object' && typeof (s.time as { created?: unknown }).created === 'number'
          ? new Date(Number((s.time as { created: number }).created)).toISOString()
          : now,
      lastActivityAt: now,
      filesChanged: typeof s.files === 'number' ? Number(s.files) : undefined,
      toolCount: typeof s.toolCalls === 'number' ? Number(s.toolCalls) : undefined,
      commandCount: typeof s.commands === 'number' ? Number(s.commands) : undefined,
      permissionState: 'none',
    };
  });
}

function normalizeSessionDetail(data: unknown, connectionId: string, sessionId: string): ExternalSessionDetails {
  const rec = (data ?? {}) as Record<string, unknown>;
  const summary: ExternalSessionSummary = {
    id: `oc-session-${sessionId}`,
    runtimeInstanceId: connectionId,
    runtimeType: 'opencode',
    externalSessionId: sessionId,
    status: sessionStatusOf(rec),
    integrationLevel: 'live-observation',
  };
  return {
    ...summary,
    messages: [],
    tools: [],
    commands: [],
    fileMutations: [],
    permissions: [],
    diagnostics: [],
    todos: [],
    partiallyObserved: true,
  };
}

function sessionStatusOf(rec: Record<string, unknown>): ExternalSessionSummary['status'] {
  const status = String(rec.status ?? '').toLowerCase();
  if (status.includes('complete') || status.includes('done')) return 'completed';
  if (status.includes('fail') || status.includes('error')) return 'failed';
  if (status.includes('abort') || status.includes('cancel')) return 'aborted';
  if (status.includes('compact')) return 'compacted';
  if (status.includes('run') || status.includes('work')) return 'running';
  if (status === 'idle') return 'idle';
  return 'unknown';
}
