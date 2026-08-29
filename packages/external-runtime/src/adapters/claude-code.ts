/**
 * Claude Code adapter — secondary external runtime.
 *
 * Passive discovery, structured JSON output support for Vestara-launched
 * sessions, and optional hook integration. Does not depend on undocumented
 * internal storage. Never parses human-formatted terminal output when a
 * structured format is available.
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

export const CLAUDE_CAPABILITIES: readonly ExternalRuntimeCapability[] = [
  'installation-discovery',
  'version-discovery',
  'configuration-discovery',
  'session-launch',
  'structured-execution',
  'message-observation',
  'tool-observation',
  'command-observation',
  'file-observation',
  'cost-observation',
  'model-observation',
  'mcp-observation',
];

export class ClaudeCodeAdapter implements ExternalAgentRuntimeAdapter {
  readonly runtimeType = 'claude-code' as const;
  readonly capabilities = CLAUDE_CAPABILITIES;

  capabilityStatus(_instance: ExternalRuntimeInstance): readonly AdapterCapabilityStatus[] {
    return CLAUDE_CAPABILITIES.map((capability) => ({ capability, available: true }));
  }

  async detect(context: ExternalRuntimeDetectionContext): Promise<ExternalRuntimeDetectionResult> {
    const executablePath = which('claude');
    if (!executablePath)
      return {
        runtimeType: 'claude-code',
        detected: false,
        runningProcesses: [],
        message: 'claude executable not found',
      };
    const versionResult = await execFileSafe(executablePath, ['--version'], { timeoutMs: context.timeoutMs ?? 3000 });
    return {
      runtimeType: 'claude-code',
      detected: true,
      executablePath,
      version: versionResult.ok ? versionResult.stdout.trim().slice(0, 60) : undefined,
      runningProcesses: [],
    };
  }

  async connect(target: ExternalRuntimeTarget): Promise<ExternalRuntimeConnection> {
    if (!target.executablePath) throw new ExternalAdapterError('not-detected', 'claude-code', 'no claude executable');
    return {
      id: `cc-conn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      runtimeInstanceId: target.executablePath,
      runtimeType: 'claude-code',
      connectedAt: new Date().toISOString(),
      mode: 'launch',
    };
  }

  async disconnect(_connectionId: string): Promise<void> {}

  async getHealth(connectionId: string): Promise<ExternalRuntimeHealth> {
    const executable = connectionId.startsWith('/') ? connectionId : which('claude');
    if (!executable)
      return { status: 'unreachable', checkedAt: new Date().toISOString(), detail: 'claude executable missing' };
    const res = await execFileSafe(executable, ['--version'], { timeoutMs: 2000 });
    return {
      status: res.ok ? 'ok' : 'degraded',
      version: res.ok ? res.stdout.trim().slice(0, 40) : undefined,
      checkedAt: new Date().toISOString(),
    };
  }

  async getRuntimeSnapshot(_connectionId: string): Promise<ExternalRuntimeInstance> {
    throw new ExternalAdapterError('unsupported-capability', 'claude-code', 'snapshot is managed by the registry');
  }

  async getConfiguration(connectionId: string): Promise<ExternalRuntimeConfigurationSnapshot> {
    const workspacePath = this.workspacePath;
    const home = homeDir();
    const sources: ExternalConfigurationSource[] = [];
    const now = new Date().toISOString();

    const candidates: Array<{ rel: string; scope: 'global' | 'workspace' }> = [
      { rel: 'CLAUDE.md', scope: 'workspace' },
      { rel: '.claude/settings.json', scope: 'workspace' },
      { rel: path.join(home, '.claude', 'settings.json'), scope: 'global' },
    ];
    for (const cfg of candidates) {
      const abs = cfg.scope === 'workspace' ? resolveInsideRoot(workspacePath, cfg.rel) : cfg.rel;
      if (!abs) continue;
      const text = readFileSafe(abs);
      sources.push({
        id: `cc-config-${cfg.scope}-${path.basename(abs)}`,
        runtimeInstanceId: connectionId,
        runtimeType: 'claude-code',
        path: abs,
        scope: cfg.scope,
        exists: text !== null,
        precedence: cfg.scope === 'workspace' ? 20 : 10,
        discoveredAt: now,
        contentHash: text !== null ? sha1(text) : undefined,
        redactedContent: text !== null ? redact(parseJsonLoose(text)) : undefined,
      });
    }

    return {
      id: `cc-config-${Date.now()}`,
      runtimeInstanceId: connectionId,
      runtimeType: 'claude-code',
      sources,
      effective: {},
      effectiveValues: [],
      capturedAt: now,
    };
  }

  async listSessions(_connectionId: string, _query?: ExternalSessionQuery): Promise<readonly ExternalSessionSummary[]> {
    return [];
  }

  async getSession(_connectionId: string, sessionId: string): Promise<ExternalSessionDetails> {
    return {
      id: `cc-session-${sessionId}`,
      runtimeInstanceId: _connectionId,
      runtimeType: 'claude-code',
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

  /**
   * Launch a structured Claude Code session with stream-json output.
   * Uses explicit environment correlation and abort-safe execution.
   */
  async launchSession(connectionId: string, request: ExternalSessionLaunchRequest): Promise<ExternalLaunchedSession> {
    const executable = connectionId.startsWith('/') ? connectionId : which('claude');
    if (!executable) throw new ExternalAdapterError('not-detected', 'claude-code', 'no claude executable');

    const env = {
      ...(request.environment ?? {}),
      ...(request.correlationIds ?? {}),
    };
    const result = await execFileSafe(executable, ['-p', request.task, '--output-format', 'stream-json'], {
      cwd: request.cwd,
      env,
      timeoutMs: request.timeoutMs ?? 60_000,
    });
    if (!result.ok) throw new ExternalAdapterError('stream-failed', 'claude-code', result.stderr.slice(0, 300));

    // stream-json emits a final JSON line with the result object.
    const sessionId = extractSessionId(result.stdout);
    return {
      id: `cc-launch-${Date.now()}`,
      runtimeInstanceId: connectionId,
      runtimeType: 'claude-code',
      externalSessionId: sessionId,
      launchedAt: new Date().toISOString(),
      status: result.ok ? 'completed' : 'failed',
    };
  }

  async subscribe(connectionId: string, observer: ExternalRuntimeEventObserver): Promise<ExternalRuntimeSubscription> {
    const id = `cc-sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    observer({
      id: `ext-${Date.now()}`,
      schemaVersion: 1,
      category: 'runtime',
      type: 'external-runtime.disconnected',
      runtimeType: 'claude-code',
      runtimeInstanceId: connectionId,
      ingestedAt: new Date().toISOString(),
      payload: { detail: 'live events require Claude Code hooks; not configured' },
      provenance: 'unknown',
      observationLevel: 'partial',
      idempotencyKey: `cc-nostream-${id}`,
    });
    return { id, runtimeInstanceId: connectionId, unsubscribe: () => {} };
  }

  public workspacePath = '';
}

export function createClaudeCodeAdapter(): ClaudeCodeAdapter {
  const adapter = new ClaudeCodeAdapter();
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

function extractSessionId(stdout: string): string | undefined {
  for (const line of stdout.split('\n')) {
    if (!line.startsWith('data:')) continue;
    try {
      const parsed = JSON.parse(line.slice(5));
      if (parsed.sessionId || parsed.session_id) return String(parsed.sessionId ?? parsed.session_id);
    } catch {
      /* skip */
    }
  }
  return undefined;
}
