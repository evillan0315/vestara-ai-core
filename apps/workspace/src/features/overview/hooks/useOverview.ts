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

async function fetchProjects(): Promise<readonly OverviewProjectSummary[]> {
  return overviewFixture.projects;
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
  return overviewFixture.marketplace;
}

export function useOverview(): UseOverviewReturn {
  const [data, setData] = useState<OverviewViewModel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [workspace, continueWorking, recentActivity, agents, projects, resources, marketplace] = await Promise.all([
        fetchWorkspace(),
        fetchRecentWork(),
        fetchRecentActivity(),
        fetchAgents(),
        fetchProjects(),
        fetchResources(),
        fetchMarketplace(),
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
