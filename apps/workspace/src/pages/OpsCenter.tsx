import { useCallback, useEffect, useMemo, useState } from 'react';
import OpsEventModal from '../components/ops/OpsEventModal';
import OpsExecutionsModal from '../components/ops/OpsExecutionsModal';
import OpsLeftSidebar from '../components/ops/OpsLeftSidebar';
import OpsRightSidebar from '../components/ops/OpsRightSidebar';
import StatCard from '../components/dashboard/StatCard';
import { useTheme } from '../lib/theme';
import { useEventStream } from '../lib/useEventStream';
import { workspaceSocket } from '../lib/ws';

export interface Agent {
  id: string;
  name: string;
  role: string;
  status: string;
  description?: string;
  provider?: string;
  model?: string;
  color?: string;
}

export interface Execution {
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
}

interface WorkflowType {
  id: string;
  label: string;
  icon: string;
}

const ROLE_COLORS: Record<string, string> = {
  conversation: '#6366f1',
  'planning-agent': '#3b82f6',
  'implementation-agent': '#10b981',
  verification: '#f59e0b',
  'release-agent': '#8b5cf6',
};

const DEFAULT_WORKFLOW_TYPES: WorkflowType[] = [
  { id: 'feature', label: 'Feature', icon: '✨' },
  { id: 'analyze', label: 'Analysis', icon: '🔍' },
  { id: 'document', label: 'Documentation', icon: '📝' },
  { id: 'refactor', label: 'Refactor', icon: '🔄' },
  { id: 'release', label: 'Release', icon: '📦' },
];

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 10) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-[var(--vestara-green)]',
  running: 'bg-amber-400 animate-pulse',
  queued: 'bg-amber-400',
  failed: 'bg-[var(--vestara-red)]',
};

const CATEGORY_ICONS: Record<string, string> = {
  system: '◆',
  agent: '●',
  conversation: '◉',
};

function StatusDot({ status }: { status: string }) {
  return <span className={`inline-block w-2 h-2 rounded-full ${STATUS_COLORS[status] || 'bg-zinc-600'}`} title={status} />;
}

export default function OpsCenter() {
  const { resolved } = useTheme();
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
  const [workflowTypes, setWorkflowTypes] = useState<WorkflowType[]>(DEFAULT_WORKFLOW_TYPES);
  const { connected, events, loading: eventsLoading } = useEventStream();

  const load = useCallback(async () => {
    try {
      const [a, h, s, w] = await Promise.all([
        fetch('/api/agents').then((r) => (r.ok ? r.json() : { agents: [], executions: [] })),
        fetch('/api/health').then((r) => (r.ok ? r.json() : null)),
        fetch('/api/sessions/executions').then((r) => (r.ok ? r.json() : { sessions: [] })),
        fetch('/api/workflows')
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);
      setAgents(a.agents ?? []);
      setExecutions(a.executions ?? []);
      setSessions(s.sessions ?? []);
      if (h) setHealth(h);

      if (w?.workflows && w.workflows.length > 0) {
        const apiTypes: WorkflowType[] = w.workflows.map((wf: any) => ({
          id: wf.id,
          label: wf.label || wf.name,
          icon: wf.id === 'feature' ? '✨' : wf.id === 'analyze' ? '🔍' : wf.id === 'document' ? '📝' : '⚙️',
        }));
        setWorkflowTypes(apiTypes);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

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
      <div className="w-full px-4 py-16 text-center text-[var(--vestara-text-muted)] animate-pulse">
        Loading Operations Center...
      </div>
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
    { stage: 'Analyze', status: stageStatus('Analyze'), agents: agentStatuses.filter((a) => a.role === 'analyst').length },
    { stage: 'Plan', status: stageStatus('Plan'), agents: agentStatuses.filter((a) => a.role === 'planning' || a.role === 'planner').length },
    { stage: 'Implement', status: stageStatus('Implement'), agents: agentStatuses.filter((a) => a.role === 'developer').length },
    { stage: 'Verify', status: stageStatus('Verify'), agents: agentStatuses.filter((a) => a.role === 'verifier').length },
    { stage: 'Release', status: stageStatus('Release'), agents: agentStatuses.filter((a) => a.role === 'release-agent').length },
  ];

  return (
    <div className="w-full px-4">
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className={`w-3 h-3 rounded-full ${isListening ? 'bg-[var(--vestara-green)] animate-pulse' : 'bg-zinc-600'}`} />
          <div>
            <h1 className="text-lg font-bold text-[var(--vestara-text)]">Ops Center</h1>
            <p className="text-[10px] text-[var(--vestara-text-muted)]">
              {isListening ? 'Conversation agent listening' : 'System idle'} · {totalRegistered} agents registered
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowWorkflowModal(true)}
            className="text-xs px-3 py-1.5 bg-accent-600/10 border border-accent transition-colors cursor-pointer font-medium rounded-lg hover:bg-accent-600/20"
          >
            + New Workflow
          </button>
          <button
            onClick={load}
            className="text-xs px-2 py-1.5 bg-zinc-800 border border-zinc-700 text-[var(--vestara-text-muted)] rounded-lg hover:bg-zinc-700 transition-colors cursor-pointer"
            title="Refresh"
          >
            ↻
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="Executions" value={execStats.total} accent="#8b5cf6" sub={execStats.running > 0 ? `${execStats.running} running` : undefined} />
        <StatCard label="Completed" value={execStats.completed} accent="#10b981" />
        <StatCard label="Failed" value={execStats.failed} accent={execStats.failed > 0 ? '#ef4444' : '#52525b'} />
        <StatCard label="Success Rate" value={execStats.total > 0 ? `${execStats.successRate}%` : '--'} accent="#3b82f6" />
        <StatCard label="Agents" value={totalRegistered} accent="#f59e0b" sub={`${activeAgentCount} active`} />
        <StatCard label="Events" value={events.length} accent="#6366f1" sub={connected ? 'Live' : 'Disconnected'} />
      </div>

      <div className="grid grid-cols-1 gap-6 items-stretch xl:grid-cols-[320px_minmax(0,1fr)_320px] 2xl:grid-cols-[360px_minmax(0,1fr)_360px]">
        <OpsLeftSidebar
          health={health}
          connected={connected}
          pipelineStages={pipelineStages}
          bgRunning={bgRunning}
          bgObservations={bgObservations}
          onRunBackground={runBackground}
          activeSessions={activeSessions}
          agents={agents}
        />

        <main className="flex min-w-0 flex-col gap-6">
          {selectedExecution && (
            <OpsExecutionsModal execution={selectedExecution} agents={agents} onClose={() => setSelectedExecution(null)} formatDuration={formatDuration} />
          )}
          {selectedEvent && <OpsEventModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />}

          {showWorkflowModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowWorkflowModal(false)}>
              <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 w-full max-w-md mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Enter' && wfGoal.trim()) startWorkflow(); if (e.key === 'Escape') setShowWorkflowModal(false); }}>
                <h3 className="text-sm font-semibold text-[var(--vestara-text)] mb-4">Start Workflow</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-[var(--vestara-text-2)] block mb-1">Goal</label>
                    <input
                      type="text"
                      value={wfGoal}
                      onChange={(e) => setWfGoal(e.target.value)}
                      placeholder="Describe the workflow goal..."
                      autoFocus
                      className="w-full bg-zinc-800 border border-zinc-700 text-[var(--vestara-text)] rounded-lg p-2 text-xs outline-none focus:border-[var(--vestara-accent)] placeholder-zinc-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--vestara-text-2)] block mb-1">Type</label>
                    <select
                      value={wfType}
                      onChange={(e) => setWfType(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 text-[var(--vestara-text)] rounded-lg p-2 text-xs outline-none focus:border-[var(--vestara-accent)]"
                    >
                      {workflowTypes.map((t) => (
                        <option key={t.id} value={t.id}>{t.icon} {t.label}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={startWorkflow}
                    disabled={!wfGoal.trim() || wfRunning}
                    className="w-full px-4 py-2 bg-[var(--vestara-accent)] text-white rounded-lg font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
                  >
                    {wfRunning ? 'Starting...' : 'Start Workflow'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-[var(--vestara-text-2)] uppercase tracking-wider flex items-center gap-1.5">
              Activity Feed <span className="text-zinc-600 font-normal text-[10px]">({filteredEvents.length})</span>
            </h2>
            <div className="flex gap-1">
              {['all', 'system', 'conversation', 'agent'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setEventFilter(cat)}
                  className={`text-[9px] px-2 py-0.5 rounded transition-colors cursor-pointer ${
                    eventFilter === cat
                      ? 'bg-zinc-700 text-zinc-200 font-medium'
                      : 'text-[var(--vestara-text-muted)] hover:text-[var(--vestara-text)]'
                  }`}
                >
                  {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg">
            <div className="p-2 space-y-0.5">
              {filteredEvents.length === 0 && !eventsLoading && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="text-2xl mb-2 opacity-30">◉</div>
                  <p className="text-xs text-zinc-600">No events yet</p>
                  <p className="text-[10px] text-zinc-700 mt-1">Events appear here as agents and the system process work</p>
                </div>
              )}
              {filteredEvents.length === 0 && eventsLoading && (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin w-5 h-5 border-2 border-accent border-t-transparent rounded-full" />
                </div>
              )}
              {filteredEvents.slice(0, 80).map((e, i) => (
                <div
                  key={e.id || i}
                  onClick={() => setSelectedEvent(e)}
                  className="flex items-start gap-2.5 py-1.5 px-2 rounded-md transition-colors cursor-pointer hover:bg-zinc-800/30"
                >
                  <span className="text-[9px] text-zinc-600 font-mono shrink-0 w-14 pt-0.5">
                    {formatRelativeTime(e.timestamp)}
                  </span>
                  <span className={`shrink-0 pt-0.5 text-[10px] ${
                    e.actor?.type === 'agent' ? 'text-blue-400'
                    : e.actor?.type === 'user' ? 'text-[var(--vestara-accent)]'
                    : 'text-zinc-500'
                  }`}>
                    {CATEGORY_ICONS[e.category] || '◆'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] text-[var(--vestara-text)] truncate">{e.message}</div>
                    <div className="text-[9px] text-zinc-600 truncate">
                      {e.actor?.name || 'system'} · {e.type}
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

        <OpsRightSidebar
          agentStatuses={agentStatuses}
          expandedAgent={expandedAgent}
          setExpandedAgent={setExpandedAgent}
          agentFilter={agentFilter}
          setAgentFilter={setAgentFilter}
          activeAgentCount={activeAgentCount}
          totalRegistered={totalRegistered}
          executions={executions}
        />
      </div>
    </div>
  );
}

function ExecutionsList({
  executions,
  agents,
  formatDuration,
  setSelectedExecution,
  showAllExecs,
  setShowAllExecs,
}: {
  executions: Execution[];
  agents: Agent[];
  formatDuration: (seconds: number) => string;
  setSelectedExecution: (e: Execution | null) => void;
  showAllExecs: boolean;
  setShowAllExecs: (v: boolean) => void;
}) {
  const display = showAllExecs ? executions : executions.slice(0, 15);

  if (executions.length === 0) {
    return (
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-[var(--vestara-text-muted)] uppercase tracking-wider">Executions</h3>
        </div>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="text-lg mb-1 opacity-30">◉</div>
          <p className="text-xs text-zinc-600">No executions yet</p>
          <p className="text-[10px] text-zinc-700 mt-1">Start a workflow or run an agent to see execution history</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-[var(--vestara-text-muted)] uppercase tracking-wider">
          Executions ({executions.length})
        </h3>
        {executions.length > 15 && (
          <button
            onClick={() => setShowAllExecs(!showAllExecs)}
            className="text-[10px] text-[var(--vestara-accent)] hover:text-[var(--vestara-accent)] cursor-pointer"
          >
            {showAllExecs ? 'Show Less' : `Show All (${executions.length})`}
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[var(--vestara-text-muted)] border-b border-zinc-800">
              <th className="text-left py-1.5 px-2 font-medium sticky top-0 bg-zinc-900">Agent</th>
              <th className="text-left py-1.5 px-2 font-medium sticky top-0 bg-zinc-900">Task</th>
              <th className="text-left py-1.5 px-2 font-medium sticky top-0 bg-zinc-900">Started</th>
              <th className="text-left py-1.5 px-2 font-medium sticky top-0 bg-zinc-900">Duration</th>
              <th className="text-left py-1.5 px-2 font-medium sticky top-0 bg-zinc-900">Status</th>
            </tr>
          </thead>
          <tbody>
            {display.map((exec, i) => {
              const agent = agents.find(
                (a) => a.id === exec.agentId || a.name.toLowerCase().includes(exec.agentId.split('-').pop()?.toLowerCase() || ''),
              );
              const startDate = new Date(exec.startedAt);
              const duration = exec.completedAt
                ? formatDuration(Math.round((new Date(exec.completedAt).getTime() - startDate.getTime()) / 1000))
                : exec.status === 'running'
                  ? formatDuration(Math.round((Date.now() - startDate.getTime()) / 1000))
                  : null;
              return (
                <tr
                  key={exec.id || i}
                  onClick={() => setSelectedExecution(exec)}
                  className="border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer transition-colors"
                >
                  <td className="py-1.5 px-2 text-[var(--vestara-text)]">{agent?.name || exec.agentId}</td>
                  <td className="py-1.5 px-2 text-[var(--vestara-text)] truncate max-w-xs">{exec.task}</td>
                  <td className="py-1.5 px-2 text-zinc-500">{formatRelativeTime(exec.startedAt)}</td>
                  <td className="py-1.5 px-2 text-zinc-400">{duration || '--'}</td>
                  <td className="py-1.5 px-2"><StatusDot status={exec.status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
