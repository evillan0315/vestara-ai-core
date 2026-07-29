import { useCallback, useEffect, useMemo, useState } from 'react';
import ExecutionDetailModal from '../components/ExecutionDetailModal';
import { useToasts } from '../components/Toast';
import { useEventStream } from '../lib/useEventStream';
import { workspaceSocket } from '../lib/ws';

const API = '';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

interface Agent {
  id: string;
  name: string;
  role: string;
  description?: string;
  capabilities: string[];
  permissions: any[];
  provider?: string;
  model?: string;
  teamId?: string;
  color?: string;
  status: string;
  createdAt: string;
}
interface Team {
  id: string;
  name: string;
  description: string;
  leaderAgentId?: string;
  memberIds: string[];
  sharedContext?: string;
  createdAt: string;
}
interface Execution {
  id: string;
  agentId: string;
  task: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  result?: string;
}

const ROLE_COLORS: Record<string, string> = {
  architect: '#8b5cf6',
  developer: '#3b82f6',
  verifier: '#10b981',
  documenter: '#f59e0b',
  analyst: '#a855f7',
  reviewer: '#14b8a6',
  tester: '#84cc16',
  'security-agent': '#ef4444',
  'performance-agent': '#f97316',
  'documentation-agent': '#22c55e',
  'refactoring-agent': '#0ea5e9',
  'release-agent': '#eab308',
  planner: '#d946ef',
  conversation: '#6366f1',
  'dashboard-curator': '#06b6d4',
  frontend: '#ec4899',
};

const ALL_AGENT_SLOTS = [
  {
    role: 'architect',
    defaultName: 'Architect',
    color: '#8b5cf6',
    defaultDescription: 'Architecture analysis, design review, dependency analysis',
    defaultCapabilities: ['architecture-analysis', 'design-review', 'dependency-analysis'],
  },
  {
    role: 'developer',
    defaultName: 'Developer',
    color: '#3b82f6',
    defaultDescription: 'Code generation, refactoring, bug fixing',
    defaultCapabilities: ['code-generation', 'refactoring', 'bug-fixing'],
  },
  {
    role: 'verifier',
    defaultName: 'Verifier',
    color: '#10b981',
    defaultDescription: 'Testing, diagnostics, quality analysis',
    defaultCapabilities: ['testing', 'diagnostics', 'quality-analysis'],
  },
  {
    role: 'reviewer',
    defaultName: 'Reviewer',
    color: '#14b8a6',
    defaultDescription: 'Code review, quality assurance, best practices',
    defaultCapabilities: ['code-review', 'quality-assurance', 'best-practices'],
  },
  {
    role: 'tester',
    defaultName: 'Tester',
    color: '#84cc16',
    defaultDescription: 'Test generation, test execution, coverage analysis',
    defaultCapabilities: ['test-generation', 'test-execution', 'coverage-analysis'],
  },
  {
    role: 'documenter',
    defaultName: 'Documenter',
    color: '#f59e0b',
    defaultDescription: 'Documentation, summarization, knowledge management',
    defaultCapabilities: ['documentation', 'summarization', 'knowledge-management'],
  },
  {
    role: 'analyst',
    defaultName: 'Repository Analyst',
    color: '#a855f7',
    defaultDescription: 'Code analysis, quality metrics, dependency scanning',
    defaultCapabilities: ['code-analysis', 'quality-metrics', 'dependency-scanning'],
  },
  {
    role: 'security-agent',
    defaultName: 'Security Agent',
    color: '#ef4444',
    defaultDescription: 'Vulnerability scanning, security audit, compliance checks',
    defaultCapabilities: ['vulnerability-scanning', 'security-audit', 'compliance-checks'],
  },
  {
    role: 'performance-agent',
    defaultName: 'Performance Agent',
    color: '#f97316',
    defaultDescription: 'Benchmarking, performance profiling, optimization suggestions',
    defaultCapabilities: ['benchmarking', 'performance-profiling', 'optimization'],
  },
  {
    role: 'documentation-agent',
    defaultName: 'Documentation Agent',
    color: '#22c55e',
    defaultDescription: 'API doc generation, changelog, release notes',
    defaultCapabilities: ['api-documentation', 'changelog-generation', 'release-notes'],
  },
  {
    role: 'refactoring-agent',
    defaultName: 'Refactoring Agent',
    color: '#0ea5e9',
    defaultDescription: 'Code quality improvement, technical debt reduction',
    defaultCapabilities: ['code-quality', 'technical-debt', 'pattern-migration'],
  },
  {
    role: 'release-agent',
    defaultName: 'Release Agent',
    color: '#eab308',
    defaultDescription: 'Version bumping, package preparation, release orchestration',
    defaultCapabilities: ['version-management', 'release-packaging', 'changelog'],
  },
  {
    role: 'conversation',
    defaultName: 'Conversation Developer',
    color: '#6366f1',
    defaultDescription: 'Conversation flows, voice pipelines, STT/TTS integration',
    defaultCapabilities: [
      'conversation-design',
      'voice-ux',
      'prompt-engineering',
      'stt-integration',
      'tts-integration',
    ],
  },
  {
    role: 'planner',
    defaultName: 'Planner',
    color: '#d946ef',
    defaultDescription: 'Task planning, dependency analysis, workflow orchestration',
    defaultCapabilities: ['planning', 'dependency-analysis', 'workflow-orchestration'],
  },
  {
    role: 'frontend',
    defaultName: 'Dashboard Developer',
    color: '#ec4899',
    defaultDescription: 'React/Tailwind UI development, real-time visualization',
    defaultCapabilities: ['react-development', 'ui-development', 'tailwind-css'],
  },
  {
    role: 'dashboard-curator',
    defaultName: 'Dashboard Curator',
    color: '#06b6d4',
    defaultDescription: 'Milestone tracking, workspace monitoring, progress reporting',
    defaultCapabilities: ['dashboard-monitoring', 'progress-tracking', 'milestone-management'],
  },
];

const getColor = (a: Agent) => a.color || ROLE_COLORS[a.role] || '#6b7280';

function statusBadge(status: string): { bg: string; text: string; dot: string } {
  if (status === 'active') return { bg: 'bg-green-400/10', text: 'text-green-400', dot: 'bg-green-500' };
  if (status === 'disabled') return { bg: 'bg-zinc-800', text: 'text-zinc-500', dot: 'bg-zinc-600' };
  if (status === 'unregistered') return { bg: 'bg-zinc-800/50', text: 'text-zinc-700', dot: 'bg-zinc-700' };
  return { bg: 'bg-zinc-800', text: 'text-zinc-500', dot: 'bg-zinc-600' };
}

function AgentStatusBadge({ status }: { status: string }) {
  const s = statusBadge(status);
  return <span className={`text-[8px] px-1.5 py-0.5 rounded uppercase font-medium ${s.bg} ${s.text}`}>{status}</span>;
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
  const [showRegistry, setShowRegistry] = useState(false);
  const [showTeamCreator, setShowTeamCreator] = useState(false);
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterTeam, setFilterTeam] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [executionFilter, setExecutionFilter] = useState<string>('all');
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [teamMemberSearch, setTeamMemberSearch] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const { events } = useEventStream();
  const { addToast } = useToasts();

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ agents: Agent[]; executions: Execution[] }>('/api/agents');
      setAgents(data.agents);
      setExecutions(data.executions);
      const teamData = await apiFetch<{ teams: Team[] }>('/api/teams').catch(() => ({ teams: [] }));
      setTeams(teamData.teams);
    } catch {}
  }, []);

  useEffect(() => {
    load();
  }, [load]);
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
      const result = await apiFetch<{ execution: Execution; message: string }>(`/api/agents/${agentId}/run`, {
        method: 'POST',
        body: JSON.stringify({ task: runTask }),
      });
      setRunOutput(result.message);
      load();
      addToast({ type: 'info', message: `Task started on agent` });
    } catch (err: any) {
      setRunOutput(`Error: ${err.message}`);
      addToast({ type: 'error', message: `Failed to run task: ${err.message}` });
    }
    setRunning(false);
  };

  const toggleAgentStatus = async (agent: Agent) => {
    try {
      await fetch(`${API}/api/agents/${agent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
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
      await fetch(`${API}/api/agents/${id}`, { method: 'DELETE' });
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
        await fetch(`${API}/api/agents/${editAgent.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(clean),
        });
        addToast({ type: 'success', message: `Agent "${clean.name || editAgent.name}" updated` });
      } else {
        await fetch(`${API}/api/agents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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

  const execSummary = useMemo(() => {
    const total = executions.filter((e) => e.status !== 'running' && e.status !== 'queued').length || 1;
    const completed = executions.filter((e) => e.status === 'completed').length;
    const failed = executions.filter((e) => e.status === 'failed').length;
    const running = executions.filter((e) => e.status === 'running' || e.status === 'queued').length;
    return { total, completed, failed, running, successRate: Math.round((completed / total) * 100) };
  }, [executions]);

  return (
    <div className="w-full px-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-zinc-100">Agent Control Center</h1>
          <p className="text-[10px] text-zinc-600 mt-1">
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
            className="text-xs px-3 py-1.5 bg-zinc-800 border border-zinc-700 text-zinc-500 rounded-lg hover:bg-zinc-700 transition-colors cursor-pointer"
          >
            + Team
          </button>
          <button
            onClick={load}
            className="text-xs px-3 py-1.5 bg-zinc-800 border border-zinc-700 text-zinc-500 rounded-lg hover:bg-zinc-700 transition-colors cursor-pointer"
            title="Refresh"
          >
            ↻
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg">
          <div className="text-[9px] text-zinc-600 uppercase tracking-wider">Registered</div>
          <div className="text-lg font-bold text-zinc-100 mt-1">
            {agents.length}/{ALL_AGENT_SLOTS.length}
          </div>
        </div>
        <div className="p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg">
          <div className="text-[9px] text-zinc-600 uppercase tracking-wider">Active</div>
          <div className="text-lg font-bold text-green-400 mt-1">
            {agents.filter((a) => a.status === 'active').length}
          </div>
        </div>
        <div className="p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg">
          <div className="text-[9px] text-zinc-600 uppercase tracking-wider">Executions</div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-lg font-bold text-blue-400">{executions.length}</span>
            {execSummary.running > 0 && (
              <span className="text-[10px] text-amber-400">{execSummary.running} active</span>
            )}
          </div>
        </div>
        <div className="p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg">
          <div className="text-[9px] text-zinc-600 uppercase tracking-wider">Success Rate</div>
          <div
            className={`text-lg font-bold mt-1 ${execSummary.successRate >= 80 ? 'text-green-400' : execSummary.successRate >= 50 ? 'text-amber-400' : 'text-red-400'}`}
          >
            {execSummary.successRate}%
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 text-xs flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-700 text-[11px]">🔍</span>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, role, capability..."
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-7 pr-2 py-1.5 text-xs text-zinc-300 placeholder-zinc-700 outline-none focus:border-zinc-500"
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-zinc-600 uppercase">Status</span>
          {['all', 'active', 'disabled'].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`text-[10px] px-2 py-1 rounded-md cursor-pointer transition-colors ${filterStatus === s ? 'bg-zinc-700 text-zinc-200 font-medium' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'}`}
            >
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <select
          value={filterTeam}
          onChange={(e) => setFilterTeam(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 text-zinc-400 rounded-lg px-2 py-1 text-[10px] outline-none focus:border-zinc-500 cursor-pointer"
        >
          <option value="all">All Teams</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <span className="text-[10px] text-zinc-700">
          {filteredAgents.length} of {ALL_AGENT_SLOTS.length}
        </span>
      </div>

      {/* Agent list */}
      <div className="space-y-2">
        {filteredAgents.length === 0 && (
          <div className="flex flex-col items-center justify-center py-14 bg-zinc-900/50 border border-zinc-800 rounded-lg text-center">
            <div className="text-2xl mb-2 opacity-30">☰</div>
            <p className="text-sm text-zinc-500 mb-1">No agents found</p>
            <p className="text-xs text-zinc-700">Adjust your filters or register a new agent</p>
          </div>
        )}
        {filteredAgents.map((agent: any) => {
          const isRegistered = agent.status !== 'unregistered';
          const color = getColor(agent);
          const team = teams.find((t) => t.id === agent.teamId);
          const stats = agentStats[agent.id] || { total: 0, completed: 0, failed: 0, running: 0, avgDuration: 0 };
          const isExpanded = selectedAgent?.id === agent.id;
          return (
            <div
              key={agent.id}
              className={`rounded-lg border transition-all ${isExpanded ? 'bg-zinc-800 border-zinc-600' : isRegistered ? 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-600' : 'bg-zinc-900/20 border-zinc-800/50 opacity-60'}`}
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
                      backgroundColor: isRegistered ? (agent.status === 'active' ? color : '#52525b') : '#27272a',
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
                      className={`text-sm font-semibold truncate ${isRegistered ? 'text-zinc-200' : 'text-zinc-600'}`}
                    >
                      {agent.name}
                    </span>
                    <span className="text-[8px] px-1 py-0.5 rounded bg-zinc-800 text-zinc-500 uppercase font-medium shrink-0">
                      {agent.role}
                    </span>
                    <AgentStatusBadge status={agent.status} />
                  </div>
                  {agent.description && (
                    <div className={`text-[10px] truncate mt-0.5 ${isRegistered ? 'text-zinc-600' : 'text-zinc-700'}`}>
                      {agent.description}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-0.5">
                    {agent.provider && <span className="text-[9px] text-zinc-700">{agent.provider}</span>}
                    {agent.model && <span className="text-[9px] text-zinc-700 font-mono">{agent.model}</span>}
                    {stats.total > 0 && (
                      <span className="text-[9px] text-zinc-700">
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
                              provider: 'opencode',
                              model: 'deepseek-v4-flash-free',
                            } as any),
                      );
                      setShowRegistry(true);
                    }}
                    className="text-[9px] px-2 py-1 bg-zinc-800 border border-zinc-700 text-zinc-400 rounded-md hover:bg-zinc-700 transition-colors cursor-pointer"
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
                        className="text-[9px] px-2 py-1 bg-zinc-800 border border-zinc-700 text-zinc-400 rounded-md hover:bg-zinc-700 transition-colors cursor-pointer"
                      >
                        {agent.status === 'active' ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteAgent(agent.id);
                        }}
                        className="text-[9px] px-2 py-1 bg-zinc-800 border border-zinc-700 text-red-400 rounded-md hover:bg-red-400/10 transition-colors cursor-pointer"
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
                  <div className="flex-1 bg-zinc-800 rounded-full h-1.5 flex overflow-hidden">
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
                <div className="px-3 pb-3 pt-2 border-t border-zinc-800">
                  <div className="flex gap-4 mb-3">
                    <div className="flex-1">
                      <div className="text-[9px] font-semibold text-zinc-600 uppercase tracking-wider mb-1.5">
                        Capabilities
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {(agent.capabilities || []).map((c: string) => (
                          <span
                            key={c}
                            className="text-[9px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded-md border border-zinc-700/50"
                          >
                            {c}
                          </span>
                        ))}
                        {(!agent.capabilities || agent.capabilities.length === 0) && (
                          <span className="text-[9px] text-zinc-700 italic">No capabilities defined</span>
                        )}
                      </div>
                    </div>
                    {team && (
                      <div className="shrink-0">
                        <div className="text-[9px] font-semibold text-zinc-600 uppercase tracking-wider mb-1.5">
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
                    <div className="text-[9px] font-semibold text-zinc-600 uppercase tracking-wider">
                      Tasks ({agentExecutions.length})
                    </div>
                    <select
                      value={executionFilter}
                      onChange={(e) => setExecutionFilter(e.target.value)}
                      className="bg-zinc-800 border border-zinc-700 text-zinc-400 rounded-md text-[9px] px-1.5 py-0.5 outline-none cursor-pointer"
                    >
                      <option value="all">All</option>
                      <option value="completed">Done</option>
                      <option value="failed">Failed</option>
                      <option value="running">Active</option>
                    </select>
                  </div>

                  <div className="space-y-0.5 max-h-40 overflow-y-auto">
                    {filteredAgentExecs.length === 0 && (
                      <p className="text-[10px] text-zinc-700 py-2 text-center italic">No executions</p>
                    )}
                    {filteredAgentExecs.slice(0, 10).map((ex) => {
                      const duration = ex.completedAt
                        ? Math.round((new Date(ex.completedAt).getTime() - new Date(ex.startedAt).getTime()) / 1000)
                        : null;
                      return (
                        <div
                          key={ex.id}
                          onClick={() => setSelectedExecution(ex)}
                          className="flex items-center gap-2 py-1 px-1.5 rounded-md hover:bg-zinc-800/30 transition-colors text-[10px] cursor-pointer"
                        >
                          <span
                            className={`shrink-0 ${ex.status === 'completed' ? 'text-green-500' : ex.status === 'failed' ? 'text-red-500' : 'text-amber-400'}`}
                          >
                            {ex.status === 'completed' ? '✔' : ex.status === 'failed' ? '✗' : '◉'}
                          </span>
                          <span className="text-zinc-300 truncate flex-1">{ex.task}</span>
                          <span className="text-zinc-600 shrink-0">
                            {new Date(ex.startedAt).toLocaleTimeString()} {duration !== null && `· ${duration}s`}
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

                  <div className="mt-2 flex gap-2">
                    <input
                      value={runTask}
                      onChange={(e) => setRunTask(e.target.value)}
                      placeholder="Assign a task to this agent..."
                      className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 outline-none focus:border-zinc-500"
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
                    <div className="mt-1.5 text-[10px] text-zinc-400 bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-2">
                      {runOutput}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sidebar panels */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
        {/* Live Activity */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
          <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <span className="w-1 h-3 rounded-full bg-blue-500/60" /> Live Activity
            <span className="text-zinc-700 font-normal">({agentEvents.length})</span>
          </h3>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {agentEvents.slice(0, 15).map((e, i) => (
              <div
                key={e.id || i}
                className="flex items-start gap-2 py-1 px-1 rounded hover:bg-zinc-800/20 transition-colors"
              >
                <span className="text-blue-400 shrink-0 mt-0.5 text-[11px]">●</span>
                <div className="min-w-0">
                  <div className="text-[10px] text-zinc-400 truncate">{e.message}</div>
                  <div className="text-[8px] text-zinc-700 truncate">
                    {e.actor.name} · {new Date(e.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
            {agentEvents.length === 0 && (
              <p className="text-[10px] text-zinc-700 py-3 text-center italic">No agent activity yet</p>
            )}
          </div>
        </div>

        {/* Teams */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-1 h-3 rounded-full bg-purple-500/60" /> Teams
              <span className="text-zinc-700 font-normal">({teams.length})</span>
            </h3>
            <button
              onClick={() => setShowTeamCreator(true)}
              className="text-[9px] text-zinc-600 hover:text-zinc-400 transition-colors cursor-pointer"
            >
              + New
            </button>
          </div>
          {teams.length === 0 ? (
            <p className="text-[10px] text-zinc-700 py-3 text-center italic">No teams yet</p>
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
                  <div key={team.id} className="border border-zinc-800 rounded-lg overflow-hidden">
                    <div
                      className="p-2.5 bg-zinc-800/20 flex items-center justify-between cursor-pointer hover:bg-zinc-800/40 transition-colors"
                      onClick={() => setExpandedTeam(isExpandedT ? null : team.id)}
                    >
                      <div className="min-w-0">
                        <div className="text-[11px] text-zinc-300 font-medium truncate">{team.name}</div>
                        <div className="text-[8px] text-zinc-600 flex items-center gap-1">
                          {members.length} members{leader ? ` · leader: ${leader.name}` : ''}
                        </div>
                      </div>
                      <span
                        className={`text-zinc-600 text-[10px] shrink-0 transition-transform ${isExpandedT ? 'rotate-180' : ''}`}
                      >
                        ▼
                      </span>
                    </div>
                    {isExpandedT && (
                      <div className="p-2.5 space-y-2 border-t border-zinc-800">
                        <div className="space-y-1">
                          {members.map((m) => (
                            <div
                              key={m.id}
                              className="flex items-center gap-2 text-[10px] group py-0.5 px-1 rounded hover:bg-zinc-800/20 transition-colors"
                            >
                              <span
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: getColor(m) }}
                              />
                              <span className="text-zinc-300 flex-1 truncate">{m.name}</span>
                              <span className="text-[8px] text-zinc-700">{m.role}</span>
                              <button
                                onClick={() => setLeader(m.id)}
                                className="text-[8px] text-zinc-600 hover:text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                title="Set as leader"
                              >
                                👑
                              </button>
                              <button
                                onClick={() => removeMember(m.id)}
                                className="text-[8px] text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
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
                              className="w-full bg-zinc-800 border border-zinc-700 rounded-md text-[9px] px-2 py-1 text-zinc-300 placeholder-zinc-700 outline-none focus:border-zinc-500"
                            />
                            <div className="mt-1 space-y-0.5 max-h-24 overflow-y-auto">
                              {unassigned
                                .filter((a) => !search || a.name.toLowerCase().includes(search.toLowerCase()))
                                .slice(0, 5)
                                .map((a) => (
                                  <button
                                    key={a.id}
                                    onClick={() => addMember(a.id)}
                                    className="w-full flex items-center gap-2 text-[9px] text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-md px-1.5 py-1 transition-colors cursor-pointer"
                                  >
                                    <span
                                      className="w-1.5 h-1.5 rounded-full shrink-0"
                                      style={{ backgroundColor: getColor(a) }}
                                    />
                                    <span className="truncate">{a.name}</span>
                                    <span className="text-zinc-700 ml-auto text-[11px]">+</span>
                                  </button>
                                ))}
                            </div>
                          </div>
                        )}
                        <div className="flex gap-1 pt-1 border-t border-zinc-800">
                          <button
                            onClick={deleteTeamFn}
                            className="text-[8px] px-2 py-0.5 bg-zinc-800 border border-zinc-700 text-red-400 rounded-md hover:bg-red-400/10 transition-colors cursor-pointer"
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
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
          <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <span className="w-1 h-3 rounded-full bg-green-500/60" /> Execution Summary
          </h3>
          <div className="space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-zinc-600">Completed</span>
              <span className="text-green-400 font-medium">{execSummary.completed}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-600">Failed</span>
              <span className="text-red-400 font-medium">{execSummary.failed}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-600">Running</span>
              <span className="text-amber-400 font-medium">{execSummary.running}</span>
            </div>
            {executions.length > 0 && (
              <div className="pt-1">
                <div className="w-full bg-zinc-800 rounded-full h-2 flex overflow-hidden">
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
                <div className="flex items-center justify-between text-[9px] text-zinc-700 mt-1">
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

function AgentRegistryModal({
  agent,
  teams,
  onSave,
  onClose,
}: {
  agent: Agent | null;
  teams: Team[];
  onSave: (a: Partial<Agent>) => void;
  onClose: () => void;
}) {
  const isNewRegistration = !agent?.id || agent?.id?.startsWith('slot-') || agent?.status === 'unregistered';
  const [name, setName] = useState(agent?.name || '');
  const [role, setRole] = useState(agent?.role || 'custom');
  const [description, setDescription] = useState(agent?.description || '');
  const [provider, setProvider] = useState(agent?.provider || 'opencode');
  const [model, setModel] = useState(agent?.model || '');
  const [teamId, setTeamId] = useState(agent?.teamId || '');
  const [color, setColor] = useState(agent?.color || '#6b7280');
  const [capStr, setCapStr] = useState((agent?.capabilities || []).join(', '));
  const roles = [
    'architect',
    'developer',
    'verifier',
    'reviewer',
    'tester',
    'documenter',
    'analyst',
    'security-agent',
    'performance-agent',
    'documentation-agent',
    'refactoring-agent',
    'release-agent',
    'conversation',
    'planner',
    'frontend',
    'dashboard-curator',
  ];
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      name,
      role,
      description,
      provider,
      model,
      teamId: teamId || '',
      color,
      capabilities: capStr
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    });
  };
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-4xl mx-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-zinc-100">{isNewRegistration ? 'Register Agent' : 'Edit Agent'}</h2>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 text-base cursor-pointer">
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-zinc-600 uppercase tracking-wider block mb-1">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Agent name"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 placeholder-zinc-700 outline-none focus:border-zinc-500"
              />
            </div>
            <div>
              <label className="text-[10px] text-zinc-600 uppercase tracking-wider block mb-1">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 outline-none focus:border-zinc-500 cursor-pointer"
              >
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] text-zinc-600 uppercase tracking-wider block mb-1">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this agent does..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 placeholder-zinc-700 outline-none focus:border-zinc-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-zinc-600 uppercase tracking-wider block mb-1">Provider</label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 outline-none cursor-pointer"
              >
                <option value="opencode">OpenCode</option>
                <option value="local">Local</option>
                <option value="">None</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-zinc-600 uppercase tracking-wider block mb-1">Model</label>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g. deepseek-v4-flash-free"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 placeholder-zinc-700 outline-none focus:border-zinc-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-zinc-600 uppercase tracking-wider block mb-1">Team</label>
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 outline-none cursor-pointer"
              >
                <option value="">No team</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-zinc-600 uppercase tracking-wider block mb-1">Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-8 h-8 bg-zinc-800 border border-zinc-700 rounded-lg cursor-pointer shrink-0"
                />
                <input
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-[10px] text-zinc-300 font-mono outline-none focus:border-zinc-500"
                />
              </div>
            </div>
          </div>
          <div>
            <label className="text-[10px] text-zinc-600 uppercase tracking-wider block mb-1">
              Capabilities (comma-separated)
            </label>
            <input
              value={capStr}
              onChange={(e) => setCapStr(e.target.value)}
              placeholder="e.g. code-generation, refactoring, testing"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 placeholder-zinc-700 outline-none focus:border-zinc-500"
            />
            {capStr.trim() && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {capStr
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .map((c) => (
                    <span
                      key={c}
                      className="text-[8px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded border border-zinc-700/50"
                    >
                      {c}
                    </span>
                  ))}
              </div>
            )}
          </div>
          <div className="flex gap-2 pt-2 border-t border-zinc-800">
            <button
              type="submit"
              className="flex-1 text-xs px-3 py-2 bg-amber-400/10 border border-amber-400/30 text-amber-400 rounded-lg hover:bg-amber-400/20 transition-colors cursor-pointer font-medium"
            >
              {isNewRegistration ? 'Register Agent' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-xs px-3 py-2 bg-zinc-800 border border-zinc-700 text-zinc-400 rounded-lg hover:bg-zinc-700 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TeamCreatorModal({
  onSave,
  onClose,
}: {
  onSave: (name: string, description: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-[1280px] mx-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-zinc-100">New Team</h2>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 text-base cursor-pointer">
            ✕
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] text-zinc-600 uppercase tracking-wider block mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Team name"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 placeholder-zinc-700 outline-none focus:border-zinc-500"
            />
          </div>
          <div>
            <label className="text-[10px] text-zinc-600 uppercase tracking-wider block mb-1">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this team works on"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 placeholder-zinc-700 outline-none focus:border-zinc-500"
            />
          </div>
          <div className="flex gap-2 pt-2 border-t border-zinc-800">
            <button
              onClick={() => onSave(name, description)}
              disabled={!name.trim()}
              className="flex-1 text-xs px-3 py-2 bg-amber-400/10 border border-amber-400/30 text-amber-400 rounded-lg hover:bg-amber-400/20 disabled:opacity-30 transition-colors cursor-pointer font-medium"
            >
              Create Team
            </button>
            <button
              onClick={onClose}
              className="text-xs px-3 py-2 bg-zinc-800 border border-zinc-700 text-zinc-400 rounded-lg hover:bg-zinc-700 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
