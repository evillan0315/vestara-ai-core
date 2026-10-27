import { useCallback, useEffect, useState } from 'react';
import { useToasts } from '../components/Toast';
import { useEventStream } from '../lib/useEventStream';
import { type MultiAgentWorkflowTemplateId, workflowApi } from '../lib/workflow';
import { workspaceSocket } from '../lib/ws';
import { AgentCatalogTabs, type AgentCatalogTab } from './Agents/AgentCatalogTabs';
import { AgentCategoryList } from './Agents/AgentCategoryList';
import AgentControlHeader from './Agents/AgentControlHeader';
import AgentDetailPanel from './Agents/AgentDetailPanel';
import { AgentFilters, type AgentFiltersState } from './Agents/AgentFilters';
import AgentRegistryModal from './Agents/AgentRegistryModal';
import { apiFetch } from './Agents/api';
import { ExecutionChart } from './Agents/charts/ExecutionChart';
// ALL_AGENT_SLOTS removed — agents are sourced dynamically from GET /api/agents
import ExecutionSummaryPanel from './Agents/ExecutionSummaryPanel';
import LiveActivityPanel from './Agents/LiveActivityPanel';
import RuntimeStatusBar from './Agents/RuntimeStatusBar';
import TeamCreatorModal from './Agents/TeamCreatorModal';
import TeamsPanel from './Agents/TeamsPanel';
import type { Agent, Execution, Team } from './Agents/types';
import { useAgentCatalog } from './Agents/useAgentCatalog';
import WorkflowPanel from './Agents/WorkflowPanel';
import '../styles/marketplace.css';

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [showRegistry, setShowRegistry] = useState(false);
  const [showTeamCreator, setShowTeamCreator] = useState(false);
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [showWorkflowPanel, setShowWorkflowPanel] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [catalogTab, setCatalogTab] = useState<AgentCatalogTab>('all');
  const [filters, setFilters] = useState<AgentFiltersState>({ search: '', status: 'all', team: 'all', sort: 'name-asc', capabilities: [] });
  const { events } = useEventStream();
  const { addToast } = useToasts();

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ agents: Agent[]; executions: Execution[] }>('/api/agents');
      setAgents(data.agents);
      setExecutions(data.executions);
      setSelectedAgentId((current) => current && data.agents.some((agent) => agent.id === current) ? current : data.agents[0]?.id ?? null);
      const teamData = await apiFetch<{ teams: Team[] }>('/api/teams').catch(() => ({ teams: [] }));
      setTeams(teamData.teams);
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

  // Derived catalog state lives in useAgentCatalog — the page keeps
  // fetching, mutations, and modal/tab selection state.
  const { allCapabilities, agentStats, catalogAgents, filteredAgents, selectedAgent, selectedExecutions, execSummary } =
    useAgentCatalog({ agents, executions, catalogTab, filters, selectedAgentId });

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
      addToast({ type: 'success', message: 'Agent deleted' });
      load();
    } catch (err: any) {
      addToast({ type: 'error', message: `Failed to delete: ${err.message}` });
    }
  };

  const saveAgent = async (agent: Partial<Agent>) => {
    try {
      const clean = Object.fromEntries(Object.entries(agent).filter(([_, v]) => v !== undefined));
      const isNewRegistration = !editAgent?.id;
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
    setEditAgent(agent);
    setShowRegistry(true);
  };

  const runTaskForSelectedAgent = () => {
    if (!selectedAgent) return;
    window.dispatchEvent(new CustomEvent('open-assistant', { detail: { agentId: selectedAgent.id } }));
  };

  return (
    <div className="w-full">
      <AgentControlHeader
        agentsCount={agents.length}
        activeCount={agents.filter((a) => a.status === 'active').length}
        totalSlots={agents.length}
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

      <AgentCatalogTabs activeTab={catalogTab} onChange={setCatalogTab} />

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
        totalSlots={catalogAgents.length}
        allCapabilities={allCapabilities}
        onChange={setFilters}
      />

      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <AgentCategoryList
          agents={filteredAgents}
          agentStats={agentStats}
          selectedAgentId={selectedAgent?.id}
          onSelectAgent={(agent) => setSelectedAgentId(agent.id)}
          onEditAgent={openEditAgent}
          onToggleStatus={(agent) => void toggleAgentStatus(agent)}
          onDeleteAgent={(id) => void deleteAgent(id)}
        />
        <AgentDetailPanel
          agent={selectedAgent}
          stats={selectedAgent ? agentStats[selectedAgent.id] : undefined}
          executions={selectedExecutions}
          onEdit={() => selectedAgent && openEditAgent(selectedAgent)}
          onRunTask={runTaskForSelectedAgent}
        />
      </div>

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
          roleSuggestions={agents.map((a) => a.role)}
          onSave={saveAgent}
          onClose={() => {
            setShowRegistry(false);
            setEditAgent(null);
          }}
        />
      )}
      {showTeamCreator && <TeamCreatorModal onSave={createTeam} onClose={() => setShowTeamCreator(false)} />}
    </div>
  );
}
