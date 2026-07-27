import { useCallback, useEffect, useMemo, useState } from 'react';
import { workspaceSocket } from '../lib/ws';
import { useEventStream } from '../lib/useEventStream';

import DashboardListCard from '../components/dashboard/DashboardListCard';
import MemoryRounded from '@mui/icons-material/MemoryRounded';
import DashboardListItem from '../components/dashboard/DashboardListItem';

const StatCard = (props: any) => <div>{props.children}</div>;
const StatusBadge = (props: any) => <div>{props.children}</div>;
const StatusDot = (props: any) => <div>{props.children}</div>;
const WorkflowModal = (props: any) => (props.show ? <div /> : null);
const AgentHeader = (props: any) => <div>{props.children}</div>;
const ExecutionsList = (props: any) => <div />;
const ProviderCard = (props: any) => <div />;
const SystemHealthGauge = (props: any) => <div />;
const PipelineStatus = (props: any) => <div />;
const BackgroundServices = (props: any) => <div />;
const ActiveSessionsPanel = (props: any) => <div />;
const AlertBanner = (props: any) => <div />;
const OpsCenterLayout = (props: any) => <div>{props.children}</div>;

interface Agent {
  id: string;
  name: string;
  role: string;
  status: string;
  description?: string;
  provider?: string;
  model?: string;
  color?: string;
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

interface Session {
  id: string;
  goal: string;
  status: string;
  workflowId?: string;
  timeline?: any[];
  metrics?: { totalSteps: number; completedSteps: number };
  createdAt: string;
}

const ROLE_COLORS: Record<string, string> = {
  architect: '#8b5cf6',
  developer: '#3b82f6',
  verifier: '#10b981',
  documenter: '#f59e0b',
  conversation: '#6366f1',
  'dashboard-curator': '#06b6d4',
  frontend: '#ec4899',
  analyst: '#a855f7',
  reviewer: '#14b8a6',
  tester: '#84cc16',
  'security-agent': '#ef4444',
  'performance-agent': '#f97316',
  'documentation-agent': '#22c55e',
  'refactoring-agent': '#0ea5e9',
  'release-agent': '#eab308',
  planner: '#d946ef',
  planning: '#d946ef',
};

const ALL_AGENTS = [
  { role: 'conversation', label: 'Conversation' },
  { role: 'planning', label: 'Planning' },
  { role: 'architect', label: 'Architecture' },
  { role: 'developer', label: 'Development' },
  { role: 'verifier', label: 'Verification' },
  { role: 'reviewer', label: 'Review' },
  { role: 'tester', label: 'Testing' },
  { role: 'documenter', label: 'Documentation' },
  { role: 'analyst', label: 'Repository Analysis' },
  { role: 'security-agent', label: 'Security' },
  { role: 'performance-agent', label: 'Performance' },
  { role: 'documentation-agent', label: 'Doc Generation' },
  { role: 'refactoring-agent', label: 'Refactoring' },
  { role: 'release-agent', label: 'Release' },
  { role: 'frontend', label: 'Dashboard UI' },
  { role: 'dashboard-curator', label: 'Monitoring' },
];

const WORKFLOW_TYPES = [
  {
    id: 'feature',
    label: 'Feature',
    description: 'Full implement-verify-document cycle',
    icon: '✦',
  },
  {
    id: 'analyze',
    label: 'Analysis',
    description: 'Repository structure and dependency audit',
    icon: '◎',
  },
  {
    id: 'document',
    label: 'Documentation',
    description: 'Generate code docs and API references',
    icon: '📄',
  },
  {
    id: 'refactor',
    label: 'Refactoring',
    description: 'Clean up code with automated refactors',
    icon: '⟳',
  },
  {
    id: 'release',
    label: 'Release',
    description: 'Version bump, changelog, and tag prep',
    icon: '⬆',
  },
];

const BG_SERVICES = [
  {
    id: 'analyst',
    label: 'Analyst',
    agentId: 'agent-analyst',
    color: '#a855f7',
    description: 'Repository indexing & structure analysis',
  },
  {
    id: 'security',
    label: 'Security',
    agentId: 'agent-security',
    color: '#ef4444',
    description: 'Vulnerability scanning & dependency check',
  },
  {
    id: 'performance',
    label: 'Performance',
    agentId: 'agent-performance',
    color: '#f97316',
    description: 'Bundle size & runtime profiling',
  },
  {
    id: 'documentation',
    label: 'Documentation',
    agentId: 'agent-documentation',
    color: '#22c55e',
    description: 'Auto-generate docs from code changes',
  },
];

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export default function OpsCenter() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [eventFilter, setEventFilter] = useState<string>('all');
  const [bgRunning, setBgRunning] = useState(false);
  const [bgObservations, setBgObservations] = useState(0);
  const [wfRunning, setWfRunning] = useState(false);
  const [showWorkflowModal, setShowWorkflowModal] = useState(false);
  const [wfGoal, setWfGoal] = useState('');
  const [wfType, setWfType] = useState('feature');
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [showAllExecs, setShowAllExecs] = useState(false);
  const [selectedExecution, setSelectedExecution] = useState<Execution | null>(null);
  const { connected, events } = useEventStream();

  const load = useCallback(async () => {
    try {
      const [a, h, s] = await Promise.all([
        fetch('/api/agents').then((r) => (r.ok ? r.json() : { agents: [], executions: [] })),
        fetch('/api/health').then((r) => (r.ok ? r.json() : null)),
        fetch('/api/sessions').then((r) => (r.ok ? r.json() : { sessions: [] })),
      ]);
      setAgents(a.agents ?? []);
      setExecutions(a.executions ?? []);
      setSessions(s.sessions ?? []);
      if (h) setHealth(h);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const off = workspaceSocket.onEvent((evt) => {
      if (evt.type.startsWith('agent.') || evt.type === 'system.heartbeat' || evt.type.startsWith('session.')) load();
    });
    return off;
  }, [load]);

  const agentStatuses = useMemo(
    () =>
      agents.map((a) => {
        const execs = executions.filter(
          (e) => e.agentId === a.id || a.name.toLowerCase().includes(e.agentId.split('-').pop()?.toLowerCase() || ''),
        );
        const latest = execs.length > 0 ? execs[0] : null;
        return {
          ...a,
          isRunning: latest?.status === 'running' || latest?.status === 'queued',
          lastTask: latest?.task,
          execCount: execs.length,
          lastStatus: latest?.status,
        };
      }),
    [agents, executions],
  );

  const execStats = useMemo(() => {
    const finished = executions.filter((e) => e.status !== 'running' && e.status !== 'queued');
    return {
      total: executions.length,
      completed: executions.filter((e) => e.status === 'completed').length,
      failed: executions.filter((e) => e.status === 'failed').length,
      running: executions.filter((e) => e.status === 'running' || e.status === 'queued').length,
      successRate:
        finished.length > 0
          ? Math.round((executions.filter((e) => e.status === 'completed').length / finished.length) * 100)
          : 0,
    };
  }, [executions]);

  const activeSessions = useMemo(
    () => sessions.filter((s) => s.status === 'running' || s.status === 'queued'),
    [sessions],
  );

  const filteredEvents = useMemo(() => {
    if (eventFilter === 'all') return events;
    return events.filter((e) => e.category === eventFilter);
  }, [events, eventFilter]);

  const conversationAgent = agentStatuses.find((a) => a.role === 'conversation');
  const isListening = conversationAgent?.isRunning || events.some((e) => e.type === 'conversation.listening');

  const runBackground = async () => {
    setBgRunning(true);
    try {
      const res = await fetch('/api/background/run', { method: 'POST' });
      if (res.ok) {
        setBgObservations((o) => o + 4);
        setTimeout(() => load(), 1500);
      }
    } catch {}
    setTimeout(() => setBgRunning(false), 2000);
  };

  const startWorkflow = async () => {
    if (!wfGoal.trim()) return;
    setWfRunning(true);
    try {
      await fetch('/api/sessions/executions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: wfGoal, workflowType: wfType }),
      });
      setShowWorkflowModal(false);
      setWfGoal('');
      setTimeout(() => load(), 1000);
    } catch {}
    setWfRunning(false);
  };

  if (loading)
    return (
      <div className="w-full px-4 py-16 text-center text-zinc-600 animate-pulse">Loading Operations Center...</div>
    );

  const agentTimeline = sessions.flatMap((s) => (s.timeline || []).map((t: any) => ({ ...t, sessionGoal: s.goal })));
  const recentAgentRuns = agentTimeline.filter((t: any) => t.status === 'running');

  const activeAgentCount = agentStatuses.filter((a) => a.isRunning).length;
  const totalRegistered = agents.length;

  const stageStatus = (stage: string) => {
    const agent = agentStatuses.find((a) => {
      if (stage === 'Input') return a.role === 'conversation' && a.isRunning;
      if (stage === 'Analyze') return a.role === 'analyst' && a.isRunning;
      if (stage === 'Plan') return (a.role === 'planning' || a.role === 'planner') && a.isRunning;
      if (stage === 'Implement') return a.role === 'developer' && a.isRunning;
      if (stage === 'Verify') return a.role === 'verifier' && a.isRunning;
      if (stage === 'Release') return a.role === 'release-agent' && a.isRunning;
      return false;
    });
    return agent?.isRunning || false;
  };

  const pipelineStages = [
    { stage: 'Input', status: isListening, agents: conversationAgent ? 1 : 0 },
    {
      stage: 'Analyze',
      status: stageStatus('Analyze'),
      agents: agentStatuses.filter((a) => a.role === 'analyst').length,
    },
    {
      stage: 'Plan',
      status: stageStatus('Plan'),
      agents: agentStatuses.filter((a) => a.role === 'planning' || a.role === 'planner').length,
    },
    {
      stage: 'Implement',
      status: stageStatus('Implement'),
      agents: agentStatuses.filter((a) => a.role === 'developer').length,
    },
    {
      stage: 'Verify',
      status: stageStatus('Verify'),
      agents: agentStatuses.filter((a) => a.role === 'verifier').length,
    },
    {
      stage: 'Release',
      status: stageStatus('Release'),
      agents: agentStatuses.filter((a) => a.role === 'release-agent').length,
    },
  ];

  const executionDetail = selectedExecution && (
    <ExecutionsDetailModal execution={selectedExecution} agents={agents} onClose={() => setSelectedExecution(null)} />
  );

  const eventDetail = selectedEvent && (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={() => setSelectedEvent(null)}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 w-full max-w-4xl mx-4 shadow-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-zinc-200">Event Details</h3>
          <button
            onClick={() => setSelectedEvent(null)}
            className="text-zinc-600 hover:text-zinc-400 text-base cursor-pointer"
          >
            ✕
          </button>
        </div>
        <div className="space-y-3 flex-1 pr-1" style={{ overflowY: 'scroll' }}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div>
              <span className="text-zinc-600 text-[10px]">Type</span>
              <div className="text-zinc-300 font-mono text-[11px] mt-0.5">{selectedEvent.type}</div>
            </div>
            <div>
              <span className="text-zinc-600 text-[10px]">Actor</span>
              <div className="text-zinc-300 text-[11px] mt-0.5">
                {selectedEvent.actor?.name} ({selectedEvent.actor?.type})
              </div>
            </div>
            <div>
              <span className="text-zinc-600 text-[10px]">Time</span>
              <div className="text-zinc-300 text-[11px] mt-0.5">
                {new Date(selectedEvent.timestamp).toLocaleString()}
              </div>
            </div>
            <div>
              <span className="text-zinc-600 text-[10px]">Category</span>
              <div className="text-zinc-300 text-[11px] mt-0.5">{selectedEvent.category}</div>
            </div>
          </div>
          <div className="pt-2 border-t border-zinc-700">
            <div className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Message</div>
            <div className="text-xs text-zinc-300 leading-relaxed bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3">
              {selectedEvent.message}
            </div>
          </div>
          {selectedEvent.metadata && (
            <div className="pt-2 border-t border-zinc-700">
              <div className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Metadata</div>
              <pre
                className="text-[10px] text-zinc-400 font-mono whitespace-pre-wrap bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3 max-h-48"
                style={{ overflowY: 'scroll' }}
              >
                {JSON.stringify(selectedEvent.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="w-full px-4">
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className={`w-3 h-3 rounded-full ${isListening ? 'bg-green-400 animate-pulse' : 'bg-zinc-600'}`} />
          <div>
            <h1 className="text-lg font-bold text-zinc-100">Ops Center</h1>
            <p className="text-[10px] text-zinc-600">
              {isListening ? 'Conversation agent listening' : 'System idle'} · {totalRegistered} agents registered
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowWorkflowModal(true)}
            className="text-xs px-3 py-1.5 bg-blue-600/10 border border-blue-500/30 text-blue-400 rounded-lg hover:bg-blue-600/20 transition-colors cursor-pointer font-medium"
          >
            + New Workflow
          </button>
          <button
            onClick={load}
            className="text-xs px-2 py-1.5 bg-zinc-800 border border-zinc-700 text-zinc-500 rounded-lg hover:bg-zinc-700 transition-colors cursor-pointer"
            title="Refresh"
          >
            ↻
          </button>
        </div>
      </div>

      <div
        className="
    grid
    grid-cols-1
    gap-6
    items-stretch
    xl:grid-cols-[320px_minmax(0,1fr)_320px]
    2xl:grid-cols-[360px_minmax(0,1fr)_360px]
  "
      >
        {/* Left Sidebar */}

        <aside className="flex flex-col gap-6">
          <DashboardListCard title="Runtime" subtitle="Engine Information" icon={<MemoryRounded fontSize="small" />}>
            {health && (
              <>
                <DashboardListItem label="Uptime" value="28 min" />

                <DashboardListItem label="Memory" value="421 MB" />

                <DashboardListItem label="Version" value="7.3.0" />

                <DashboardListItem label="Sessions" value="14" />

                <DashboardListItem label="Workspace" value="/workspace/vestara" />

                <ProviderCard
                  connected={connected}
                  providerName={(globalThis as any).process?.env?.PROVIDER_NAME || 'OpenCode'}
                />
              </>
            )}
          </DashboardListCard>
          <PipelineStatus stages={pipelineStages} />
          {health?.categories && <SystemHealthGauge health={health} />}

          <BackgroundServices
            services={BG_SERVICES}
            recentAgentRuns={recentAgentRuns}
            bgObservations={bgObservations}
            bgRunning={bgRunning}
            onRunBackground={runBackground}
          />
          {activeSessions.length > 0 && <ActiveSessionsPanel activeSessions={activeSessions} />}
        </aside>

        {/* Main Content */}
        <main className="flex min-w-0 flex-col gap-6">
          <WorkflowModal
            show={showWorkflowModal}
            onClose={() => setShowWorkflowModal(false)}
            onStart={startWorkflow}
            workflowType={wfType}
            setWorkflowType={setWfType}
            workflowGoal={wfGoal}
            setWorkflowGoal={setWfGoal}
            wfRunning={wfRunning}
          />
          <AlertBanner failed={execStats.failed} onDismiss={load} />
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
              Activity Feed <span className="text-zinc-700 font-normal text-[10px]">({filteredEvents.length})</span>
            </h2>
            <div className="flex gap-1">
              {['all', 'system', 'conversation', 'agent'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setEventFilter(cat)}
                  className={`text-[9px] px-2 py-0.5 rounded transition-colors cursor-pointer ${eventFilter === cat ? 'bg-zinc-700 text-zinc-200 font-medium' : 'text-zinc-600 hover:text-zinc-400'}`}
                >
                  {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg">
            <div className="p-2 space-y-0.5">
              {filteredEvents.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="text-2xl mb-2 opacity-30">◉</div>
                  <p className="text-xs text-zinc-700">No events yet</p>
                  <p className="text-[10px] text-zinc-700 mt-1">
                    Events appear here as agents and the system process work
                  </p>
                </div>
              )}
              {filteredEvents.slice(0, 80).map((e, i) => (
                <div
                  key={e.id || i}
                  onClick={() => setSelectedEvent(e)}
                  className="flex items-start gap-2.5 py-1.5 px-2 rounded-md transition-colors cursor-pointer hover:bg-zinc-800/30"
                >
                  <span className="text-[9px] text-zinc-700 font-mono shrink-0 w-12 pt-0.5">
                    {new Date(e.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <span
                    className={`shrink-0 pt-0.5 text-[10px] ${e.actor.type === 'agent' ? 'text-blue-400' : e.actor.type === 'user' ? 'text-accent' : 'text-zinc-500'}`}
                  >
                    {e.actor.type === 'agent' ? '●' : e.actor.type === 'user' ? '◉' : '◆'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] text-zinc-300 truncate">{e.message}</div>
                    <div className="text-[9px] text-zinc-700 truncate">
                      {e.actor.name} · {e.type}
                    </div>
                  </div>
                  <span className="text-[7px] uppercase tracking-wider shrink-0 self-center bg-zinc-800/50 px-1.5 py-0.5 rounded text-zinc-600 font-medium">
                    {e.category}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <ExecutionsList
            executions={executions}
            agents={agents}
            formatDuration={formatDuration}
            setSelectedExecution={setSelectedExecution}
            showAllExecs={showAllExecs}
            setShowAllExecs={setShowAllExecs}
          />
        </main>

        {/* Right Sidebar */}
        <aside className="flex flex-col gap-6">
          <AgentHeader
            agentFilter={agentFilter}
            setAgentFilter={setAgentFilter}
            activeAgentCount={activeAgentCount}
            totalRegistered={totalRegistered}
          />
          <div className="space-y-2 pr-1">
            {ALL_AGENTS.filter(({ role }) => {
              if (agentFilter === 'all') return true;
              const agent = agentStatuses.find((a) => a.role === role);
              if (agentFilter === 'active') return agent?.isRunning;
              if (agentFilter === 'offline') return !agent;
              return agent && !agent.isRunning;
            }).map(({ role, label }) => {
              const agent = agentStatuses.find((a) => a.role === role);
              const present = !!agent;
              const running = agent?.isRunning;
              const color = ROLE_COLORS[role] || '#6b7280';
              const isExpanded = expandedAgent === role;
              const execs = executions.filter((e: any) => e.agentId === agent?.id || agent?.id?.includes(e.agentId));
              return (
                <div key={role}>
                  <div
                    className="bg-zinc-900/50 border border-zinc-800 rounded-lg overflow-hidden cursor-pointer hover:border-zinc-700 transition-colors"
                    onClick={() => setExpandedAgent(isExpanded ? null : role)}
                    style={{ borderLeftColor: color, borderLeftWidth: '3px' }}
                  >
                    <div className="p-3 flex items-center gap-3">
                      <div className="relative shrink-0">
                        <span
                          className={`w-3 h-3 rounded-full block ${running ? 'animate-pulse' : ''}`}
                          style={{
                            backgroundColor: running ? color : present ? `${color}88` : '#3f3f46',
                          }}
                        />
                        {running && (
                          <span
                            className="absolute inset-0 w-3 h-3 rounded-full animate-ping opacity-40"
                            style={{ backgroundColor: color }}
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-zinc-200 truncate">{label}</span>
                          <span className="text-[8px] px-1 py-0.5 rounded bg-zinc-800 text-zinc-500 uppercase font-medium shrink-0">
                            {role}
                          </span>
                          <StatusBadge status={running ? 'Active' : present ? 'Idle' : 'Offline'} type="agent" />
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {agent?.description && (
                            <span className="text-[9px] text-zinc-600 truncate">{agent.description}</span>
                          )}
                          {!agent?.description && (
                            <span className="text-[9px] text-zinc-700 italic">No description</span>
                          )}
                        </div>
                        {agent && (
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[8px] text-zinc-700">execs: {execs.length}</span>
                            {agent.provider && <span className="text-[8px] text-zinc-700">· {agent.provider}</span>}
                            {agent.model && (
                              <span className="text-[8px] text-zinc-700 font-mono truncate">{agent.model}</span>
                            )}
                          </div>
                        )}
                      </div>
                      <span
                        className="text-zinc-700 shrink-0 text-[10px] transition-transform"
                        style={{
                          transform: isExpanded ? 'rotate(180deg)' : 'none',
                        }}
                      >
                        ▼
                      </span>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="ml-4 mt-1 space-y-0.5 border-l-2 border-zinc-800 pl-3 pb-1">
                      {execs.length === 0 && (
                        <div className="text-[9px] text-zinc-700 py-2 italic">No executions recorded</div>
                      )}
                      {execs.slice(0, 8).map((ex: any) => {
                        const duration = ex.completedAt
                          ? Math.round((new Date(ex.completedAt).getTime() - new Date(ex.startedAt).getTime()) / 1000)
                          : null;
                        return (
                          <div
                            key={ex.id}
                            onClick={() => setSelectedExecution(ex)}
                            className="flex items-center gap-2 py-1 hover:bg-zinc-800/20 rounded px-1 -mx-1 transition-colors cursor-pointer"
                          >
                            <span
                              className={`shrink-0 text-[9px] ${ex.status === 'completed' ? 'text-green-500' : ex.status === 'failed' ? 'text-red-500' : 'text-amber-400'}`}
                            >
                              {ex.status === 'completed' ? '✔' : ex.status === 'failed' ? '✗' : '◉'}
                            </span>
                            <span className="text-[10px] text-zinc-500 truncate flex-1">{ex.task}</span>
                            <span className="text-[8px] text-zinc-700 font-mono shrink-0">
                              {duration !== null ? formatDuration(duration) : ''}
                            </span>
                            <span className="text-[8px] text-zinc-700 shrink-0">
                              {new Date(ex.startedAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        );
                      })}
                      {execs.length > 8 && (
                        <div className="text-[8px] text-zinc-700 text-center pt-1">{execs.length - 8} more...</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}

function ExecutionsDetailModal({ execution, agents, onClose }: { execution: any; agents: any[]; onClose: () => void }) {
  const agent = agents.find(
    (a) =>
      a.id === execution.agentId ||
      a.name.toLowerCase().includes(execution.agentId.split('-').pop()?.toLowerCase() || ''),
  );
  const duration = execution.completedAt
    ? Math.round((new Date(execution.completedAt).getTime() - new Date(execution.startedAt).getTime()) / 1000)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 w-full max-w-4xl mx-4 shadow-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-zinc-200">Execution Details</h3>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 text-base cursor-pointer">
            ✕
          </button>
        </div>
        <div className="space-y-3 flex-1 pr-1" style={{ overflowY: 'scroll' }}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div>
              <span className="text-zinc-600 text-[10px]">Agent</span>
              <div className="text-zinc-300 text-[11px] mt-0.5">{agent?.name || execution.agentId}</div>
            </div>
            <div>
              <span className="text-zinc-600 text-[10px]">Status</span>
              <div className="text-zinc-300 text-[11px] mt-0.5">{execution.status}</div>
            </div>
            <div>
              <span className="text-zinc-600 text-[10px]">Started</span>
              <div className="text-zinc-300 text-[11px] mt-0.5">{new Date(execution.startedAt).toLocaleString()}</div>
            </div>
            {execution.completedAt && (
              <div>
                <span className="text-zinc-600 text-[10px]">Completed</span>
                <div className="text-zinc-300 text-[11px] mt-0.5">
                  {new Date(execution.completedAt).toLocaleString()}
                </div>
              </div>
            )}
            <div>
              <span className="text-zinc-600 text-[10px]">Duration</span>
              <div className="text-zinc-300 text-[11px] mt-0.5">
                {duration !== null ? formatDuration(duration) : '--'}
              </div>
            </div>
          </div>
          <div className="pt-2 border-t border-zinc-700">
            <div className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Task</div>
            <div className="text-xs text-zinc-300 leading-relaxed bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3">
              {execution.task}
            </div>
          </div>
          {execution.result && (
            <div className="pt-2 border-t border-zinc-700">
              <div className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Result</div>
              <div
                className="text-xs text-zinc-300 leading-relaxed bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3 max-h-48"
                style={{ overflowY: 'scroll' }}
              >
                {JSON.stringify(execution.result, null, 2)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
