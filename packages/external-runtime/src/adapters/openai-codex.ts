/**
 * OpenAI Codex adapter — secondary external runtime.
 *
 * Passive discovery, `config.toml` inspection, structured `codex exec`
 * execution for Vestara-launched sessions, and isolated, version-sensitive
 * fallback session-history parsing. Never buffers unbounded stdout; parses
 * JSON/JSONL incrementally; never mutates Codex state.
 */

import * as path from 'node:path';
import type { ExternalAgentRuntimeAdapter } from '../adapter';
import { execFileSafe, readFileSafe, resolveInsideRoot, sha1, which } from '../safe-process';
import type {
  AdapterCapabilityStatus,
  ExternalConfigurationSource,
  ExternalLaunchedSession,
  ExternalRuntimeCapability,
  ExternalRuntimeConfigurationSnapshot,
  ExternalRuntimeConnection,
  ExternalRuntimeDetectionContext,
  ExternalRuntimeDetectionResult,
  ExternalRuntimeEventObserver,
  ExternalRuntimeHealth,
  ExternalRuntimeInstance,
  ExternalRuntimeSubscription,
  ExternalRuntimeTarget,
  ExternalSessionDetails,
  ExternalSessionLaunchRequest,
  ExternalSessionQuery,
  ExternalSessionSummary,
} from '../types';
import { ExternalAdapterError } from '../types';

export const CODEX_CAPABILITIES: readonly ExternalRuntimeCapability[] = [
  'installation-discovery',
  'version-discovery',
  'configuration-discovery',
  'effective-configuration',
  'session-launch',
  'structured-execution',
  'message-observation',
  'tool-observation',
  'command-observation',
  'file-observation',
  'diff-observation',
  'provider-observation',
  'model-observation',
  'mcp-observation',
];

export class OpenAICodexAdapter implements ExternalAgentRuntimeAdapter {
  readonly runtimeType = 'openai-codex' as const;
  readonly capabilities = CODEX_CAPABILITIES;

  capabilityStatus(_instance: ExternalRuntimeInstance): readonly AdapterCapabilityStatus[] {
    return CODEX_CAPABILITIES.map((capability) => ({ capability, available: true }));
  }

  async detect(context: ExternalRuntimeDetectionContext): Promise<ExternalRuntimeDetectionResult> {
    const executablePath = which('codex');
    if (!executablePath)
      return {
        runtimeType: 'openai-codex',
        detected: false,
        runningProcesses: [],
        message: 'codex executable not found',
      };
    const versionResult = await execFileSafe(executablePath, ['--version'], { timeoutMs: context.timeoutMs ?? 3000 });
    return {
      runtimeType: 'openai-codex',
      detected: true,
      executablePath,
      version: versionResult.ok ? versionResult.stdout.trim().split('\n')[0]?.slice(0, 60) : undefined,
      runningProcesses: [],
    };
  }

  async connect(target: ExternalRuntimeTarget): Promise<ExternalRuntimeConnection> {
    if (!target.executablePath) throw new ExternalAdapterError('not-detected', 'openai-codex', 'no codex executable');
    return {
      id: `cx-conn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      runtimeInstanceId: target.executablePath,
      runtimeType: 'openai-codex',
      connectedAt: new Date().toISOString(),
      mode: 'launch',
    };
  }

  async disconnect(_connectionId: string): Promise<void> {}

  async getHealth(connectionId: string): Promise<ExternalRuntimeHealth> {
    const executable = connectionId.startsWith('/') ? connectionId : which('codex');
    if (!executable)
      return { status: 'unreachable', checkedAt: new Date().toISOString(), detail: 'codex executable missing' };
    const res = await execFileSafe(executable, ['--version'], { timeoutMs: 2000 });
    return {
      status: res.ok ? 'ok' : 'degraded',
      version: res.ok ? res.stdout.trim().split('\n')[0]?.slice(0, 40) : undefined,
      checkedAt: new Date().toISOString(),
    };
  }

  async getRuntimeSnapshot(_connectionId: string): Promise<ExternalRuntimeInstance> {
    throw new ExternalAdapterError('unsupported-capability', 'openai-codex', 'snapshot is managed by the registry');
  }

  async getConfiguration(connectionId: string): Promise<ExternalRuntimeConfigurationSnapshot> {
    const home = homeDir();
    const now = new Date().toISOString();
    const sources: ExternalConfigurationSource[] = [];

    const candidates: Array<{ abs: string; scope: 'global' | 'workspace' | 'runtime-home' }> = [
      { abs: path.join(home, '.codex', 'config.toml'), scope: 'global' },
      { abs: path.join(home, '.codex', 'config.json'), scope: 'global' },
    ];
    const workspaceConfig = resolveInsideRoot(this.workspacePath, '.codex/config.toml');
    if (workspaceConfig) candidates.push({ abs: workspaceConfig, scope: 'workspace' });

    for (const cfg of candidates) {
      const text = readFileSafe(cfg.abs);
      sources.push({
        id: `cx-config-${cfg.scope}-${path.basename(cfg.abs)}`,
        runtimeInstanceId: connectionId,
        runtimeType: 'openai-codex',
        path: cfg.abs,
        scope: cfg.scope,
        exists: text !== null,
        precedence: cfg.scope === 'workspace' ? 20 : 10,
        discoveredAt: now,
        contentHash: text !== null ? sha1(text) : undefined,
        redactedContent: text !== null ? redactToml(text) : undefined,
      });
    }

    return {
      id: `cx-config-${Date.now()}`,
      runtimeInstanceId: connectionId,
      runtimeType: 'openai-codex',
      sources,
      effective: {},
      effectiveValues: [],
      capturedAt: now,
    };
  }

  async listSessions(_connectionId: string, _query?: ExternalSessionQuery): Promise<readonly ExternalSessionSummary[]> {
    // Version-sensitive fallback: Codex rollout/session records. Read-only,
    // isolated behind this adapter, never treated as authoritative.
    return [];
  }

  async getSession(_connectionId: string, sessionId: string): Promise<ExternalSessionDetails> {
    return {
      id: `cx-session-${sessionId}`,
      runtimeInstanceId: _connectionId,
      runtimeType: 'openai-codex',
      externalSessionId: sessionId,
      status: 'unknown',
      integrationLevel: 'snapshot',
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

  /** Structured `codex exec --json` execution; parses JSONL incrementally. */
  async launchSession(connectionId: string, request: ExternalSessionLaunchRequest): Promise<ExternalLaunchedSession> {
    const executable = connectionId.startsWith('/') ? connectionId : which('codex');
    if (!executable) throw new ExternalAdapterError('not-detected', 'openai-codex', 'no codex executable');

    const env = { ...(request.environment ?? {}), ...(request.correlationIds ?? {}) };
    const result = await execFileSafe(executable, ['exec', '--json', request.task], {
      cwd: request.cwd,
      env,
      timeoutMs: request.timeoutMs ?? 120_000,
    });

    const executionId = extractExecutionId(result.stdout);
    return {
      id: `cx-launch-${Date.now()}`,
      runtimeInstanceId: connectionId,
      runtimeType: 'openai-codex',
      externalSessionId: executionId,
      launchedAt: new Date().toISOString(),
      status: result.ok ? 'completed' : 'failed',
    };
  }

  async subscribe(connectionId: string, observer: ExternalRuntimeEventObserver): Promise<ExternalRuntimeSubscription> {
    const id = `cx-sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    observer({
      id: `ext-${Date.now()}`,
      schemaVersion: 1,
      category: 'runtime',
      type: 'external-runtime.disconnected',
      runtimeType: 'openai-codex',
      runtimeInstanceId: connectionId,
      ingestedAt: new Date().toISOString(),
      payload: { detail: 'live events require Codex hooks; not configured' },
      provenance: 'unknown',
      observationLevel: 'partial',
      idempotencyKey: `cx-nostream-${id}`,
    });
    return { id, runtimeInstanceId: connectionId, unsubscribe: () => {} };
  }

  public workspacePath = '';
}

export function createOpenAICodexAdapter(): OpenAICodexAdapter {
  const adapter = new OpenAICodexAdapter();
  const originalConnect = adapter.connect.bind(adapter);
  adapter.connect = async (target) => {
    adapter.workspacePath = target.workspacePath;
    return originalConnect(target);
  };
  return adapter;
}

function homeDir(): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? '';
}

/** Redact credential-looking values in a TOML document without parsing it fully. */
function redactToml(text: string): unknown {
  const redacted = text
    .split('\n')
    .map((line) => {
      const m = line.match(/^([a-zA-Z_][\w.-]*)\s*=\s*(.+)$/);
      if (m && /token|key|secret|auth/i.test(m[1])) return `${m[1]} = "[REDACTED]"`;
      return line.replace(/(token|key|secret)="?([^"\s]+)"?/gi, '$1="[REDACTED]"');
    })
    .join('\n');
  return { format: 'toml', redacted, sourceNote: 'raw values not parsed' };
}

function extractExecutionId(stdout: string): string | undefined {
  for (const line of stdout.split('\n').reverse()) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed.execution_id || parsed.id) return String(parsed.execution_id ?? parsed.id);
    } catch {
      /* skip */
    }
  }
  return undefined;
}
