import { useCallback, useEffect, useMemo, useState } from 'react';
import { workspaceSocket } from '../lib/ws';
import { useEventStream } from '../lib/useEventStream';
import { useTheme } from '../lib/theme';
import OpsLeftSidebar from '../components/ops/OpsLeftSidebar';
import OpsRightSidebar from '../components/ops/OpsRightSidebar';
import OpsEventModal from '../components/ops/OpsEventModal';
import OpsExecutionsModal from '../components/ops/OpsExecutionsModal';

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

const ROLE_COLORS: Record<string, string> = {
  conversation: '#6366f1',
  'planning-agent': '#3b82f6',
  'implementation-agent': '#10b981',
  verification: '#f59e0b',
  'release-agent': '#8b5cf6',
};

const ALL_AGENTS: Agent[] = [
  { id: 'conv', name: 'Conversation Agent', role: 'conversation', status: 'running', color: '#6366f1' },
  { id: 'analyst', name: 'Analyst', role: 'analyst', status: 'ready', color: '#3b82f6' },
  { id: 'planner', name: 'Planner', role: 'planning', status: 'ready', color: '#8b5cf6' },
  { id: 'dev', name: 'Developer', role: 'developer', status: 'idle', color: '#10b981' },
  { id: 'verifier', name: 'Verifier', role: 'verifier', status: 'idle', color: '#f59e0b' },
  { id: 'release', name: 'Release Agent', role: 'release-agent', status: 'idle', color: '#8b5cf6' },
];

const WORKFLOW_TYPES = [
  { id: 'feature', label: 'Feature', icon: '✨' },
  { id: 'fix', label: 'Bug Fix', icon: '🐛' },
  { id: 'refactor', label: 'Refactor', icon: '🔄' },
  { id: 'docs', label: 'Documentation', icon: '📝' },
  { id: 'infra', label: 'Infrastructure', icon: '⚙️' },
];

const BG_SERVICES = [
  { name: 'Indexing', status: 'running' as const },
  { name: 'Status Check', status: 'healthy' as const },
  { name: 'Log Rotation', status: 'idle' as const },
];

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
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
      <div className="w-full px-4 py-16 text-center text-(--vestara-text-muted) animate-pulse">
        Loading Operations Center...
      </div>
    );

  if (!sessions) return null;

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
          <span className={`w-3 h-3 rounded-full ${isListening ? 'bg-(--vestara-green) animate-pulse' : 'bg-zinc-600'}`} />
          <div>
            <h1 className="text-lg font-bold text-zinc-200">Ops Center</h1>
            <p className="text-[10px] text-(--vestara-text-muted)">
              {isListening ? 'Conversation agent listening' : 'System idle'} · {totalRegistered} agents registered
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowWorkflowModal(true)}
            className="text-xs px-3 py-1.5 bg-accent-600/10 border border-accent transition-colors cursor-pointer font-medium"
          >
            + New Workflow
          </button>
          <button
            onClick={load}
            className="text-xs px-2 py-1.5 bg-zinc-800 border border-zinc-800 text-(--vestara-text-muted) rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Refresh"
          >
            ↻
          </button>
        </div>
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
            <OpsExecutionsModal
              execution={selectedExecution}
              agents={agents}
              onClose={() => setSelectedExecution(null)}
              formatDuration={formatDuration}
            />
          )}
          {selectedEvent && (
            <OpsEventModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
          )}
          {showWorkflowModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowWorkflowModal(false)}>
              <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 w-full max-w-md mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-sm font-semibold text-zinc-200 mb-4">Start Workflow</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-(--vestara-text-2) block mb-1">Goal</label>
                    <input type="text" value={wfGoal} onChange={(e) => setWfGoal(e.target.value)} placeholder="Describe the workflow goal..." className="w-full bg-[var(--color-zinc-800)] border border-[var(--color-zinc-700)] text-[var(--color-zinc-300)] rounded-lg p-2 text-xs outline-none focus:border-[var(--vestara-accent)]" />
                  </div>
                  <div>
                    <label className="text-xs text-(--vestara-text-2) block mb-1">Type</label>
                    <select value={wfType} onChange={(e) => setWfType(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg p-2 text-xs outline-none">
                      {WORKFLOW_TYPES.map((t) => (
                        <option key={t.id} value={t.id}>{t.icon} {t.label}</option>
                      ))}
                    </select>
                  </div>
                  <button onClick={startWorkflow} disabled={!wfGoal.trim() || wfRunning} className="w-full px-4 py-2 bg-(--vestara-accent) text-white rounded-lg font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer">
                    {wfRunning ? 'Starting...' : 'Start Workflow'}
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-(--vestara-text-2) uppercase tracking-wider flex items-center gap-1.5">
              Activity Feed <span className="text-zinc-700 font-normal text-[10px]">({filteredEvents.length})</span>
            </h2>
            <div className="flex gap-1">
              {['all', 'system', 'conversation', 'agent'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setEventFilter(cat)}
                  className={`text-[9px] px-2 py-0.5 rounded transition-colors cursor-pointer ${eventFilter === cat ? 'bg-zinc-700 text-zinc-200 font-medium' : 'text-[var(--vestara-text-muted)] hover:text-[var(--vestara-text)]'}`}
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
                  <p className="text-[10px] text-zinc-700 mt-1">Events appear here as agents and the system process work</p>
                </div>
              )}
              {filteredEvents.slice(0, 80).map((e, i) => (
                <div
                  key={e.id || i}
                  onClick={() => setSelectedEvent(e)}
                  className="flex items-start gap-2.5 py-1.5 px-2 rounded-md transition-colors cursor-pointer hover:bg-zinc-800/30"
                >
                  <span className="text-[9px] text-zinc-700 font-mono shrink-0 w-12 pt-0.5">
                    {new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className={`shrink-0 pt-0.5 text-[10px] ${e.actor.type === 'agent' ? 'text-blue-400' : e.actor.type === 'user' ? 'text-(--vestara-accent)' : 'text-[var(--color-zinc-500)]'}`}>
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
  const statusColors: Record<string, string> = {
    completed: 'bg-[var(--vestara-green)]',
    running: 'bg-amber-400 animate-pulse',
    queued: 'bg-amber-400',
    failed: 'bg-[var(--vestara-red)]',
  };
  const display = showAllExecs ? executions : executions.slice(0, 15);

  return (
    <div className="bg-[var(--color-zinc-900)]/50 border border-[var(--color-zinc-800)] rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-[var(--vestara-text-muted)] uppercase tracking-wider">
          Executions ({executions.length})
        </h3>
        {executions.length > 15 && (
          <button onClick={() => setShowAllExecs(!showAllExecs)} className="text-[10px] text-[var(--vestara-accent-text)] hover:text-[var(--vestara-accent)] cursor-pointer">
            {showAllExecs ? 'Show Less' : `Show All (${executions.length})`}
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-(--vestara-text-muted) border-b border-zinc-800">
              <th className="text-left py-1.5 px-2 font-medium">Agent</th>
              <th className="text-left py-1.5 px-2 font-medium">Task</th>
              <th className="text-left py-1.5 px-2 font-medium">Started</th>
              <th className="text-left py-1.5 px-2 font-medium">Duration</th>
              <th className="text-left py-1.5 px-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {display.map((exec, i) => {
              const agent = agents.find((a) => a.id === exec.agentId || a.name.toLowerCase().includes(exec.agentId.split('-').pop()?.toLowerCase() || ''));
              const startDate = new Date(exec.startedAt);
              const duration = exec.completedAt
                ? formatDuration(
                    Math.round(
                      (new Date(exec.completedAt).getTime() - startDate.getTime()) / 1000,
                    ),
                  )
                : null;
              return (
                <tr
                  key={exec.id || i}
                  onClick={() => setSelectedExecution(exec)}
                  className="border-b border-[var(--color-zinc-800)/50] hover:bg-[var(--color-zinc-800)]/30 cursor-pointer transition-colors"
                >
                  <td className="py-1.5 px-2 text-[var(--color-zinc-300)]">{agent?.name || exec.agentId}</td>
                  <td className="py-1.5 px-2 text-[var(--color-zinc-300)] truncate max-w-xs">{exec.task}</td>
                  <td className="py-1.5 px-2 text-[var(--color-zinc-500)]">{startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="py-1.5 px-2 text-[var(--color-zinc-400)]">{duration || '--'}</td>
                  <td className="py-1.5 px-2">
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${statusColors[exec.status] || 'bg-[var(--color-zinc-700)]'}`}
                      title={exec.status}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}