/**
 * Workspace API client.
 *
 * Thin fetch wrapper around the Vestara API server (apps/api).
 * Response shapes must match what the server actually returns.
 *
 * Architecture Traceability:
 *   PCS: PCS-010 — Workspace UI
 */

import { resolveHttpUrl } from './clientConfig';

async function fetchJSON(path: string, options?: RequestInit): Promise<any> {
  try {
    const res = await fetch(resolveHttpUrl(path), {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
    return await res.json();
  } catch {
    return null;
  }
}

// ─── Types ────────────────────────────────────────────────────

/** Workspace identity + profile shape from GET /api/workspace */
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

/** Engineering session shape from GET /api/sessions */
export interface SessionData {
  id: string;
  title: string;
  status: string;
  objective?: string;
  createdAt: string;
  completedAt?: string;
  artifacts?: string[];
  participants?: Array<{ id: string; type: string; role: string }>;
}

/** Execution session shape from GET /api/sessions/executions */
export interface ExecutionSessionData {
  id: string;
  goal: string;
  status: string;
  workflowId?: string;
  assignedAgentIds?: string[];
  planIds?: string[];
  changeSetIds?: string[];
  verificationIds?: string[];
  timeline?: Array<{ step: string; agentId: string; status: string; timestamp: string }>;
  metrics?: { duration: number; totalSteps: number; completedSteps: number; artifactCount: number };
  createdAt: string;
  completedAt?: string;
}

/** Agent shape from GET /api/agents */
export interface AgentData {
  id: string;
  name: string;
  role: string;
  status: string;
  capabilities: string[];
  description?: string;
  provider?: string;
  model?: string;
  teamId?: string;
  color?: string;
}

/** Activity event shape from GET /api/activity */
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

/** Plan shape from GET /api/plans */
export interface PlanData {
  id: string;
  title: string;
  goal: string;
  status: string;
  scope?: string[];
  tasks?: Array<{ id: string; summary: string; description?: string; status: string; effort?: string; files?: string[] }>;
  assumptions?: string[];
  risks?: Array<{ description: string; severity: string }>;
  createdAt: string;
  updatedAt: string;
}

/** Verification report shape from GET /api/verifications */
export interface VerificationData {
  id: string;
  planId?: string;
  changeSetId?: string;
  status: string;
  checks: Array<{ type: string; status: string; output?: string; durationMs: number }>;
  summary: { total: number; passed: number; failed: number; skipped: number };
  createdAt: string;
}

// ─── API Functions ────────────────────────────────────────────

/**
 * Fetch workspace identity + profile.
 * GET /api/workspace returns { status, fingerprint, profile, presentation }.
 * We extract the display fields from `profile` and `fingerprint`.
 */
export async function getWorkspace(): Promise<WorkspaceData | null> {
  const data = await fetchJSON('/api/workspace');
  if (!data) return null;
  const fp = data.fingerprint ?? {};
  const profile = data.profile ?? {};
  return {
    name: fp.name ?? profile.name ?? 'unknown',
    language: profile.language ?? 'unknown',
    framework: profile.framework ?? null,
    packageManager: profile.packageManager ?? null,
    fileCount: profile.fileCount ?? 0,
    packageCount: profile.packageCount ?? 0,
    dependencyCount: profile.dependencyCount ?? 0,
    isMonorepo: profile.isMonorepo ?? false,
    healthScore: profile.healthScore?.overall ?? profile.healthScore ?? null,
    entryPoints: (profile.entryPoints ?? []).map((ep: any) => ep.path ?? ep),
  };
}

/**
 * Fetch workspace identity (id + name) from the workspace manifest.
 * GET /api/workspace returns { status, fingerprint, profile, presentation }.
 * Used by SurfaceContext for bounded workspace scope reference.
 */
export async function getWorkspaceIdentity(): Promise<{ id: string; name: string } | null> {
  const data = await fetchJSON('/api/workspace');
  if (!data) return null;
  const fp = data.fingerprint ?? {};
  return {
    id: fp.id ?? 'unknown',
    name: fp.name ?? 'unknown',
  };
}

/** Fetch engineering sessions. GET /api/sessions → { sessions } */
export async function getSessions(): Promise<SessionData[]> {
  const data = await fetchJSON('/api/sessions');
  return data?.sessions ?? [];
}

/** Fetch execution sessions (multi-agent workflow runs). GET /api/sessions/executions → { sessions } */
export async function getExecutionSessions(): Promise<ExecutionSessionData[]> {
  const data = await fetchJSON('/api/sessions/executions');
  return data?.sessions ?? [];
}

/** Fetch system health. GET /api/health */
export async function getHealth(): Promise<any> {
  return fetchJSON('/api/health');
}

/** Fetch agents with stats. GET /api/agents → { agents, executions } */
export async function getAgents(): Promise<AgentData[]> {
  const data = await fetchJSON('/api/agents');
  return data?.agents ?? [];
}

/** Fetch activity log events. GET /api/activity → { events } */
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

/** Fetch AI suggestions. GET /api/suggestions → { suggestions } */
export async function getSuggestions(): Promise<
  Array<{ id: string; priority: string; title: string; description?: string; impact?: string; command?: string }>
> {
  const data = await fetchJSON('/api/suggestions');
  return data?.suggestions ?? [];
}

/** Fetch workflow definitions. GET /api/workflows → { workflows } */
export async function getWorkflow(): Promise<{
  workflows: Array<{ id: string; label: string; steps: number }>;
} | null> {
  const data = await fetchJSON('/api/workflows');
  return data ?? null;
}

/** Fetch plans. GET /api/plans → { plans } */
export async function getPlans(): Promise<PlanData[]> {
  const data = await fetchJSON('/api/plans');
  return data?.plans ?? [];
}

/** Fetch verification reports. GET /api/verifications → { verifications } */
export async function getVerifications(): Promise<VerificationData[]> {
  const data = await fetchJSON('/api/verifications');
  return data?.verifications ?? [];
}

/**
 * Fetch the full artifact chain.
 * GET /api/artifacts → { chain, plans, changeSets, collaboration }
 */
export async function getArtifacts(): Promise<{
  chain: string[];
  plans: PlanData[];
  changeSets: any[];
  collaboration: any[];
}> {
  const data = await fetchJSON('/api/artifacts');
  return data ?? { chain: [], plans: [], changeSets: [], collaboration: [] };
}

/**
 * Fetch memory/knowledge graph.
 * GET /api/memory → { nodes, relations, stats }
 */
export async function getMemory(query?: string): Promise<{
  results?: any[];
  nodes?: any[];
  relations?: any[];
  stats: { nodes: number; relations: number };
}> {
  const url = query ? `/api/memory?q=${encodeURIComponent(query)}` : '/api/memory';
  const data = await fetchJSON(url);
  if (!data) return { results: [], stats: { nodes: 0, relations: 0 } };
  // The API returns { results: [...] } for searches, or { nodes, relations, stats } for listing
  if (data.results) return data;
  return {
    nodes: data.nodes ?? [],
    relations: data.relations ?? [],
    stats: data.stats ?? { nodes: 0, relations: 0 },
  };
}

// ─── Plan Actions ────────────────────────────────────────────

/** Approve a plan. POST /api/plans/:id/approve */
export async function approvePlan(planId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/plans/${encodeURIComponent(planId)}/approve`, { method: 'POST' });
    return res.ok;
  } catch {
    return false;
  }
}

/** Implement a plan (generate change set). POST /api/implement */
export async function implementPlan(planId: string): Promise<{ changeSet?: any; error?: string } | null> {
  try {
    const res = await fetch('/api/implement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      return { error: err.error || res.statusText };
    }
    return await res.json();
  } catch (err: any) {
    return { error: err.message };
  }
}

/** Verify a change set. POST /api/verify */
export async function verifyChangeSet(changeSetId: string): Promise<{ report?: any; error?: string } | null> {
  try {
    const res = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changeSetId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      return { error: err.error || res.statusText };
    }
    return await res.json();
  } catch (err: any) {
    return { error: err.message };
  }
}

// ─── Actor tracking ──────────────────────────────────────────

let currentActor = 'eddie';

export function getActor(): string {
  return currentActor;
}

export function setActor(name: string): void {
  currentActor = name;
}

// ─── Legacy api object (kept for backward compatibility) ─────

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
  artifacts: async () => {
    const data = await fetchJSON('/api/artifacts');
    return data ?? { chain: [], plans: [], changeSets: [], collaboration: [] };
  },
  memory: async (query?: string) => {
    const url = query ? `/api/memory?q=${encodeURIComponent(query)}` : '/api/memory';
    const data = await fetchJSON(url);
    if (!data) return { results: [], stats: { nodes: 0, relations: 0 } };
    if (data.results) return data;
    return { nodes: data.nodes ?? [], relations: data.relations ?? [], stats: data.stats ?? { nodes: 0, relations: 0 } };
  },
};

export type AgentDto = any;
export type ExecutionDto = any;
export type SessionDto = any;
