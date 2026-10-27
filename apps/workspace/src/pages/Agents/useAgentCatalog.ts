import { useMemo } from 'react';
import type { AgentCatalogTab } from './AgentCatalogTabs';
import type { AgentFiltersState } from './AgentFilters';
import type { Agent, AgentStats, Execution, ExecutionSummary } from './types';

export interface AgentCatalogInput {
  agents: Agent[];
  executions: Execution[];
  catalogTab: AgentCatalogTab;
  filters: AgentFiltersState;
  selectedAgentId: string | null;
}

export interface AgentCatalog {
  allCapabilities: string[];
  agentStats: Record<string, AgentStats>;
  catalogAgents: Agent[];
  filteredAgents: Agent[];
  selectedAgent: Agent | null;
  selectedExecutions: Execution[];
  execSummary: ExecutionSummary;
}

/**
 * useAgentCatalog — derived catalog state for the Agent Control page.
 *
 * Pure derivation only: capability index, per-agent stats, tab scoping,
 * filter + sort, selection resolution, and the execution summary.
 * Moved verbatim from `Agents.tsx` so behavior is unchanged; the page
 * keeps ownership of fetching, mutations, and modal/tab selection state.
 */
export function useAgentCatalog({ agents, executions, catalogTab, filters, selectedAgentId }: AgentCatalogInput): AgentCatalog {
  // Agents sourced dynamically from GET /api/agents — no hardcoded slots
  const allCapabilities = useMemo(() => {
    const caps = new Set<string>();
    for (const a of agents) {
      for (const c of a.capabilities || []) caps.add(c);
    }
    return Array.from(caps);
  }, [agents]);

  const agentStats = useMemo(() => {
    const stats: Record<string, AgentStats> = {};
    for (const a of agents) {
      const exs = executions.filter(
        (e) =>
          e.agentId === a.id ||
          a.name.toLowerCase().includes(e.agentId.split('-').pop()?.toLowerCase() || '') ||
          e.agentId.includes(a.role),
      );
      const completed = exs.filter((e) => e.status === 'completed');
      const durations = completed
        .filter((e) => e.completedAt)
        .map((e) => (new Date(e.completedAt!).getTime() - new Date(e.startedAt).getTime()) / 1000);
      stats[a.id] = {
        total: exs.length,
        completed: completed.length,
        failed: exs.filter((e) => e.status === 'failed').length,
        running: exs.filter((e) => e.status === 'running' || e.status === 'queued').length,
        avgDuration: durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
      };
    }
    return stats;
  }, [agents, executions]);

  const catalogAgents = useMemo(() => {
    if (catalogTab === 'mine') return agents.filter((agent) => agent.origin === 'user');
    if (catalogTab === 'system') return agents.filter((agent) => agent.origin === 'system');
    if (catalogTab === 'custom') return agents.filter((agent) => agent.agentType === 'registry' || agent.origin === 'user');
    if (catalogTab === 'skills') return agents.filter((agent) => agent.capabilities.length > 0);
    return agents;
  }, [agents, catalogTab]);

  const filteredAgents = useMemo(() => {
    const filtered = catalogAgents.filter((a) => {
      if (filters.status === 'active' && a.status !== 'active') return false;
      if (filters.status === 'disabled' && a.status !== 'disabled') return false;
      if (filters.team !== 'all' && a.teamId !== filters.team) return false;
      if (filters.capabilities.length > 0) {
        const agentCaps = a.capabilities || [];
        if (!filters.capabilities.some((c) => agentCaps.includes(c))) return false;
      }
      if (filters.search.trim()) {
        const q = filters.search.toLowerCase();
        if (
          !a.name.toLowerCase().includes(q) &&
          !a.role.toLowerCase().includes(q) &&
          !(a.description || '').toLowerCase().includes(q) &&
          !(a.capabilities || []).some((c: string) => c.toLowerCase().includes(q))
        )
          return false;
      }
      return true;
    });

    const sorted = [...filtered];
    switch (filters.sort) {
      case 'name-asc':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'name-desc':
        sorted.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case 'last-execution':
        sorted.sort((a, b) => {
          const aLast = executions.find((e) => e.agentId === a.id)?.startedAt ?? '';
          const bLast = executions.find((e) => e.agentId === b.id)?.startedAt ?? '';
          return bLast.localeCompare(aLast);
        });
        break;
      case 'success-rate':
        sorted.sort((a, b) => {
          const aStats = agentStats[a.id];
          const bStats = agentStats[b.id];
          const aRate = aStats?.total ? aStats.completed / aStats.total : 0;
          const bRate = bStats?.total ? bStats.completed / bStats.total : 0;
          return bRate - aRate;
        });
        break;
      case 'status':
        sorted.sort((a, b) => {
          const order: Record<string, number> = { active: 0, disabled: 2 };
          return (order[a.status] ?? 3) - (order[b.status] ?? 3);
        });
        break;
    }
    return sorted;
  }, [catalogAgents, filters, executions, agentStats]);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? filteredAgents[0] ?? null,
    [agents, filteredAgents, selectedAgentId],
  );

  const selectedExecutions = useMemo(
    () => (selectedAgent ? executions.filter((execution) => execution.agentId === selectedAgent.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt)) : []),
    [executions, selectedAgent],
  );

  const execSummary = useMemo<ExecutionSummary>(() => {
    const total = executions.filter((e) => e.status !== 'running' && e.status !== 'queued').length || 1;
    const completed = executions.filter((e) => e.status === 'completed').length;
    const failed = executions.filter((e) => e.status === 'failed').length;
    const running = executions.filter((e) => e.status === 'running' || e.status === 'queued').length;
    return { total, completed, failed, running, successRate: Math.round((completed / total) * 100) };
  }, [executions]);

  return { allCapabilities, agentStats, catalogAgents, filteredAgents, selectedAgent, selectedExecutions, execSummary };
}
