const API_BASE = '';

async function fetchJSON(path: string): Promise<any> {
  try {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return await res.json();
  } catch {
    return null;
  }
}

export interface WorkspaceData {
  name: string;
  language: string;
  framework: string | null;
  packageManager: string | null;
  fileCount: number;
  packageCount: number;
  dependencyCount: number;
  isMonorepo: boolean;
  healthScore: number | null;
  entryPoints: string[];
}

export interface SessionData {
  id: string;
  title: string;
  status: string;
  repository: string;
  fileCount: number;
  packageCount: number;
  healthScore: number | null;
}

export interface AgentData {
  name: string;
  role: string;
  status: string;
  capabilities: string[];
}

export interface ActivityEvent {
  id: string;
  timestamp: string;
  category: string;
  type: string;
  actor: { id: string; name: string; type: 'user' | 'agent' | 'system' };
  resource: { type: string; id: string; name: string };
  message: string;
  metadata: Record<string, unknown>;
}

export async function getWorkspace(): Promise<WorkspaceData | null> {
  const data = await fetchJSON('/api/workspace');
  return data?.workspace ?? null;
}

export async function getSessions(): Promise<SessionData[]> {
  const data = await fetchJSON('/api/sessions');
  return data?.sessions ?? [];
}

export async function getHealth(): Promise<any> {
  return fetchJSON('/api/health');
}

export async function getAgents(): Promise<AgentData[]> {
  const data = await fetchJSON('/api/agents');
  return data?.agents ?? [];
}

export async function getActivity(options?: {
  category?: string;
  type?: string;
  limit?: number;
  before?: string;
}): Promise<ActivityEvent[]> {
  const params = new URLSearchParams();
  if (options?.category) params.set('category', options.category);
  if (options?.type) params.set('type', options.type);
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.before) params.set('before', options.before);
  const qs = params.toString();
  const data = await fetchJSON(`/api/activity${qs ? `?${qs}` : ''}`);
  return data?.events ?? [];
}

export async function getSuggestions(): Promise<
  Array<{ id: string; priority: string; title: string; description?: string; impact?: string; command?: string }>
> {
  const data = await fetchJSON('/api/suggestions');
  return data?.suggestions ?? [];
}

export async function getWorkflow(): Promise<{
  workflows: Array<{ id: string; label: string; steps: number }>;
} | null> {
  const data = await fetchJSON('/api/workflows');
  return data ?? null;
}

let currentActor = 'eddie';

export function getActor(): string {
  return currentActor;
}

export function setActor(name: string): void {
  currentActor = name;
}

export const api: any = {
  health: async () => {
    const data = await fetchJSON('/api/health');
    return data ?? { status: 'unknown' };
  },
  agents: async () => {
    const data = await fetchJSON('/api/agents');
    return data ?? { agents: [] };
  },
  sessions: async () => {
    const data = await fetchJSON('/api/sessions');
    return data ?? { sessions: [] };
  },
  session: async (id: string) => {
    const data = await fetchJSON(`/api/sessions/${id}`);
    return data ?? { session: null };
  },
  createSession: async (title: string, _objective?: string) => {
    const data = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title || 'Untitled session', objective: _objective || title }),
    });
    if (!data.ok) throw new Error(`createSession failed: ${data.status}`);
    return data.json();
  },
  artifacts: async () => ({ chain: [], plans: [], changeSets: [], collaboration: [] }),
  memory: async (_query?: string) => ({ results: [], stats: { nodes: 0, relations: 0 } }),
};

export type AgentDto = any;
export type ExecutionDto = any;
export type SessionDto = any;
