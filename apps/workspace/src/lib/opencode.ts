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

export interface OpenCodeQueryKeys {
  health: readonly ['opencode', 'health'];
  project: readonly ['opencode', 'project'];
  agents: readonly ['opencode', 'agents'];
  providers: readonly ['opencode', 'providers'];
  compatibility: readonly ['opencode', 'compatibility'];
  overview: readonly ['opencode', 'overview'];
  sessions: readonly ['opencode', 'sessions'];
  session: (sessionId: string) => readonly ['opencode', 'sessions', string];
  status: readonly ['opencode', 'sessions', 'status'];
}

/** Stable query keys for React Query / caching layers. */
export const openCodeQueryKeys: OpenCodeQueryKeys = {
  health: ['opencode', 'health'],
  project: ['opencode', 'project'],
  agents: ['opencode', 'agents'],
  providers: ['opencode', 'providers'],
  compatibility: ['opencode', 'compatibility'],
  overview: ['opencode', 'overview'],
  sessions: ['opencode', 'sessions'],
  session: (sessionId) => ['opencode', 'sessions', sessionId],
  status: ['opencode', 'sessions', 'status'],
};

// ─── Session DTOs ─────────────────────────────────────────────

/** Raw upstream session list item. */
export interface OpenCodeRawSession {
  id: string;
  slug?: string;
  directory?: string;
  title?: string;
  agent?: string;
  model?: { id?: string; providerID?: string };
  parentID?: string;
  summary?: { additions?: number; deletions?: number; files?: number };
  time?: { created?: number; updated?: number };
  cost?: number;
  tokens?: { input?: number; output?: number; reasoning?: number };
  version?: string;
}

/** Status reported by the /sessions/status map. */
export type OpenCodeSessionRuntimeStatus = 'busy' | 'idle' | 'error';

/** Derived display status — unknown upstream values degrade to 'unknown'. */
export type OpenCodeSessionViewStatus = 'active' | 'idle' | 'failed' | 'unknown';

/** Session view model — status is merged from the status endpoint. */
export interface OpenCodeSessionView {
  id: string;
  title: string;
  slug?: string;
  directory?: string;
  agent?: string;
  model?: { id?: string; providerID?: string };
  parentID?: string;
  status: OpenCodeSessionViewStatus;
  additions: number;
  deletions: number;
  filesChanged: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface OpenCodeSessionDetail extends OpenCodeSessionView {
  cost?: number;
  tokens?: { input?: number; output?: number; reasoning?: number };
  version?: string;
}

export interface CreateOpenCodeSessionInput {
  title: string;
  directory?: string;
  agent?: string;
  model?: { providerId?: string; modelId?: string };
}

/** Map an upstream runtime status into a display status without inventing values. */
export function deriveSessionStatus(type: string | undefined): OpenCodeSessionViewStatus {
  switch (type) {
    case 'busy':
      return 'active';
    case 'idle':
      return 'idle';
    case 'error':
      return 'failed';
    default:
      return 'unknown';
  }
}

/** Normalize a raw session into a view model. */
export function normalizeSession(raw: OpenCodeRawSession, runtimeStatus?: string): OpenCodeSessionView {
  const created = raw.time?.created ? new Date(raw.time.created).toISOString() : undefined;
  const updated = raw.time?.updated ? new Date(raw.time.updated).toISOString() : undefined;
  return {
    id: raw.id,
    title: raw.title || raw.slug || 'Untitled session',
    slug: raw.slug,
    directory: raw.directory,
    agent: raw.agent,
    model: raw.model ? { id: raw.model.id, providerID: raw.model.providerID } : undefined,
    parentID: raw.parentID,
    status: deriveSessionStatus(runtimeStatus),
    additions: raw.summary?.additions ?? 0,
    deletions: raw.summary?.deletions ?? 0,
    filesChanged: raw.summary?.files ?? 0,
    createdAt: created,
    updatedAt: updated,
  };
}

/** Merge a raw session with the runtime status map into a view model. */
export function normalizeSessionWithStatus(
  raw: OpenCodeRawSession,
  statusMap: Record<string, { type?: string }>,
): OpenCodeSessionView {
  return normalizeSession(raw, statusMap[raw.id]?.type);
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

  // ── Sessions ────────────────────────────────────────────────

  sessions: async (): Promise<OpenCodeSessionView[]> => {
    const [list, status] = await Promise.all([
      fetchJSON<{ sessions: OpenCodeRawSession[] }>('/api/opencode/sessions'),
      fetchJSON<{ status: Record<string, { type?: string }> }>('/api/opencode/sessions/status'),
    ]);
    const rawSessions = list?.sessions ?? [];
    const statusMap = status?.status ?? {};
    return rawSessions.map((raw) => normalizeSessionWithStatus(raw, statusMap));
  },

  session: async (sessionId: string): Promise<OpenCodeSessionDetail | null> => {
    const [detail, status] = await Promise.all([
      fetchJSON<{ session: OpenCodeRawSession }>(`/api/opencode/sessions/${encodeURIComponent(sessionId)}`),
      fetchJSON<{ status: Record<string, { type?: string }> }>('/api/opencode/sessions/status'),
    ]);
    const raw = detail?.session;
    if (!raw) return null;
    const runtimeStatus = status?.status?.[sessionId]?.type;
    const view = normalizeSession(raw, runtimeStatus);
    return { ...view, cost: raw.cost, tokens: raw.tokens, version: raw.version };
  },

  createSession: async (input: CreateOpenCodeSessionInput): Promise<{ session: OpenCodeSessionDetail } | null> => {
    const body: Record<string, unknown> = { title: input.title };
    if (input.directory) body.directory = input.directory;
    if (input.agent) body.agent = input.agent;
    if (input.model) body.model = { providerID: input.model.providerId, modelID: input.model.modelId };
    const res = await fetch('/api/opencode/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { session: OpenCodeRawSession };
    return {
      session: {
        ...normalizeSession(data.session),
        cost: data.session.cost,
        tokens: data.session.tokens,
        version: data.session.version,
      },
    };
  },

  renameSession: async (sessionId: string, title: string): Promise<OpenCodeSessionDetail | null> => {
    const res = await fetch(`/api/opencode/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { session: OpenCodeRawSession };
    return { ...normalizeSession(data.session) };
  },

  deleteSession: async (sessionId: string): Promise<boolean> => {
    const res = await fetch(`/api/opencode/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
    return res.ok;
  },
};
