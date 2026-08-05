/**
 * OpenCode runtime API client + types (workspace → /api/opencode/*).
 *
 * Mirrors apps/api/src/routes/opencode.ts. Every method returns null on
 * transport or upstream failure so the UI can render offline/degraded states
 * without throwing.
 */

export interface OpenCodeHealth {
  integration: string;
  status: 'healthy' | 'unhealthy';
  reachable: boolean;
  upstream: { healthy: boolean; version?: string };
  checkedAt: string;
  latencyMs: number;
  eventBridge: {
    connected: boolean;
    connectionState: 'connected' | 'connecting' | 'disconnected' | 'reconnecting';
    receivedEvents?: number;
    publishedEvents?: number;
    reconnectAttempts?: number;
  };
}

export interface OpenCodeProject {
  id: string;
  worktree: string;
  vcs?: string;
  name?: string;
}

export interface OpenCodeProviderSummary {
  id: string;
  name?: string;
  source?: string;
  modelCount: number;
}

export interface OpenCodeAgentSummary {
  name: string;
  description?: string;
  mode?: string;
  native?: boolean;
}

export interface OpenCodeContractChange {
  severity: 'breaking' | 'potentially-breaking' | 'compatible' | 'informational';
  kind: string;
  path: string;
  summary: string;
}

export interface OpenCodeCompatibility {
  status: 'compatible' | 'breaking';
  pinnedSchemaChecksum: string;
  liveSchemaChecksum: string;
  checksumMatches: boolean;
  breakingChanges: OpenCodeContractChange[];
  warnings: OpenCodeContractChange[];
  openCodeVersion?: string;
  checkedAt: string;
}

export interface OpenCodeOverview {
  health: OpenCodeHealth | null;
  project: OpenCodeProject | null;
  agents: OpenCodeAgentSummary[];
  providers: OpenCodeProviderSummary[];
  compatibility: OpenCodeCompatibility | null;
}

async function fetchJSON<T>(path: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export interface OpenCodeQueryKeys {
  health: readonly ['opencode', 'health'];
  project: readonly ['opencode', 'project'];
  agents: readonly ['opencode', 'agents'];
  providers: readonly ['opencode', 'providers'];
  compatibility: readonly ['opencode', 'compatibility'];
  overview: readonly ['opencode', 'overview'];
}

/** Stable query keys for React Query / caching layers. */
export const openCodeQueryKeys: OpenCodeQueryKeys = {
  health: ['opencode', 'health'],
  project: ['opencode', 'project'],
  agents: ['opencode', 'agents'],
  providers: ['opencode', 'providers'],
  compatibility: ['opencode', 'compatibility'],
  overview: ['opencode', 'overview'],
};

export const openCodeApi = {
  health: () => fetchJSON<OpenCodeHealth>('/api/opencode/health'),
  project: () => fetchJSON<{ projects: OpenCodeProject[]; current: OpenCodeProject | null }>('/api/opencode/project'),
  agents: () => fetchJSON<{ agents: OpenCodeAgentSummary[] }>('/api/opencode/agents'),
  providers: () => fetchJSON<{ providers: OpenCodeProviderSummary[] }>('/api/opencode/providers'),
  compatibility: () => fetchJSON<OpenCodeCompatibility>('/api/opencode/compatibility'),

  /** Composite overview — health + project + discovery + compatibility. */
  overview: async (): Promise<OpenCodeOverview> => {
    const [health, project, agents, providers, compatibility] = await Promise.all([
      openCodeApi.health(),
      openCodeApi.project(),
      openCodeApi.agents(),
      openCodeApi.providers(),
      openCodeApi.compatibility(),
    ]);
    return {
      health,
      project: project?.current ?? null,
      agents: agents?.agents ?? [],
      providers: providers?.providers ?? [],
      compatibility,
    };
  },
};
