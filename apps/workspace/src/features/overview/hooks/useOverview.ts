/**
 * VES-OVERVIEW-001: Overview Query Hook
 *
 * Fetches overview projection from domain APIs, falling back to the
 * v2 fixture dataset so the premium layout never renders hollow.
 *
 * Architecture Traceability:
 *   VES-OVERVIEW-001: Vestara Overview (phases 0-2)
 *   @see docs/blueprint/VESTARA-OVERVIEW-SCREEN.md
 */

import { useCallback, useEffect, useState } from 'react';
import { overviewFixture } from '../overview.fixtures';
import type {
  OverviewActivityItem,
  OverviewAgentSummary,
  OverviewHealthSummary,
  OverviewMarketplaceItem,
  OverviewProjectSummary,
  OverviewRecentWorkItem,
  OverviewResourceSummary,
  OverviewViewModel,
  OverviewWorkspaceSummary,
} from '../overview.types';

export interface UseOverviewReturn {
  readonly data: OverviewViewModel | null;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly refetch: () => Promise<void>;
}

async function apiFetch<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path, { headers: { 'Content-Type': 'application/json' } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function withFallback<T>(live: readonly T[] | null | undefined, fallback: readonly T[]): readonly T[] {
  return live && live.length > 0 ? live : fallback;
}

async function fetchWorkspace(): Promise<OverviewWorkspaceSummary> {
  const data = await apiFetch<{
    workspace?: { name?: string; description?: string; lastActivity?: string };
    health?: string;
  }>('/api/workspace');
  if (!data?.workspace) return overviewFixture.workspace;
  return {
    name: data.workspace.name ?? overviewFixture.workspace.name,
    description: data.workspace.description ?? overviewFixture.workspace.description,
    lastActivity: data.workspace.lastActivity ?? overviewFixture.workspace.lastActivity,
    health: (data.health as OverviewWorkspaceSummary['health']) ?? 'healthy',
  };
}

async function fetchRecentWork(): Promise<readonly OverviewRecentWorkItem[]> {
  const data = await apiFetch<{
    conversations?: Array<{ id: string; title: string; updatedAt: string; status?: string }>;
  }>('/api/conversations');
  if (!data?.conversations?.length) return overviewFixture.continueWorking;
  return data.conversations.slice(0, 5).map((c) => ({
    id: c.id,
    title: c.title || 'Untitled Conversation',
    type: 'conversation' as const,
    status: (c.status === 'active' ? 'running' : 'completed') as OverviewRecentWorkItem['status'],
    updatedAt: c.updatedAt,
  }));
}

async function fetchRecentActivity(): Promise<readonly OverviewActivityItem[]> {
  const data = await apiFetch<{
    events?: Array<{ id: string; actor?: string; message?: string; type?: string; timestamp?: string }>;
  }>('/api/diagnostics/events?limit=10');
  if (!data?.events?.length) return overviewFixture.recentActivity;
  return data.events.map((e) => ({
    id: e.id,
    actor: e.actor ?? 'System',
    action: e.message ?? 'Activity occurred',
    timestamp: e.timestamp ?? new Date().toISOString(),
    kind: (e.type as OverviewActivityItem['kind']) ?? 'agent-action',
    title: e.message ?? 'Activity occurred',
    detail: e.actor ?? undefined,
  }));
}

async function fetchAgents(): Promise<readonly OverviewAgentSummary[]> {
  const data = await apiFetch<{
    agents?: Array<{ id: string; name: string; role: string; status?: string; model?: string }>;
  }>('/api/agents');
  if (!data?.agents?.length) return overviewFixture.agents;
  return data.agents.map((a) => ({
    id: a.id,
    name: a.name,
    role: a.role,
    status: (a.status === 'active' ? 'online' : a.status === 'busy' ? 'busy' : 'offline') as OverviewAgentSummary['status'],
    model: a.model ?? 'unknown',
  }));
}

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  pushed_at: string;
  updated_at: string;
  archived: boolean;
  disabled: boolean;
  stargazers_count: number;
}

function githubOwnerFromRemote(remote: unknown): string | null {
  if (typeof remote !== 'string') return null;
  const m = remote.match(/github\.com[/:]([^/]+)\//);
  return m?.[1] ?? null;
}

async function fetchProjects(): Promise<readonly OverviewProjectSummary[]> {
  try {
    // Derive the GitHub owner from the workspace fingerprint so we list
    // the user's own repos instead of a hardcoded account. When the owner
    // cannot be determined, fall back to fixtures rather than fetching
    // another account's repositories.
    const ws = await apiFetch<{ fingerprint?: { gitRemote?: string } }>('/api/workspace');
    const owner = githubOwnerFromRemote(ws?.fingerprint?.gitRemote);
    if (!owner) return overviewFixture.projects;
    const res = await fetch(`https://api.github.com/users/${encodeURIComponent(owner)}/repos?sort=updated&per_page=5&type=owner`, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });
    if (!res.ok) return overviewFixture.projects;
    const repos = (await res.json()) as GitHubRepo[];
    if (!Array.isArray(repos) || repos.length === 0) return overviewFixture.projects;
    return repos.map((r) => ({
      id: String(r.id),
      name: r.name,
      description: r.description ?? r.full_name,
      language: r.language ?? undefined,
      health: r.archived || r.disabled ? ('degraded' as const) : ('healthy' as const),
      lastActivity: r.pushed_at ?? r.updated_at,
      starred: r.stargazers_count > 0,
    }));
  } catch {
    return overviewFixture.projects;
  }
}

async function fetchResources(): Promise<OverviewResourceSummary> {
  const data = await apiFetch<{
    memory?: { usedPercent?: number };
    disk?: { usePercent?: number };
    uptime?: string;
  }>('/api/diagnostics/summary');
  if (!data) return overviewFixture.resources;
  return {
    ...overviewFixture.resources,
    memory: data.memory?.usedPercent ?? overviewFixture.resources.memory,
    disk: data.disk?.usePercent ?? overviewFixture.resources.disk,
    uptime: data.uptime ?? overviewFixture.resources.uptime,
  };
}

async function fetchMarketplace(): Promise<readonly OverviewMarketplaceItem[]> {
  try {
    const { marketplaceClient } = await import('../../../lib/marketplace.js');
    const [searchResult, installedList] = await Promise.all([
      marketplaceClient.search({ limit: 5 }),
      marketplaceClient.installed().catch(() => []),
    ]);
    if (!searchResult.items.length) return overviewFixture.marketplace;
    const installedNames = new Set(installedList.map((i) => i.packageName));
    return searchResult.items.map((hit) => ({
      id: hit.asset.id,
      name: hit.asset.displayName,
      category: hit.asset.type,
      installed: installedNames.has(hit.asset.packageName),
      description: hit.asset.summary,
    }));
  } catch {
    return overviewFixture.marketplace;
  }
}

async function fetchHealth(): Promise<OverviewHealthSummary> {
  const fallback = overviewFixture.health;
  try {
    const [health, ci, git] = await Promise.all([
      apiFetch<{ status?: string; healthy?: boolean }>('/api/health'),
      apiFetch<{
        connection?: { status?: string };
        observation?: { availability?: string };
        webhookHealth?: { state?: string };
        correlation?: { staleCount?: number };
      }>('/api/ci/status'),
      apiFetch<{ dirty?: boolean; branch?: string }>('/api/diagnostics/git'),
    ]);
    if (!health && !ci && !git) return fallback;
    const apiState = health
      ? health.status === 'ok' || health.healthy === true
        ? ('healthy' as const)
        : ('degraded' as const)
      : fallback.api;
    const conn = ci?.connection?.status;
    const ciConnection =
      conn === 'connected' || conn === 'configured' || conn === 'unconfigured' || conn === 'error'
        ? conn
        : fallback.ciConnection;
    const staleWaits = ci?.correlation?.staleCount ?? fallback.staleWaits;
    const detail =
      ciConnection === 'configured'
        ? 'CI probe never run — verify via connection test'
        : staleWaits > 0
          ? `${staleWaits} stale CI wait${staleWaits === 1 ? '' : 's'}`
          : undefined;
    return {
      api: apiState,
      ciConnection,
      ciObservation: fallback.ciObservation,
      webhook: fallback.webhook,
      gitDirty: git?.dirty ?? fallback.gitDirty,
      staleWaits,
      ...(detail ? { detail } : {}),
    };
  } catch {
    return fallback;
  }
}

export function useOverview(): UseOverviewReturn {
  const [data, setData] = useState<OverviewViewModel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [workspace, continueWorking, recentActivity, agents, projects, resources, marketplace, health] = await Promise.all([
        fetchWorkspace(),
        fetchRecentWork(),
        fetchRecentActivity(),
        fetchAgents(),
        fetchProjects(),
        fetchResources(),
        fetchMarketplace(),
        fetchHealth(),
      ]);
      setData({
        workspace,
        continueWorking: withFallback(continueWorking, overviewFixture.continueWorking),
        recentActivity: withFallback(recentActivity, overviewFixture.recentActivity),
        agents: withFallback(agents, overviewFixture.agents),
        projects: withFallback(projects, overviewFixture.projects),
        resources,
        marketplace: withFallback(marketplace, overviewFixture.marketplace),
        focus: overviewFixture.focus,
        health,
      });
    } catch (err) {
      // Fall back to fixtures rather than a dead screen; record the error path.
      setData(overviewFixture);
      setError(err instanceof Error ? err.message : 'Failed to fetch overview data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refetch: fetchData };
}
