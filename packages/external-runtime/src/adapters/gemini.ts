/**
 * Google Gemini CLI adapter — secondary external runtime.
 *
 * Passive discovery, `settings.json` inspection, and structured headless
 * execution via `gemini -p` with JSON output for Vestara-launched sessions.
 * Never parses human-formatted terminal output when a structured format is
 * available; never mutates Gemini state.
 */

import * as path from 'node:path';
import type { ExternalAgentRuntimeAdapter } from '../adapter';
import { redact } from '../redact';
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

export const GEMINI_CAPABILITIES: readonly ExternalRuntimeCapability[] = [
  'installation-discovery',
  'version-discovery',
  'configuration-discovery',
  'session-launch',
  'structured-execution',
  'session-discovery',
  'message-observation',
  'tool-observation',
  'command-observation',
  'file-observation',
  'cost-observation',
  'model-observation',
];

export class GeminiAdapter implements ExternalAgentRuntimeAdapter {
  readonly runtimeType = 'gemini' as const;
  readonly capabilities = GEMINI_CAPABILITIES;

  capabilityStatus(_instance: ExternalRuntimeInstance): readonly AdapterCapabilityStatus[] {
    return GEMINI_CAPABILITIES.map((capability) => ({ capability, available: true }));
  }

  async detect(context: ExternalRuntimeDetectionContext): Promise<ExternalRuntimeDetectionResult> {
    const executablePath = which('gemini');
    if (!executablePath)
      return {
        runtimeType: 'gemini',
        detected: false,
        runningProcesses: [],
        message: 'gemini executable not found',
      };
    const versionResult = await execFileSafe(executablePath, ['--version'], { timeoutMs: context.timeoutMs ?? 3000 });
    return {
      runtimeType: 'gemini',
      detected: true,
      executablePath,
      version: versionResult.ok ? versionResult.stdout.trim().split('\n')[0]?.slice(0, 60) : undefined,
      runningProcesses: [],
    };
  }

  async connect(target: ExternalRuntimeTarget): Promise<ExternalRuntimeConnection> {
    if (!target.executablePath) throw new ExternalAdapterError('not-detected', 'gemini', 'no gemini executable');
    return {
      id: `gm-conn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      runtimeInstanceId: target.executablePath,
      runtimeType: 'gemini',
      connectedAt: new Date().toISOString(),
      mode: 'launch',
    };
  }

  async disconnect(_connectionId: string): Promise<void> {}

  async getHealth(connectionId: string): Promise<ExternalRuntimeHealth> {
    const executable = connectionId.startsWith('/') ? connectionId : which('gemini');
    if (!executable)
      return { status: 'unreachable', checkedAt: new Date().toISOString(), detail: 'gemini executable missing' };
    const res = await execFileSafe(executable, ['--version'], { timeoutMs: 2000 });
    return {
      status: res.ok ? 'ok' : 'degraded',
      version: res.ok ? res.stdout.trim().split('\n')[0]?.slice(0, 40) : undefined,
      checkedAt: new Date().toISOString(),
    };
  }

  async getRuntimeSnapshot(_connectionId: string): Promise<ExternalRuntimeInstance> {
    throw new ExternalAdapterError('unsupported-capability', 'gemini', 'snapshot is managed by the registry');
  }

  async getConfiguration(connectionId: string): Promise<ExternalRuntimeConfigurationSnapshot> {
    const workspacePath = this.workspacePath;
    const home = homeDir();
    const now = new Date().toISOString();
    const sources: ExternalConfigurationSource[] = [];

    const candidates: Array<{ abs: string; scope: 'global' | 'workspace' }> = [
      { abs: path.join(home, '.gemini', 'settings.json'), scope: 'global' },
      { abs: path.join(home, '.gemini', 'settings.local.json'), scope: 'global' },
    ];
    const workspaceSettings = resolveInsideRoot(workspacePath, '.gemini/settings.json');
    if (workspaceSettings) candidates.push({ abs: workspaceSettings, scope: 'workspace' });

    for (const cfg of candidates) {
      const text = readFileSafe(cfg.abs);
      sources.push({
        id: `gm-config-${cfg.scope}-${path.basename(cfg.abs)}`,
        runtimeInstanceId: connectionId,
        runtimeType: 'gemini',
        path: cfg.abs,
        scope: cfg.scope,
        exists: text !== null,
        precedence: cfg.scope === 'workspace' ? 20 : 10,
        discoveredAt: now,
        contentHash: text !== null ? sha1(text) : undefined,
        redactedContent: text !== null ? redact(parseJsonLoose(text)) : undefined,
      });
    }

    return {
      id: `gm-config-${Date.now()}`,
      runtimeInstanceId: connectionId,
      runtimeType: 'gemini',
      sources,
      effective: {},
      effectiveValues: [],
      capturedAt: now,
    };
  }

  async listSessions(_connectionId: string, _query?: ExternalSessionQuery): Promise<readonly ExternalSessionSummary[]> {
    // Gemini stores sessions under ~/.gemini by project; read-only listing is
    // deliberately not parsed until a stable structured format exists.
    return [];
  }

  async getSession(_connectionId: string, sessionId: string): Promise<ExternalSessionDetails> {
    return {
      id: `gm-session-${sessionId}`,
      runtimeInstanceId: _connectionId,
      runtimeType: 'gemini',
      externalSessionId: sessionId,
      status: 'unknown',
      integrationLevel: 'vestara-launched',
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

  /** Structured `gemini -p` headless execution with JSON output. */
  async launchSession(connectionId: string, request: ExternalSessionLaunchRequest): Promise<ExternalLaunchedSession> {
    const executable = connectionId.startsWith('/') ? connectionId : which('gemini');
    if (!executable) throw new ExternalAdapterError('not-detected', 'gemini', 'no gemini executable');

    const env = { ...(request.environment ?? {}), ...(request.correlationIds ?? {}) };
    const args = ['-p', request.task, '--output-format', 'json', '--skip-trust'];
    if (request.modelId) args.push('--model', request.modelId);
    const result = await execFileSafe(executable, args, {
      cwd: request.cwd,
      env,
      timeoutMs: request.timeoutMs ?? 120_000,
    });
    if (!result.ok) throw new ExternalAdapterError('stream-failed', 'gemini', result.stderr.slice(0, 300));

    return {
      id: `gm-launch-${Date.now()}`,
      runtimeInstanceId: connectionId,
      runtimeType: 'gemini',
      launchedAt: new Date().toISOString(),
      status: result.ok ? 'completed' : 'failed',
    };
  }

  async subscribe(connectionId: string, observer: ExternalRuntimeEventObserver): Promise<ExternalRuntimeSubscription> {
    const id = `gm-sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    observer({
      id: `ext-${Date.now()}`,
      schemaVersion: 1,
      category: 'runtime',
      type: 'external-runtime.disconnected',
      runtimeType: 'gemini',
      runtimeInstanceId: connectionId,
      ingestedAt: new Date().toISOString(),
      payload: { detail: 'live events require Gemini hooks; not configured' },
      provenance: 'unknown',
      observationLevel: 'partial',
      idempotencyKey: `gm-nostream-${id}`,
    });
    return { id, runtimeInstanceId: connectionId, unsubscribe: () => {} };
  }

  public workspacePath = '';
}

export function createGeminiAdapter(): GeminiAdapter {
  const adapter = new GeminiAdapter();
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

function parseJsonLoose(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { note: 'unparsed file' };
  }
}
