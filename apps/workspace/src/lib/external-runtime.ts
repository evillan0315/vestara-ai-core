/**
 * External Runtime API client + types.
 *
 * Mirrors apps/api/src/routes/external-runtime.ts and @vestara/external-runtime.
 */

export type ExternalRuntimeType = 'opencode' | 'claude-code' | 'openai-codex' | 'gemini' | 'unknown';
export type ExternalRuntimeIntegrationLevel = 'discovery-only' | 'snapshot' | 'live-observation' | 'vestara-launched' | 'full-observation';

export interface ExternalRuntimeInstance {
  id: string;
  runtimeType: ExternalRuntimeType;
  displayName: string;
  version?: string;
  executablePath?: string;
  processId?: number;
  serverUrl?: string;
  workspacePath?: string;
  connectionStatus: string;
  integrationLevel: ExternalRuntimeIntegrationLevel;
  verificationStatus: string;
  supportedCapabilities: string[];
  availableCapabilities: string[];
  capabilities: string[];
  discoveredAt: string;
  lastSeenAt: string;
  isPrimary?: boolean;
  isSecondary?: boolean;
}

export interface ExternalSessionSummary {
  id: string;
  externalSessionId: string;
  runtimeType: ExternalRuntimeType;
  runtimeInstanceId: string;
  title?: string;
  status: string;
  integrationLevel: ExternalRuntimeIntegrationLevel;
  agentId?: string;
  modelId?: string;
  startedAt?: string;
  lastActivityAt?: string;
  filesChanged?: number;
  toolCount?: number;
  commandCount?: number;
}

export interface ExternalAgentDefinition {
  id: string;
  name: string;
  mode: string;
  description?: string;
  model?: { providerId?: string; modelId: string };
  tools: Record<string, boolean>;
  permissions: Array<{ capability: string; decision: string; scope: string }>;
  builtIn: boolean;
  provenance: string;
}

export interface ExternalSkillDefinition {
  id: string;
  name: string;
  description: string;
  sourceScope: string;
  valid: boolean;
  license?: string;
}

export interface ExternalProvider {
  providerId: string;
  displayName?: string;
  configured: boolean;
  credentialSource: string;
  models: Array<{ modelId: string }>;
}

export interface ExternalConfigurationSource {
  id: string;
  scope: string;
  path: string;
  exists: boolean;
  precedence: number;
}

export interface PermissionRule {
  capability: string;
  pattern?: string;
  decision: 'allow' | 'ask' | 'deny';
  scope: string;
  provenance: string;
}

export interface TimelineItem {
  id: string;
  kind: string;
  label: string;
  at: string;
  runtimeType: string;
  runtimeInstanceId: string;
  agentId?: string;
  source: 'event-store' | 'session-detail' | 'session-summary' | 'snapshot';
  observationLevel: 'observed' | 'inferred' | 'reported' | 'partial';
  verificationStatus: string;
  noisy: boolean;
  promoted?: boolean;
  entityIds: string[];
  payload?: Record<string, unknown>;
}

export interface SessionRuntimeSnapshot {
  id: string;
  sessionId: string;
  runtimeInstanceId: string;
  runtimeVersion?: string;
  agentId?: string;
  providerId?: string;
  modelId?: string;
  availableSkillIds: string[];
  loadedSkillIds: string[];
  advertisedSkillIds: string[];
  effectiveConfigurationHash: string;
  observedAt: string;
  provenance: string;
}

export interface DriftChange {
  path: string;
  previous: unknown;
  current: unknown;
  change: 'updated' | 'added' | 'removed';
}

export interface DriftResult {
  instanceId: string;
  previousCapturedAt?: string;
  currentCapturedAt: string;
  previousHash?: string;
  currentHash: string;
  unchanged: boolean;
  firstSnapshot: boolean;
  changes: DriftChange[];
  affectedSessions: string[];
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

export interface WorkforceSnapshot {
  runtimes: ExternalRuntimeInstance[];
  vestara: { agents: Array<{ id: string; name: string; role: string; status: string; capabilities?: string[]; description?: string }> };
  external: Record<string, { agents: unknown[]; skills: unknown[]; permissions: PermissionRule[] }>;
  sessions: ExternalSessionSummary[];
}

export const externalRuntimeApi = {
  workforce: () => fetchJSON<WorkforceSnapshot>('/api/agents/workforce'),

  runtimes: () => fetchJSON<{ runtimes: ExternalRuntimeInstance[] }>('/api/external-runtime/runtimes'),

  discover: () => fetchJSON<{ runtimes: ExternalRuntimeInstance[] }>('/api/external-runtime/discover', { method: 'POST' }),

  sessions: () => fetchJSON<{ sessions: ExternalSessionSummary[] }>('/api/external-runtime/sessions'),

  session: (id: string) => fetchJSON<{ session: unknown }>(`/api/external-runtime/sessions/${encodeURIComponent(id)}`),

  sessionTimeline: (id: string) =>
    fetchJSON<{ session: unknown; snapshot: SessionRuntimeSnapshot | null; items: TimelineItem[]; sources: Record<string, number> }>(
      `/api/external-runtime/sessions/${encodeURIComponent(id)}/timeline`,
    ),

  sessionRuntimeSnapshot: (id: string) =>
    fetchJSON<{ snapshot: SessionRuntimeSnapshot | null }>(`/api/external-runtime/sessions/${encodeURIComponent(id)}/runtime-snapshot`),

  health: (instanceId: string) => fetchJSON<{ health: { status: string; version?: string; checkedAt: string } }>(`/api/external-runtime/runtimes/${encodeURIComponent(instanceId)}/health`),

  configuration: (instanceId: string) =>
    fetchJSON<{ configuration: { sources: ExternalConfigurationSource[]; effective: Record<string, unknown> } }>(
      `/api/external-runtime/runtimes/${encodeURIComponent(instanceId)}/configuration`,
    ),

  drift: (instanceId: string) => fetchJSON<{ drift: DriftResult | null }>(`/api/external-runtime/runtimes/${encodeURIComponent(instanceId)}/drift`),

  capabilities: (instanceId: string) =>
    fetchJSON<{ capabilities: string[] }>(`/api/external-runtime/runtimes/${encodeURIComponent(instanceId)}/capabilities`),

  intelligence: <T>(instanceId: string, kind: 'agents' | 'skills' | 'instructions' | 'commands' | 'plugins' | 'mcp' | 'providers' | 'models') =>
    fetchJSON<Record<string, T[]>>(`/api/external-runtime/runtimes/${encodeURIComponent(instanceId)}/${kind}`),

  permissions: (instanceId: string) => fetchJSON<{ permissions: PermissionRule[] }>(`/api/external-runtime/runtimes/${encodeURIComponent(instanceId)}/permissions`),
};
