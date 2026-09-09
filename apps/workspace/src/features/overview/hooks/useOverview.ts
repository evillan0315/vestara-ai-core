/**
 * VES-OVERVIEW-001: Overview Query Hook
 *
 * Fetches overview data from multiple domain services and
 * assembles the OverviewViewModel.
 *
 * Architecture Traceability:
 *   VES-OVERVIEW-001: Vestara Overview (phases 0-2)
 *   @see docs/blueprint/VESTARA-OVERVIEW-SCREEN.md
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import { useCallback, useEffect, useState } from 'react';
import type {
  OverviewViewModel,
  OverviewWorkspaceSummary,
  OverviewRecentWorkItem,
  OverviewActivityItem,
  OverviewAgentSummary,
  OverviewProjectSummary,
  OverviewResourceSummary,
  OverviewMarketplaceItem,
  OverviewFocusItem,
} from './overview.types';

// ─── Types ─────────────────────────────────────────────────────

export interface UseOverviewReturn {
  /** Overview view model */
  readonly data: OverviewViewModel | null;

  /** Whether data is loading */
  readonly isLoading: boolean;

  /** Error message */
  readonly error: string | null;

  /** Refetch data */
  readonly refetch: () => Promise<void>;
}

// ─── API Client ────────────────────────────────────────────────

async function apiFetch<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ─── Data Fetchers ─────────────────────────────────────────────

async function fetchWorkspace(): Promise<OverviewWorkspaceSummary> {
  const data = await apiFetch<{
    workspace?: { name?: string; description?: string; lastActivity?: string };
    health?: string;
  }>('/api/workspace');

  return {
    name: data?.workspace?.name ?? 'Vestara Workspace',
    description: data?.workspace?.description ?? 'Engineering workspace',
    lastActivity: data?.workspace?.lastActivity ?? new Date().toISOString(),
    health: (data?.health as 'healthy' | 'degraded' | 'error') ?? 'healthy',
  };
}

async function fetchRecentWork(): Promise<readonly OverviewRecentWorkItem[]> {
  const data = await apiFetch<{ conversations?: Array<{
    id: string;
    title: string;
    updatedAt: string;
    status?: string;
  }> }>('/api/conversations');

  if (!data?.conversations) return [];

  return data.conversations.slice(0, 5).map((c) => ({
    id: c.id,
    title: c.title || 'Untitled Conversation',
    type: 'conversation' as const,
    status: (c.status === 'active' ? 'running' : 'completed') as const,
    updatedAt: c.updatedAt,
  }));
}

async function fetchRecentActivity(): Promise<readonly OverviewActivityItem[]> {
  const data = await apiFetch<{ events?: Array<{
    id: string;
    actor?: string;
    message?: string;
    type?: string;
    timestamp?: string;
  }> }>('/api/diagnostics/events?limit=10');

  if (!data?.events) return [];

  return data.events.map((e) => ({
    id: e.id,
    actor: e.actor ?? 'System',
    action: e.message ?? 'Activity occurred',
    timestamp: e.timestamp ?? new Date().toISOString(),
    kind: (e.type as OverviewActivityItem['kind']) ?? 'agent-action',
  }));
}

async function fetchAgents(): Promise<readonly OverviewAgentSummary[]> {
  const data = await apiFetch<{ agents?: Array<{
    id: string;
    name: string;
    role: string;
    status?: string;
    model?: string;
  }> }>('/api/agents');

  if (!data?.agents) return [];

  return data.agents.map((a) => ({
    id: a.id,
    name: a.name,
    role: a.role,
    status: (a.status === 'active' ? 'idle' : 'offline') as const,
    model: a.model ?? 'unknown',
  }));
}

async function fetchProjects(): Promise<readonly OverviewProjectSummary[]> {
  // Placeholder — in production, would fetch from /api/projects
  return [];
}

async function fetchResources(): Promise<OverviewResourceSummary> {
  const data = await apiFetch<{
    memory?: { usedPercent?: number };
    disk?: { usePercent?: number };
    uptime?: string;
  }>('/api/diagnostics/summary');

  return {
    cpu: 0, // Would need CPU data from diagnostics
    memory: data?.memory?.usedPercent ?? 0,
    disk: data?.disk?.usePercent,
    uptime: data?.uptime ?? 'Unknown',
    activeSessions: 0,
  };
}

async function fetchMarketplace(): Promise<readonly OverviewMarketplaceItem[]> {
  // Placeholder — in production, would fetch from /api/marketplace
  return [];
}

async function fetchFocus(): Promise<readonly OverviewFocusItem[]> {
  // Placeholder — in production, would derive from workspace state
  return [];
}

// ─── Hook ──────────────────────────────────────────────────────

/**
 * VES-OVERVIEW-001: React hook for overview data.
 */
export function useOverview(): UseOverviewReturn {
  const [data, setData] = useState<OverviewViewModel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch all data in parallel
      const [workspace, continueWorking, recentActivity, agents, projects, resources, marketplace, focus] =
        await Promise.all([
          fetchWorkspace(),
          fetchRecentWork(),
          fetchRecentActivity(),
          fetchAgents(),
          fetchProjects(),
          fetchResources(),
          fetchMarketplace(),
          fetchFocus(),
        ]);

      setData({
        workspace,
        continueWorking,
        recentActivity,
        agents,
        projects,
        resources,
        marketplace,
        focus,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch overview data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    isLoading,
    error,
    refetch: fetchData,
  };
}
