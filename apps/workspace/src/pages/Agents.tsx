import { useCallback, useEffect, useMemo, useState } from 'react';
import ExecutionDetailModal from '../components/ExecutionDetailModal';
import { HarnessThreadTimeline } from '../components/execution/harness-timeline';
import Pagination from '../components/Pagination';
import { useToasts } from '../components/Toast';
import { WorkflowRail } from '../components/workflow/WorkflowRail';
import { harnessApi, threadIdFromSession } from '../lib/agent-harness';
import { useEventStream } from '../lib/useEventStream';
import { type MultiAgentWorkflowTemplateId, type WorkflowProjection, workflowApi } from '../lib/workflow';
import { workspaceSocket } from '../lib/ws';
import AgentRegistryModal from './Agents/AgentRegistryModal';
import { AgentStatusBadge } from './Agents/AgentStatusBadge';
import { ExecutionChart } from './Agents/charts/ExecutionChart';
import { ALL_AGENT_SLOTS, CATEGORY_COLORS, CATEGORY_ORDER, ROLE_CATEGORIES, ROLE_COLORS } from './Agents/constants';
import TeamCreatorModal from './Agents/TeamCreatorModal';
import type { Agent, Execution, Team } from './Agents/types';

const API = '';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

const getColor = (a: Agent) => a.color || ROLE_COLORS[a.role] || '#6b7280';

const TERMINAL_STATES = ['completed', 'failed', 'blocked', 'cancelled'];

async function pollHarnessThread(threadId: string, timeoutMs: number): Promise<{ state: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snapshot = await harnessApi.thread(threadId);
    if (snapshot && TERMINAL_STATES.includes(snapshot.state)) return { state: snapshot.state };
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  throw new Error('Timed out waiting for harness run');
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [selectedExecution, setSelectedExecution] = useState<Execution | null>(null);
  const [runTask, setRunTask] = useState('');
  const [running, setRunning] = useState(false);
  const [runOutput, setRunOutput] = useState<string | null>(null);
  const [harnessSessions, setHarnessSessions] = useState<
    Array<{ id: string; workflowId?: string; goal?: string; status: string; createdAt: string }>
  >([]);
  const [selectedHarnessSession, setSelectedHarnessSession] = useState<string | null>(null);
  const [harnessWorkflow, setHarnessWorkflow] = useState<WorkflowProjection | null>(null);
  const [showRegistry, setShowRegistry] = useState(false);
  const [showTeamCreator, setShowTeamCreator] = useState(false);
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [workflowGoal, setWorkflowGoal] = useState('');
  const [workflowTemplate, setWorkflowTemplate] = useState<MultiAgentWorkflowTemplateId>('default');
  const [showWorkflowPanel, setShowWorkflowPanel] = useState(false);
  const [startingWorkflow, setStartingWorkflow] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterTeam, setFilterTeam] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [executionFilter, setExecutionFilter] = useState<string>('all');
  const [activityPage, setActivityPage] = useState(1);
  const [teamsPage, setTeamsPage] = useState(1);
  const [execPage, setExecPage] = useState(1);
  const ACTIVITY_PAGE_SIZE = 8;
  const TEAMS_PAGE_SIZE = 4;
  const EXEC_PAGE_SIZE = 6;
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('vestara-agent-collapsed-categories') || '{}');
    } catch {
      return {};
    }
  });

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => {
      const next = { ...prev, [cat]: !prev[cat] };
      localStorage.setItem('vestara-agent-collapsed-categories', JSON.stringify(next));
      return next;
    });
  };
  const [teamMemberSearch, setTeamMemberSearch] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [runtimeHealth, setRuntimeHealth] = useState<{ status: string; upstream?: { healthy?: boolean } } | null>(null);
  const [runtimeProviders, setRuntimeProviders] = useState<Array<{ id: string; modelCount: number }>>([]);
  const { events } = useEventStream();
  const { addToast } = useToasts();

  const loadRuntime = useCallback(async () => {
    try {
      const [health, providers] = await Promise.all([
        apiFetch<{ status: string; upstream?: { healthy?: boolean } }>('/api/opencode/health').catch(() => null),
        apiFetch<{ providers: Array<{ id: string; modelCount: number }> }>('/api/opencode/providers').catch(() => null),
      ]);
      if (health) setRuntimeHealth(health);
      if (providers?.providers) setRuntimeProviders(providers.providers);
    } catch {}
  }, []);

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
    load();
    loadRuntime();
  }, [load, loadRuntime]);

  // Load the canonical workflow projection for the selected harness session.
  useEffect(() => {
    const session = harnessSessions.find((entry) => entry.id === selectedHarnessSession);
    const threadId = session ? threadIdFromSession(session.workflowId) : null;
    if (!threadId) {
      setHarnessWorkflow(null);
      return;
    }
    let cancelled = false;
    void workflowApi.workflow(threadId).then((data) => {
      if (!cancelled && data?.projection) setHarnessWorkflow(data.projection);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedHarnessSession, harnessSessions]);
  useEffect(() => {
    const off = workspaceSocket.onEvent((evt) => {
      if (evt.type.startsWith('agent.') || evt.type === 'agent.started' || evt.type === 'agent.completed') load();
    });
    return off;
  }, [load]);

  const agentEvents = events.filter((e) => e.actor.type === 'agent');

  const allAgentSlots = useMemo(() => {
    return ALL_AGENT_SLOTS.map((slot) => {
      const registered = agents.find((a) => a.role === slot.role);
      return (
        registered || {
          id: `slot-${slot.role}`,
          name: slot.defaultName,
          role: slot.role,
          description: 'Not registered — add via Agent Registry',
          capabilities: [],
          permissions: [],
          status: 'unregistered',
          color: slot.color,
          createdAt: '',
        }
      );
    });
  }, [agents]);

  const filteredAgents = useMemo(
    () =>
      allAgentSlots.filter((a: any) => {
        if (filterStatus === 'active' && a.status !== 'active') return false;
        if (filterStatus === 'disabled' && a.status !== 'disabled') return false;
        if (filterTeam !== 'all' && a.teamId !== filterTeam) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          if (
            !a.name.toLowerCase().includes(q) &&
            !a.role.toLowerCase().includes(q) &&
            !(a.description || '').toLowerCase().includes(q) &&
            !(a.capabilities || []).some((c: string) => c.toLowerCase().includes(q))
          )
            return false;
        }
        return true;
      }),
    [allAgentSlots, filterStatus, filterTeam, searchQuery],
  );

  const agentExecutions = useMemo(() => {
    if (!selectedAgent) return [];
    return executions.filter(
      (e) =>
        e.agentId === selectedAgent.id ||
        selectedAgent.name.toLowerCase().includes(e.agentId.split('-').pop()?.toLowerCase() || '') ||
        e.agentId.includes(selectedAgent.role),
    );
  }, [selectedAgent, executions]);

  const filteredAgentExecs = useMemo(() => {
    if (executionFilter === 'all') return agentExecutions;
    return agentExecutions.filter((e) => e.status === executionFilter);
  }, [agentExecutions, executionFilter]);

  const agentStats = useMemo(() => {
    const stats: Record<
      string,
      { total: number; completed: number; failed: number; running: number; avgDuration: number }
    > = {};
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

  const runAgent = async (agentId: string) => {
    if (!runTask.trim()) return;
    setRunning(true);
    setRunOutput(null);
    try {
      // Harness execution path: a durable thread + ExecutionSession are created
      // immediately; progress flows through the harness event stream.
      const created = await harnessApi.createRun(agentId, { instruction: runTask });
      if (!created?.threadId) throw new Error('Harness run not created');
      const terminal = await pollHarnessThread(created.threadId, 120_000);
      const detail = await harnessApi.thread(created.threadId);
      const sessionId =
        detail?.session && typeof (detail.session as { id?: unknown }).id === 'string'
          ? (detail.session as { id: string }).id
          : undefined;
      setRunOutput(
        `Harness run ${terminal.state}${sessionId ? ` · session ${sessionId}` : ''} · thread ${created.threadId.slice(0, 12)}…`,
      );
      load();
      addToast({ type: 'success', message: `Harness run ${terminal.state}` });
    } catch (err: any) {
      setRunOutput(`Error: ${err.message}`);
      addToast({ type: 'error', message: `Failed to run task: ${err.message}` });
    }
    setRunning(false);
  };

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

  const startWorkflow = async () => {
    if (!workflowGoal.trim()) return;
    setStartingWorkflow(true);
    try {
      const result = await workflowApi.start(workflowGoal.trim(), undefined, workflowTemplate);
      if (!result) {
        addToast({ type: 'error', message: 'Failed to start multi-agent workflow' });
        return;
      }
      addToast({ type: 'success', message: `Workflow started: ${result.workflowId}` });
      setShowWorkflowPanel(false);
      setWorkflowGoal('');
      load();
    } catch (err: any) {
      addToast({ type: 'error', message: `Failed to start workflow: ${err.message}` });
    } finally {
      setStartingWorkflow(false);
    }
  };

  const execSummary = useMemo(() => {
    const total = executions.filter((e) => e.status !== 'running' && e.status !== 'queued').length || 1;
    const completed = executions.filter((e) => e.status === 'completed').length;
    const failed = executions.filter((e) => e.status === 'failed').length;
    const running = executions.filter((e) => e.status === 'running' || e.status === 'queued').length;
    return { total, completed, failed, running, successRate: Math.round((completed / total) * 100) };
  }, [executions]);

  const groupedAgents = useMemo(() => {
    const groups: Record<string, typeof filteredAgents> = {};
    for (const cat of CATEGORY_ORDER) groups[cat] = [];
    for (const agent of filteredAgents) {
      const cat = ROLE_CATEGORIES[agent.role] || 'Specialized';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(agent);
    }
    return groups;
  }, [filteredAgents]);

  const anyActive = (agents: typeof filteredAgents) => agents.some((a: any) => a.status === 'active');

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-(--vestara-text)">Agent Control Center</h1>
          <p className="text-[10px] text-(--vestara-text-muted) mt-1">
            {agents.filter((a) => a.status === 'active').length} active · {agents.length}/{ALL_AGENT_SLOTS.length}{' '}
            registered · {teams.length} teams · {executions.length} executions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setEditAgent(null);
              setShowRegistry(true);
            }}
            className="text-xs px-3 py-1.5 bg-amber-400/10 border border-amber-400/30 text-amber-400 rounded-lg hover:bg-amber-400/20 transition-colors cursor-pointer font-medium"
          >
            + Add Agent
          </button>
          <button
            onClick={() => setShowTeamCreator(true)}
            className="text-xs px-3 py-1.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-lg hover:bg-(--vestara-accent-bg) transition-colors cursor-pointer"
          >
            + Team
          </button>
          <button
            onClick={() => setShowWorkflowPanel((current) => !current)}
            className="text-xs px-3 py-1.5 bg-purple-400/10 border border-purple-400/30 text-purple-400 rounded-lg hover:bg-purple-400/20 transition-colors cursor-pointer font-medium"
            title="Run a multi-agent workflow (planner → developer → verifier → reviewer)"
          >
            ⚡ Run Workflow
          </button>
          <button
            onClick={load}
            className="text-xs px-3 py-1.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-lg hover:bg-(--vestara-accent-bg) transition-colors cursor-pointer"
            title="Refresh"
          >
            ↻
          </button>
        </div>
      </div>

      {showWorkflowPanel && (
        <div className="p-3 mb-4 bg-(--vestara-accent-bg) border border-purple-400/30 rounded-lg">
          <div className="text-[9px] text-(--vestara-text-muted) uppercase tracking-wider mb-1.5">
            Multi-Agent Workflow — planner → developer → verifier → reviewer
          </div>
          <div className="flex items-center gap-2">
            <select
              value={workflowTemplate}
              onChange={(e) => setWorkflowTemplate(e.target.value as MultiAgentWorkflowTemplateId)}
              className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-lg px-2 py-1.5 text-[10px] outline-none focus:border-(--vestara-accent-border-active) cursor-pointer shrink-0"
              title="Workflow template (preset stage plan)"
            >
              <option value="default">Standard pipeline</option>
              <option value="agent-control-restructure">Restructure Agent Control</option>
            </select>
            <input
              value={workflowGoal}
              onChange={(e) => setWorkflowGoal(e.target.value)}
              placeholder="Describe the goal for the workflow..."
              onKeyDown={(e) => e.key === 'Enter' && !startingWorkflow && startWorkflow()}
              className="flex-1 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg px-2.5 py-1.5 text-xs text-(--vestara-text) placeholder-zinc-600 outline-none focus:border-(--vestara-accent-border-active)"
            />
            <button
              onClick={() => void startWorkflow()}
              disabled={startingWorkflow || !workflowGoal.trim()}
              className="text-[10px] px-3 py-1.5 bg-purple-400/10 border border-purple-400/30 text-purple-400 rounded-lg hover:bg-purple-400/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer font-medium shrink-0"
            >
              {startingWorkflow ? 'Starting...' : 'Start'}
            </button>
          </div>
        </div>
      )}

      {/* OpenCode runtime — agents execute through the runtime; providers are
          discovered from /api/opencode, never hardcoded. */}
      <div className="flex flex-wrap items-center gap-3 p-3 mb-4 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
            runtimeHealth?.status === 'healthy'
              ? 'bg-green-400/10 text-green-400'
              : runtimeHealth
                ? 'bg-amber-400/10 text-amber-400'
                : 'bg-zinc-800 text-(--vestara-text-muted)'
          }`}
        >
          Runtime {runtimeHealth?.status ?? 'unknown'}
        </span>
        <span className="text-[11px] text-(--vestara-text-muted)">
          OpenCode runtime ·{' '}
          {runtimeProviders.length > 0
            ? `providers: ${runtimeProviders.map((p) => `${p.id} (${p.modelCount})`).join(', ')}`
            : 'no providers discovered — the server\u2019s configured default will be used'}
        </span>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
          <div className="text-[9px] text-(--vestara-text-muted) uppercase tracking-wider">Registered</div>
          <div className="text-lg font-bold text-(--vestara-text) mt-1">
            {agents.length}/{ALL_AGENT_SLOTS.length}
          </div>
        </div>
        <div className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
          <div className="text-[9px] text-(--vestara-text-muted) uppercase tracking-wider">Active</div>
          <div className="text-lg font-bold text-green-400 mt-1">
            {agents.filter((a) => a.status === 'active').length}
          </div>
        </div>
        <div className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
          <div className="text-[9px] text-(--vestara-text-muted) uppercase tracking-wider">Executions</div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-lg font-bold text-blue-400">{executions.length}</span>
            {execSummary.running > 0 && (
              <span className="text-[10px] text-amber-400">{execSummary.running} active</span>
            )}
          </div>
        </div>
        <div className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
          <div className="text-[9px] text-(--vestara-text-muted) uppercase tracking-wider">Success Rate</div>
          <div
            className={`text-lg font-bold mt-1 ${execSummary.successRate >= 80 ? 'text-green-400' : execSummary.successRate >= 50 ? 'text-amber-400' : 'text-red-400'}`}
          >
            {execSummary.successRate}%
          </div>
        </div>
      </div>

      {/* Execution chart */}
      <div className="mb-5 max-w-xs">
        <ExecutionChart
          total={execSummary.total}
          completed={execSummary.completed}
          failed={execSummary.failed}
          running={execSummary.running}
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 text-xs flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-(--vestara-text-dim) text-[11px]">🔍</span>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, role, capability..."
            className="w-full bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg pl-7 pr-2 py-1.5 text-xs text-(--vestara-text) placeholder-(--vestara-text-dim) outline-none focus:border-(--vestara-accent-border-active)"
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-(--vestara-text-muted) uppercase">Status</span>
          {['all', 'active', 'disabled'].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`text-[10px] px-2 py-1 rounded-md cursor-pointer transition-colors ${filterStatus === s ? 'bg-(--vestara-accent-bg) border border-(--vestara-accent-border-active) text-(--vestara-text) font-medium' : 'text-(--vestara-text-2) hover:text-(--vestara-text) hover:bg-(--vestara-accent-bg)'}`}
            >
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <select
          value={filterTeam}
          onChange={(e) => setFilterTeam(e.target.value)}
          className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-lg px-2 py-1 text-[10px] outline-none focus:border-(--vestara-accent-border-active) cursor-pointer"
        >
          <option value="all">All Teams</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <span className="text-[10px] text-(--vestara-text-dim)">
          {filteredAgents.length} of {ALL_AGENT_SLOTS.length}
        </span>
      </div>

      {/* Agent list by category */}
      {filteredAgents.length === 0 && (
        <div className="flex flex-col items-center justify-center py-14 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg text-center">
          <div className="text-2xl mb-2 opacity-30">☰</div>
          <p className="text-sm text-(--vestara-text-2) b-1">No agents found</p>
          <p className="text-xs text-(--vestara-text-dim)">Adjust your filters or register a new agent</p>
        </div>
      )}
      {CATEGORY_ORDER.map((cat) => {
        const catAgents = groupedAgents[cat];
        if (!catAgents || catAgents.length === 0) return null;
        const isCollapsed = collapsedCategories[cat] === true;
        const catColor = CATEGORY_COLORS[cat] || '#6b7280';
        const activeCount = catAgents.filter((a: any) => a.status === 'active').length;
        return (
          <div key={cat} className="mb-4">
            {/* Category header */}
            <button
              type="button"
              onClick={() => toggleCategory(cat)}
              className="flex items-center gap-2 w-full px-1 py-1.5 mb-1 cursor-pointer group"
            >
              <div
                className="w-2 h-2 rounded-full shrink-0 transition-transform"
                style={{ backgroundColor: catColor }}
              />
              <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-(--vestara-text-2)">
                {cat}
              </span>
              <span className="text-[9px] text-(--vestara-text-dim)">
                {catAgents.length} · {activeCount} active
              </span>
              <span className="ml-auto text-(--vestara-text-dim) text-[11px] transition-transform group-hover:text-(--vestara-text-2)">
                {isCollapsed ? '▸' : '▾'}
              </span>
            </button>
            {!isCollapsed && (
              <div className="space-y-2">
                {catAgents.map((agent: any) => {
                  const isRegistered = agent.status !== 'unregistered';
                  const color = getColor(agent);
                  const team = teams.find((t) => t.id === agent.teamId);
                  const stats = agentStats[agent.id] || {
                    total: 0,
                    completed: 0,
                    failed: 0,
                    running: 0,
                    avgDuration: 0,
                  };
                  const isExpanded = selectedAgent?.id === agent.id;
                  return (
                    <div
                      key={agent.id}
                      className={`rounded-lg border transition-all ${isExpanded ? 'bg-(--vestara-accent-bg) border-(--vestara-accent-border-active)' : isRegistered ? 'bg-(--vestara-accent-bg) border-(--vestara-accent-border) hover:border-(--vestara-accent-border-active)' : 'bg-(--vestara-accent-bg) border-(--vestara-accent-border)/50 opacity-60'}`}
                      style={{
                        borderLeftColor: isRegistered ? color : undefined,
                        borderLeftWidth: isRegistered ? '3px' : undefined,
                      }}
                    >
                      {/* Header row */}
                      <div
                        className="p-3 flex items-center gap-3 cursor-pointer"
                        onClick={() => isRegistered && setSelectedAgent(isExpanded ? null : agent)}
                      >
                        <div className="relative shrink-0">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{
                              backgroundColor: isRegistered
                                ? agent.status === 'active'
                                  ? color
                                  : '#52525b'
                                : '#27272a',
                            }}
                          />
                          {stats.running > 0 && (
                            <div
                              className="absolute inset-0 w-3 h-3 rounded-full animate-ping opacity-40"
                              style={{ backgroundColor: color }}
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-sm font-semibold truncate ${isRegistered ? 'text-(--vestara-text)' : 'text-(--vestara-text-muted)'}`}
                            >
                              {agent.name}
                            </span>
                            <span className="text-[8px] px-1 py-0.5 rounded bg-zinc-800 text-(--vestara-text-2) uppercase font-medium shrink-0">
                              {agent.role}
                            </span>
                            <AgentStatusBadge status={agent.status} />
                          </div>
                          {agent.description && (
                            <div
                              className={`text-[10px] truncate mt-0.5 ${isRegistered ? 'text-(--vestara-text-muted)' : 'text-(--vestara-text-dim)'}`}
                            >
                              {agent.description}
                            </div>
                          )}
                          <div className="flex items-center gap-2 mt-0.5">
                            {agent.provider && (
                              <span className="text-[9px] text-(--vestara-text-dim)">{agent.provider}</span>
                            )}
                            {agent.model && (
                              <span className="text-[9px] text-(--vestara-text-dim) font-mono">{agent.model}</span>
                            )}
                            {stats.total > 0 && (
                              <span className="text-[9px] text-(--vestara-text-dim)">
                                {stats.completed}/{stats.total} tasks
                              </span>
                            )}
                            {stats.running > 0 && (
                              <span className="text-[9px] text-amber-400 animate-pulse font-semibold">
                                {stats.running} running
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
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
                            }}
                            className="text-[9px] px-2 py-1 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-md hover:bg-(--vestara-accent-bg) transition-colors cursor-pointer"
                          >
                            {isRegistered ? 'Edit' : 'Register'}
                          </button>
                          {isRegistered && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleAgentStatus(agent);
                                }}
                                className="text-[9px] px-2 py-1 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-md hover:bg-(--vestara-accent-bg) transition-colors cursor-pointer"
                              >
                                {agent.status === 'active' ? 'Disable' : 'Enable'}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteAgent(agent.id);
                                }}
                                className="text-[9px] px-2 py-1 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-red-400 rounded-md hover:bg-red-400/10 transition-colors cursor-pointer"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Stats bar */}
                      {stats.total > 0 && (
                        <div className="px-3 pb-2">
                          <div className="flex-1 bg-(--vestara-accent-bg) rounded-full h-1.5 flex overflow-hidden">
                            {stats.completed > 0 && (
                              <div
                                className="h-1.5 bg-green-500 transition-all"
                                style={{ width: `${(stats.completed / stats.total) * 100}%` }}
                              />
                            )}
                            {stats.failed > 0 && (
                              <div
                                className="h-1.5 bg-red-500 transition-all"
                                style={{ width: `${(stats.failed / stats.total) * 100}%` }}
                              />
                            )}
                            {stats.running > 0 && (
                              <div
                                className="h-1.5 bg-amber-400 animate-pulse transition-all"
                                style={{ width: `${(stats.running / stats.total) * 100}%` }}
                              />
                            )}
                          </div>
                        </div>
                      )}

                      {/* Expanded execution history */}
                      {isExpanded && (
                        <div className="px-3 pb-3 pt-2 border-t border-(--vestara-accent-border)">
                          <div className="flex gap-4 mb-3">
                            <div className="flex-1">
                              <div className="text-[9px] font-semibold text-(--vestara-text-muted) uppercase tracking-wider mb-1.5">
                                Capabilities
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {(agent.capabilities || []).map((c: string) => (
                                  <span
                                    key={c}
                                    className="text-[9px] px-1.5 py-0.5 bg-zinc-800 text-(--vestara-text-2) rounded-md border border-(--vestara-accent-border)/50"
                                  >
                                    {c}
                                  </span>
                                ))}
                                {(!agent.capabilities || agent.capabilities.length === 0) && (
                                  <span className="text-[9px] text-(--vestara-text-dim) italic">
                                    No capabilities defined
                                  </span>
                                )}
                              </div>
                            </div>
                            {team && (
                              <div className="shrink-0">
                                <div className="text-[9px] font-semibold text-(--vestara-text-muted) uppercase tracking-wider mb-1.5">
                                  Team
                                </div>
                                <span
                                  className="text-[9px] px-1.5 py-0.5 rounded-md"
                                  style={{ backgroundColor: getColor(agent) + '20', color: getColor(agent) }}
                                >
                                  {team.name}
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center justify-between mb-1.5">
                            <div className="text-[9px] font-semibold text-(--vestara-text-muted) uppercase tracking-wider">
                              Tasks ({agentExecutions.length})
                            </div>
                            <select
                              value={executionFilter}
                              onChange={(e) => setExecutionFilter(e.target.value)}
                              className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-md text-[9px] px-1.5 py-0.5 outline-none cursor-pointer"
                            >
                              <option value="all">All</option>
                              <option value="completed">Done</option>
                              <option value="failed">Failed</option>
                              <option value="running">Active</option>
                            </select>
                          </div>

                          <div className="space-y-0.5 max-h-40 overflow-y-auto">
                            {filteredAgentExecs.length === 0 && (
                              <p className="text-[10px] text-(--vestara-text-dim) py-2 text-center italic">
                                No executions
                              </p>
                            )}
                            {filteredAgentExecs
                              .slice((execPage - 1) * EXEC_PAGE_SIZE, execPage * EXEC_PAGE_SIZE)
                              .map((ex) => {
                                const duration = ex.completedAt
                                  ? Math.round(
                                      (new Date(ex.completedAt).getTime() - new Date(ex.startedAt).getTime()) / 1000,
                                    )
                                  : null;
                                return (
                                  <div
                                    key={ex.id}
                                    onClick={() => setSelectedExecution(ex)}
                                    className="flex items-center gap-2 py-1 px-1.5 rounded-md hover:bg-(--vestara-accent-bg) transition-colors text-[10px] cursor-pointer"
                                  >
                                    <span
                                      className={`shrink-0 ${ex.status === 'completed' ? 'text-green-500' : ex.status === 'failed' ? 'text-red-500' : 'text-amber-400'}`}
                                    >
                                      {ex.status === 'completed' ? '✔' : ex.status === 'failed' ? '✗' : '◉'}
                                    </span>
                                    <span className="text-(--vestara-text) truncate flex-1">{ex.task}</span>
                                    <span className="text-(--vestara-text-muted) shrink-0">
                                      {new Date(ex.startedAt).toLocaleTimeString()}{' '}
                                      {duration !== null && `· ${duration}s`}
                                    </span>
                                    <span
                                      className={`text-[8px] px-1 py-0.5 rounded uppercase font-medium ${ex.status === 'completed' ? 'bg-green-400/10 text-green-400' : ex.status === 'failed' ? 'bg-red-400/10 text-red-400' : 'bg-amber-400/10 text-amber-400'}`}
                                    >
                                      {ex.status}
                                    </span>
                                  </div>
                                );
                              })}
                          </div>

                          {filteredAgentExecs.length > EXEC_PAGE_SIZE && (
                            <div className="border-t border-(--vestara-accent-border) pt-1.5 mt-1.5">
                              <Pagination
                                current={execPage}
                                total={filteredAgentExecs.length}
                                pageSize={EXEC_PAGE_SIZE}
                                onChange={setExecPage}
                              />
                            </div>
                          )}

                          <div className="mt-2 flex gap-2">
                            <input
                              value={runTask}
                              onChange={(e) => setRunTask(e.target.value)}
                              placeholder="Assign a task to this agent..."
                              className="flex-1 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg px-2.5 py-1.5 text-xs text-(--vestara-text) placeholder-zinc-600 outline-none focus:border-(--vestara-accent-border-active)"
                              onKeyDown={(e) => e.key === 'Enter' && runAgent(agent.id)}
                            />
                            <button
                              onClick={() => runAgent(agent.id)}
                              disabled={running || !runTask.trim()}
                              className="text-[10px] px-3 py-1.5 bg-amber-400/10 border border-amber-400/30 text-amber-400 rounded-lg hover:bg-amber-400/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer font-medium"
                            >
                              {running ? 'Running...' : 'Run'}
                            </button>
                          </div>
                          {runOutput && (
                            <div className="mt-1.5 text-[10px] text-(--vestara-text-2) bg-zinc-800/50 border border-(--vestara-accent-border)/50 rounded-lg p-2">
                              {runOutput}
                            </div>
                          )}

                          {harnessSessions.length > 0 && (
                            <div className="mt-3 border-t border-(--vestara-accent-border) pt-2">
                              <div className="text-[9px] text-(--vestara-text-muted) uppercase tracking-wider mb-1">
                                Harness Sessions ({harnessSessions.length})
                              </div>
                              <div className="space-y-1">
                                {harnessSessions.slice(0, 5).map((s) => {
                                  const threadId = threadIdFromSession(s.workflowId);
                                  return (
                                    <div key={s.id}>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setSelectedHarnessSession(selectedHarnessSession === s.id ? null : s.id)
                                        }
                                        className="w-full text-left flex items-center gap-2 text-[11px] text-(--vestara-text-2) hover:text-(--vestara-text) cursor-pointer py-0.5"
                                      >
                                        <span
                                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.status === 'running' ? 'bg-(--vestara-green) animate-pulse' : 'bg-zinc-600'}`}
                                        />
                                        <span className="truncate flex-1">{s.goal || s.id}</span>
                                        <span className="text-[9px] text-(--vestara-text-muted)">{s.status}</span>
                                      </button>
                                      {selectedHarnessSession === s.id && threadId && (
                                        <>
                                          <WorkflowRail workflow={harnessWorkflow} onRefresh={() => load()} />
                                          <div className="mt-2">
                                            <HarnessThreadTimeline threadId={threadId} />
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Sidebar panels */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
        {/* Live Activity */}
        <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-3">
          <h3 className="text-[10px] font-semibold text-(--vestara-text-2) uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <span className="w-1 h-3 rounded-full bg-blue-500/60" /> Live Activity
            <span className="text-(--vestara-text-dim) font-normal">({agentEvents.length})</span>
          </h3>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {agentEvents.slice(0, 80).length === 0 ? (
              <p className="text-[10px] text-(--vestara-text-dim) py-3 text-center italic">No agent activity yet</p>
            ) : (
              agentEvents
                .slice((activityPage - 1) * ACTIVITY_PAGE_SIZE, activityPage * ACTIVITY_PAGE_SIZE)
                .map((e, i) => (
                  <div
                    key={e.id || i}
                    className="flex items-start gap-2 py-1 px-1 rounded hover:bg-(--vestara-accent-bg) transition-colors"
                  >
                    <span className="text-blue-400 shrink-0 mt-0.5 text-[11px]">●</span>
                    <div className="min-w-0">
                      <div className="text-[10px] text-(--vestara-text-2) truncate">{e.message}</div>
                      <div className="text-[8px] text-(--vestara-text-dim) truncate">
                        {e.actor.name} · {new Date(e.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))
            )}
          </div>
          {agentEvents.length > ACTIVITY_PAGE_SIZE && (
            <div className="border-t border-(--vestara-accent-border) pt-2 mt-2">
              <Pagination
                current={activityPage}
                total={agentEvents.length}
                pageSize={ACTIVITY_PAGE_SIZE}
                onChange={setActivityPage}
              />
            </div>
          )}
        </div>

        {/* Teams */}
        <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[10px] font-semibold text-(--vestara-text-2) uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-1 h-3 rounded-full bg-purple-500/60" /> Teams
              <span className="text-(--vestara-text-dim) font-normal">({teams.length})</span>
            </h3>
            <button
              onClick={() => setShowTeamCreator(true)}
              className="text-[9px] text-(--vestara-text-muted) hover:text-(--vestara-text-2) transition-colors cursor-pointer"
            >
              + New
            </button>
          </div>
          {teams.length === 0 ? (
            <p className="text-[10px] text-(--vestara-text-dim) py-3 text-center italic">No teams yet</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {teams.map((team) => {
                const isExpandedT = expandedTeam === team.id;
                const leader = agents.find((a) => a.id === team.leaderAgentId);
                const members = agents.filter((a) => team.memberIds.includes(a.id) || a.teamId === team.id);
                const search = teamMemberSearch[team.id] || '';
                const unassigned = agents.filter(
                  (a) =>
                    a.status === 'active' &&
                    !team.memberIds.includes(a.id) &&
                    a.teamId !== team.id &&
                    a.id !== team.leaderAgentId,
                );
                const addMember = async (agentId: string) => {
                  await fetch(`/api/teams/${team.id}/members`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ add: [agentId] }),
                  });
                  load();
                };
                const removeMember = async (agentId: string) => {
                  await fetch(`/api/teams/${team.id}/members`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ remove: [agentId] }),
                  });
                  load();
                };
                const setLeader = async (agentId: string) => {
                  await fetch(`/api/teams/${team.id}/members`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ leaderAgentId: agentId }),
                  });
                  load();
                };
                const deleteTeamFn = async () => {
                  if (!window.confirm(`Delete team "${team.name}"?`)) return;
                  await fetch(`/api/teams/${team.id}`, { method: 'DELETE' });
                  load();
                };
                return (
                  <div key={team.id} className="border border-(--vestara-accent-border) rounded-lg overflow-hidden">
                    <div
                      className="p-2.5 bg-(--vestara-accent-bg) flex items-center justify-between cursor-pointer hover:bg-(--vestara-accent-bg) transition-colors"
                      onClick={() => setExpandedTeam(isExpandedT ? null : team.id)}
                    >
                      <div className="min-w-0">
                        <div className="text-[11px] text-(--vestara-text) font-medium truncate">{team.name}</div>
                        <div className="text-[8px] text-(--vestara-text-muted) flex items-center gap-1">
                          {members.length} members{leader ? ` · leader: ${leader.name}` : ''}
                        </div>
                      </div>
                      <span
                        className={`text-(--vestara-text-muted) text-[10px] shrink-0 transition-transform ${isExpandedT ? 'rotate-180' : ''}`}
                      >
                        ▼
                      </span>
                    </div>
                    {isExpandedT && (
                      <div className="p-2.5 space-y-2 border-t border-(--vestara-accent-border)">
                        <div className="space-y-1">
                          {members.map((m) => (
                            <div
                              key={m.id}
                              className="flex items-center gap-2 text-[10px] group py-0.5 px-1 rounded hover:bg-(--vestara-accent-bg) transition-colors"
                            >
                              <span
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: getColor(m) }}
                              />
                              <span className="text-(--vestara-text) flex-1 truncate">{m.name}</span>
                              <span className="text-[8px] text-(--vestara-text-dim)">{m.role}</span>
                              <button
                                onClick={() => setLeader(m.id)}
                                className="text-[8px] text-(--vestara-text-muted) hover:text-(--vestara-text-2) opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                title="Set as leader"
                              >
                                👑
                              </button>
                              <button
                                onClick={() => removeMember(m.id)}
                                className="text-[8px] text-(--vestara-text-muted) hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                        {unassigned.length > 0 && (
                          <div>
                            <input
                              value={search}
                              onChange={(e) => setTeamMemberSearch((prev) => ({ ...prev, [team.id]: e.target.value }))}
                              placeholder="Add agent..."
                              className="w-full bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-md text-[9px] px-2 py-1 text-(--vestara-text) placeholder-(--vestara-text-dim) outline-none focus:border-(--vestara-accent-border-active)"
                            />
                            <div className="mt-1 space-y-0.5 max-h-24 overflow-y-auto">
                              {unassigned
                                .filter((a) => !search || a.name.toLowerCase().includes(search.toLowerCase()))
                                .slice(0, 5)
                                .map((a) => (
                                  <button
                                    key={a.id}
                                    onClick={() => addMember(a.id)}
                                    className="w-full flex items-center gap-2 text-[9px] text-(--vestara-text-2) hover:text-(--vestara-text) hover:bg-(--vestara-accent-bg) rounded-md px-1.5 py-1 transition-colors cursor-pointer"
                                  >
                                    <span
                                      className="w-1.5 h-1.5 rounded-full shrink-0"
                                      style={{ backgroundColor: getColor(a) }}
                                    />
                                    <span className="truncate">{a.name}</span>
                                    <span className="text-(--vestara-text-dim) ml-auto text-[11px]">+</span>
                                  </button>
                                ))}
                            </div>
                          </div>
                        )}
                        <div className="flex gap-1 pt-1 border-t border-(--vestara-accent-border)">
                          <button
                            onClick={deleteTeamFn}
                            className="text-[8px] px-2 py-0.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-red-400 rounded-md hover:bg-red-400/10 transition-colors cursor-pointer"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Execution Summary */}
        <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-3">
          <h3 className="text-[10px] font-semibold text-(--vestara-text-2) uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <span className="w-1 h-3 rounded-full bg-green-500/60" /> Execution Summary
          </h3>
          <div className="space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-(--vestara-text-muted)">Completed</span>
              <span className="text-green-400 font-medium">{execSummary.completed}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-(--vestara-text-muted)">Failed</span>
              <span className="text-red-400 font-medium">{execSummary.failed}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-(--vestara-text-muted)">Running</span>
              <span className="text-amber-400 font-medium">{execSummary.running}</span>
            </div>
            {executions.length > 0 && (
              <div className="pt-1">
                <div className="w-full bg-(--vestara-accent-bg) rounded-full h-2 flex overflow-hidden">
                  <div
                    className="h-2 bg-green-500 transition-all"
                    style={{ width: `${(execSummary.completed / execSummary.total) * 100}%` }}
                  />
                  <div
                    className="h-2 bg-red-500 transition-all"
                    style={{ width: `${(execSummary.failed / execSummary.total) * 100}%` }}
                  />
                  <div
                    className="h-2 bg-amber-400 transition-all"
                    style={{ width: `${(execSummary.running / executions.length) * 100}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[9px] text-(--vestara-text-dim) mt-1">
                  <span>{execSummary.total} finished</span>
                  <span>{execSummary.successRate}% success</span>
                </div>
              </div>
            )}
          </div>
        </div>
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
