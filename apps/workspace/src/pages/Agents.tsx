import { useCallback, useEffect, useMemo, useState } from 'react';
import ExecutionDetailModal from '../components/ExecutionDetailModal';
import { useToasts } from '../components/Toast';
import { useEventStream } from '../lib/useEventStream';
import { type MultiAgentWorkflowTemplateId, workflowApi } from '../lib/workflow';
import { workspaceSocket } from '../lib/ws';
import { AgentCategoryList } from './Agents/AgentCategoryList';
import AgentControlHeader from './Agents/AgentControlHeader';
import { AgentFilters, type AgentFiltersState } from './Agents/AgentFilters';
import AgentRegistryModal from './Agents/AgentRegistryModal';
import { apiFetch } from './Agents/api';
import { ExecutionChart } from './Agents/charts/ExecutionChart';
import { ALL_AGENT_SLOTS } from './Agents/constants';
import ExecutionSummaryPanel from './Agents/ExecutionSummaryPanel';
import LiveActivityPanel from './Agents/LiveActivityPanel';
import RuntimeStatusBar from './Agents/RuntimeStatusBar';
import TeamCreatorModal from './Agents/TeamCreatorModal';
import TeamsPanel from './Agents/TeamsPanel';
import type { Agent, AgentStats, Execution, ExecutionSummary, HarnessSessionEntry, Team } from './Agents/types';
import WorkflowPanel from './Agents/WorkflowPanel';

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [selectedExecution, setSelectedExecution] = useState<Execution | null>(null);
  const [harnessSessions, setHarnessSessions] = useState<HarnessSessionEntry[]>([]);
  const [showRegistry, setShowRegistry] = useState(false);
  const [showTeamCreator, setShowTeamCreator] = useState(false);
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [showWorkflowPanel, setShowWorkflowPanel] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [filters, setFilters] = useState<AgentFiltersState>({ search: '', status: 'all', team: 'all', sort: 'name-asc', capabilities: [] });
  const { events } = useEventStream();
  const { addToast } = useToasts();

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ agents: Agent[]; executions: Execution[] }>('/api/agents');
      setAgents(data.agents);
      setExecutions(data.executions);
      const teamData = await apiFetch<{ teams: Team[] }>('/api/teams').catch(() => ({ teams: [] }));
      setTeams(teamData.teams);
      const sessionData = await apiFetch<{
        sessions: Array<{ id: string; workflowId?: string; goal?: string; status: string; createdAt: string }>;
      }>('/api/sessions/executions').catch(() => null);
      if (sessionData?.sessions)
        setHarnessSessions(sessionData.sessions.filter((s) => (s.workflowId ?? '').startsWith('thread:')));
    } catch {}
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const off = workspaceSocket.onEvent((evt) => {
      if (evt.type.startsWith('agent.') || evt.type === 'agent.started' || evt.type === 'agent.completed') load();
    });
    return off;
  }, [load]);

  const allAgentSlots = useMemo<Agent[]>(() => {
    return ALL_AGENT_SLOTS.map((slot) => {
      const registered = agents.find((a) => a.role === slot.role);
      return (
        registered ||
        ({
          id: `slot-${slot.role}`,
          name: slot.defaultName,
          role: slot.role,
          description: 'Not registered — add via Agent Registry',
          capabilities: [],
          permissions: [],
          status: 'unregistered',
          color: slot.color,
          agentType: 'workspace',
          createdAt: '',
        } as Agent)
      );
    });
  }, [agents]);

  const allCapabilities = useMemo(() => {
    const caps = new Set<string>();
    for (const slot of ALL_AGENT_SLOTS) {
      for (const c of slot.defaultCapabilities || []) caps.add(c);
    }
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

  const filteredAgents = useMemo(() => {
    const filtered = allAgentSlots.filter((a) => {
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
          const order = { active: 0, unregistered: 1, disabled: 2 };
          return (order[a.status as keyof typeof order] ?? 3) - (order[b.status as keyof typeof order] ?? 3);
        });
        break;
    }
    return sorted;
  }, [allAgentSlots, filters, executions, agentStats]);

  const toggleAgentStatus = async (agent: Agent) => {
    try {
      await apiFetch(`/api/agents/${agent.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: agent.status === 'active' ? 'disabled' : 'active' }),
      });
      addToast({ type: 'success', message: `${agent.name} ${agent.status === 'active' ? 'disabled' : 'enabled'}` });
      load();
    } catch (err: any) {
      addToast({ type: 'error', message: `Failed to update: ${err.message}` });
    }
  };

  const deleteAgent = async (id: string) => {
    if (!window.confirm('Delete this agent?')) return;
    try {
      await apiFetch(`/api/agents/${id}`, { method: 'DELETE' });
      if (selectedAgent?.id === id) setSelectedAgent(null);
      addToast({ type: 'success', message: 'Agent deleted' });
      load();
    } catch (err: any) {
      addToast({ type: 'error', message: `Failed to delete: ${err.message}` });
    }
  };

  const saveAgent = async (agent: Partial<Agent>) => {
    try {
      const clean = Object.fromEntries(Object.entries(agent).filter(([_, v]) => v !== undefined));
      const isNewRegistration = editAgent?.id?.startsWith('slot-') || editAgent?.status === 'unregistered';
      if (editAgent && !isNewRegistration) {
        await apiFetch(`/api/agents/${editAgent.id}`, {
          method: 'PUT',
          body: JSON.stringify(clean),
        });
        addToast({ type: 'success', message: `Agent "${clean.name || editAgent.name}" updated` });
      } else {
        await apiFetch('/api/agents', {
          method: 'POST',
          body: JSON.stringify({ ...clean, name: clean.name || 'New Agent' }),
        });
        addToast({ type: 'success', message: `Agent "${clean.name || 'New Agent'}" registered` });
      }
      setEditAgent(null);
      load();
    } catch (err: any) {
      addToast({ type: 'error', message: `Failed to save agent: ${err.message}` });
    }
  };

  const createTeam = async (name: string, description: string) => {
    try {
      await apiFetch('/api/teams', { method: 'POST', body: JSON.stringify({ name, description }) });
      setShowTeamCreator(false);
      load();
      addToast({ type: 'success', message: `Team "${name}" created` });
    } catch (err: any) {
      addToast({ type: 'error', message: `Failed to create team: ${err.message}` });
    }
  };

  const startWorkflow = async (goal: string, template: MultiAgentWorkflowTemplateId): Promise<boolean> => {
    try {
      const result = await workflowApi.start(goal, undefined, template);
      if (!result) {
        addToast({ type: 'error', message: 'Failed to start multi-agent workflow' });
        return false;
      }
      addToast({ type: 'success', message: `Workflow started: ${result.workflowId}` });
      setShowWorkflowPanel(false);
      load();
      return true;
    } catch (err: any) {
      addToast({ type: 'error', message: `Failed to start workflow: ${err.message}` });
      return false;
    }
  };

  const syncAgents = async () => {
    setSyncing(true);
    try {
      const result = await apiFetch<{ synced: number; files: string[]; agents: Array<{ id: string; name: string; role: string; runtimeAgent: string }> }>('/api/agents/sync', { method: 'POST' });
      addToast({ type: 'success', message: `Synced ${result.synced} agents to .opencode/agents/` });
      load();
    } catch (err: any) {
      addToast({ type: 'error', message: `Sync failed: ${err.message}` });
    } finally {
      setSyncing(false);
    }
  };

  const openEditAgent = (agent: Agent) => {
    const isRegistered = agent.status !== 'unregistered';
    const slot = ALL_AGENT_SLOTS.find((s) => s.role === agent.role);
    setEditAgent(
      isRegistered
        ? agent
        : ({
            ...agent,
            name: slot?.defaultName || agent.name,
            description: slot?.defaultDescription || '',
            capabilities: slot?.defaultCapabilities || [],
            color: slot?.color || agent.color,
            runtimeAgent: 'build',
          } as any),
    );
    setShowRegistry(true);
  };

  const execSummary = useMemo<ExecutionSummary>(() => {
    const total = executions.filter((e) => e.status !== 'running' && e.status !== 'queued').length || 1;
    const completed = executions.filter((e) => e.status === 'completed').length;
    const failed = executions.filter((e) => e.status === 'failed').length;
    const running = executions.filter((e) => e.status === 'running' || e.status === 'queued').length;
    return { total, completed, failed, running, successRate: Math.round((completed / total) * 100) };
  }, [executions]);

  return (
    <div className="w-full">
      <AgentControlHeader
        agentsCount={agents.length}
        activeCount={agents.filter((a) => a.status === 'active').length}
        totalSlots={ALL_AGENT_SLOTS.length}
        teamsCount={teams.length}
        executionsCount={executions.length}
        execSummary={execSummary}
        onAddAgent={() => {
          setEditAgent(null);
          setShowRegistry(true);
        }}
        onAddTeam={() => setShowTeamCreator(true)}
        onToggleWorkflow={() => setShowWorkflowPanel((current) => !current)}
        onRefresh={load}
        onSyncAgents={syncAgents}
        syncing={syncing}
      />

      <WorkflowPanel open={showWorkflowPanel} onStart={startWorkflow} />

      <RuntimeStatusBar />

      {/* Execution chart */}
      <div className="mb-5 max-w-xs">
        <ExecutionChart
          total={execSummary.total}
          completed={execSummary.completed}
          failed={execSummary.failed}
          running={execSummary.running}
        />
      </div>

      <AgentFilters
        teams={teams}
        resultCount={filteredAgents.length}
        totalSlots={ALL_AGENT_SLOTS.length}
        allCapabilities={allCapabilities}
        onChange={setFilters}
      />

      <AgentCategoryList
        agents={filteredAgents}
        teams={teams}
        executions={executions}
        agentStats={agentStats}
        selectedAgent={selectedAgent}
        harnessSessions={harnessSessions}
        onSelectAgent={setSelectedAgent}
        onEditAgent={openEditAgent}
        onToggleStatus={(agent) => void toggleAgentStatus(agent)}
        onDeleteAgent={(id) => void deleteAgent(id)}
        onOpenExecution={setSelectedExecution}
        onLoad={load}
      />

      {/* Sidebar panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-6">
        <LiveActivityPanel events={events} />
        <TeamsPanel teams={teams} agents={agents} onLoad={load} onOpenTeamCreator={() => setShowTeamCreator(true)} />
        <ExecutionSummaryPanel execSummary={execSummary} executionsCount={executions.length} executions={executions} />
      </div>

      {/* Modals */}
      {showRegistry && (
        <AgentRegistryModal
          agent={editAgent}
          teams={teams}
          onSave={saveAgent}
          onClose={() => {
            setShowRegistry(false);
            setEditAgent(null);
          }}
        />
      )}
      {showTeamCreator && <TeamCreatorModal onSave={createTeam} onClose={() => setShowTeamCreator(false)} />}
      {selectedExecution && (
        <ExecutionDetailModal
          execution={selectedExecution}
          agents={agents}
          onClose={() => setSelectedExecution(null)}
        />
      )}
    </div>
  );
}
