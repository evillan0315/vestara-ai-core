import { resolveHttpUrl } from './clientConfig';

export interface CodexRuntimeThreadSummary {
  id: string;
  sessionId?: string;
  cwd?: string;
  modelProvider?: string;
  status?: unknown;
  createdAt?: number;
  updatedAt?: number;
  bufferedEvents: number;
}

export interface CodexRuntimeSessionSummary {
  id: string;
  appServerUrl: string;
  createdAt: string;
  lastSeenAt: string;
  lastEventAt?: string;
  connectedClients: number;
  threadCount: number;
  turnsStarted: number;
  threads: CodexRuntimeThreadSummary[];
}

export interface CodexRuntimeStatus {
  integration: 'codex';
  status: 'healthy' | 'unreachable';
  reachable: boolean;
  upstream: { transport: 'websocket'; url: string };
  checkedAt: string;
  latencyMs: number;
  sessions: CodexRuntimeSessionSummary[];
  activeSessionId: string | null;
  connectedClients: number;
}

export async function fetchCodexRuntimeStatus(signal?: AbortSignal): Promise<CodexRuntimeStatus | null> {
  try {
    const response = await fetch(resolveHttpUrl('/api/codex/status'), {
      headers: { 'Content-Type': 'application/json' },
      signal,
    });
    if (!response.ok) return null;
    return (await response.json()) as CodexRuntimeStatus;
  } catch {
    return null;
  }
}
