import { useCallback, useEffect, useMemo, useState } from 'react';
import OpsEventModal from '../components/ops/OpsEventModal';
import OpsExecutionsModal from '../components/ops/OpsExecutionsModal';
import StatCard from '../components/dashboard/StatCard';
import AgentTelemetryCard from '../components/ops/AgentTelemetryCard';
import { useEventStream } from '../lib/useEventStream';
import { useTelemetryStore } from '../contexts/TelemetryContext';
import { workspaceSocket } from '../lib/ws';
import ExecutionsList from '../components/activities/ExecutionsList';
import ActivityFeed from '../components/activities/ActivityFeed';
import { ExecutionPieChart } from './OpsCenter/charts/ExecutionPieChart';
import { AgentBarChart } from './OpsCenter/charts/AgentBarChart';
import { ActivitySparkline } from './OpsCenter/charts/ActivitySparkline';
import { SuccessGauge } from './OpsCenter/charts/SuccessGauge';
import { BackgroundServiceCard } from './OpsCenter/charts/BackgroundServiceCard';
import { EventsCategoryChart } from './OpsCenter/charts/EventsCategoryChart';
import PipelinePanel from './OpsCenter/PipelinePanel';

export interface Agent {
  id: string; name: string; role: string; status: string;
  description?: string; provider?: string; model?: string; color?: string;
}

export interface Execution {
  id: string; agentId: string; task: string; status: string;
  startedAt: string; completedAt?: string; result?: string;
}

const ROLE_COLORS: Record<string, string> = {
  conversation: '#6366f1', 'planning-agent': '#3b82f6', 'implementation-agent': '#10b981',
  verification: '#f59e0b', 'release-agent': '#8b5cf6',
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export default function OpsCenter() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [eventFilter, setEventFilter] = useState<string>('all');
  const [bgRunning, setBgRunning] = useState(false);
  const [bgObservations, setBgObservations] = useState(0);
  const [wfRunning, setWfRunning] = useState(false);
  const [showWorkflowModal, setShowWorkflowModal] = useState(false);
  const [wfGoal, setWfGoal] = useState('');
  const [wfType, setWfType] = useState('feature');
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [executionsPage, setExecutionsPage] = useState(1);
  const [feedPage, setFeedPage] = useState(1);
  const [agentsPage, setAgentsPage] = useState(1);
  const EXECUTIONS_PAGE_SIZE = 10;
  const FEED_PAGE_SIZE = 20;
  const AGENTS_PAGE_SIZE = 8;
  const [selectedExecution, setSelectedExecution] = useState<Execution | null>(null);
  const { connected, events, loading: eventsLoading } = useEventStream();
  const telemetry = useTelemetryStore();

  const load = useCallback(async () => {
    try {
      const [a, e] = await Promise.all([
        fetch('/api/agents').then((r) => r.ok ? r.json() : { agents: [], executions: [] }),
        fetch('/api/sessions/executions').then((r) => r.ok ? r.json() : { sessions: [] }),
      ]);
      setAgents(a.agents ?? []);
      setExecutions(a.executions ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const off = workspaceSocket.onEvent((evt) => {
      if (evt.type.startsWith('agent.') || evt.type === 'system.heartbeat') load();
    });
    return off;
  }, [load]);

  const agentStatuses = useMemo(() =>
    agents.map((a) => {
      const execs = executions.filter((e) => e.agentId === a.id || a.name.toLowerCase().includes(e.agentId.split('-').pop()?.toLowerCase() || ''));
      const latest = execs.length > 0 ? execs[0] : null;
      return { ...a, isRunning: latest?.status === 'running' || latest?.status === 'queued', lastTask: latest?.task, execCount: execs.length, lastStatus: latest?.status };
    }), [agents, executions]);

  const execStats = useMemo(() => {
    const finished = executions.filter((e) => e.status !== 'running' && e.status !== 'queued');
    return {
      total: executions.length,
      completed: executions.filter((e) => e.status === 'completed').length,
      failed: executions.filter((e) => e.status === 'failed').length,
      running: executions.filter((e) => e.status === 'running' || e.status === 'queued').length,
      successRate: finished.length > 0 ? Math.round((executions.filter((e) => e.status === 'completed').length / finished.length) * 100) : 0,
    };
  }, [executions]);

  const filteredEvents = useMemo(() => {
    if (eventFilter === 'all') return events;
    return events.filter((e) => e.category === eventFilter);
  }, [events, eventFilter]);

  const conversationAgent = agentStatuses.find((a) => a.role === 'conversation');
  const isListening = conversationAgent?.isRunning || events.some((e) => e.type === 'conversation.listening');

  const runBackground = async () => {
    setBgRunning(true);
    try { await fetch('/api/background/run', { method: 'POST' }); setBgObservations((o) => o + 4); setTimeout(() => load(), 1500); } catch {}
    setTimeout(() => setBgRunning(false), 2000);
  };

  const startWorkflow = async () => {
    if (!wfGoal.trim()) return;
    setWfRunning(true);
    try {
      await fetch('/api/sessions/executions/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goal: wfGoal, workflowType: wfType }) });
      setShowWorkflowModal(false); setWfGoal(''); setTimeout(() => load(), 1000);
    } catch {}
    setWfRunning(false);
  };

  if (loading)
    return <div className="w-full py-16 text-center text-(--vestara-text-muted) animate-pulse">Loading Operations Center...</div>;

  const activeAgentCount = agentStatuses.filter((a) => a.isRunning).length;
  const totalRegistered = agents.length;

  const pipelineStages = [
    { stage: 'Input', status: isListening, agents: conversationAgent ? 1 : 0 },
    { stage: 'Analyze', status: false, agents: 0 },
    { stage: 'Plan', status: false, agents: 0 },
    { stage: 'Implement', status: false, agents: 0 },
    { stage: 'Verify', status: false, agents: 0 },
    { stage: 'Release', status: false, agents: 0 },
  ];

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className={`w-3 h-3 rounded-full ${isListening ? 'bg-(--vestara-green) animate-pulse' : 'bg-(--vestara-text-dim)'}`} />
          <div>
            <h1 className="text-lg font-bold text-(--vestara-text)">Ops Center</h1>
            <p className="text-[10px] text-(--vestara-text-muted)">
              {isListening ? 'Conversation agent listening' : 'System idle'} · {totalRegistered} agents registered
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowWorkflowModal(true)}
            className="text-xs px-3 py-1.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-accent) rounded-lg hover:bg-(--vestara-accent-bg) transition-colors cursor-pointer font-medium">+ New Workflow</button>
          <button onClick={load} className="text-xs px-2 py-1.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-lg hover:bg-(--vestara-accent-bg) transition-colors cursor-pointer" title="Refresh">↻</button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="Executions" value={execStats.total} accent="#8b5cf6" sub={execStats.running > 0 ? `${execStats.running} running` : undefined} />
        <StatCard label="Completed" value={execStats.completed} accent="#10b981" />
        <StatCard label="Failed" value={execStats.failed} accent={execStats.failed > 0 ? '#ef4444' : '#52525b'} />
        <StatCard label="Success Rate" value={execStats.total > 0 ? `${execStats.successRate}%` : '--'} accent="#3b82f6" />
        <StatCard label="Live Agents" value={telemetry.agents.filter((a) => a.status !== 'idle' && a.status !== 'completed').length} accent="#10b981" sub={`${telemetry.agents.length} total`} />
        <StatCard label="Telemetry Events" value={telemetry.eventCount} accent="#6366f1" sub="real-time" />
      </div>

      {/* Row 2: 2-column layout — equal height */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4" style={{ minHeight: 'calc(100vh - 16rem)' }}>
        {/* Left main content: Charts grid + Activity + Executions */}
        <div className="flex flex-col gap-4">
          {/* 4-column charts row (3 recharts + background service) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
            <ExecutionPieChart completed={execStats.completed} failed={execStats.failed} running={execStats.running} />
            <SuccessGauge rate={execStats.successRate} total={execStats.total} />
            <AgentBarChart agents={agents} executions={executions} />
            <BackgroundServiceCard bgRunning={bgRunning} bgObservations={bgObservations} onRunBackground={runBackground} />
          </div>

          {/* Executions */}
          <ExecutionsList
            executions={executions} agents={agents} formatDuration={formatDuration}
            onSelect={setSelectedExecution} page={executionsPage} pageSize={EXECUTIONS_PAGE_SIZE}
            onPageChange={setExecutionsPage}
          />

          {/* Activity Feed */}
          <ActivityFeed
            events={events}
            filter={eventFilter}
            page={feedPage}
            pageSize={FEED_PAGE_SIZE}
            maxHeight="40vh"
            onFilterChange={setEventFilter}
            onSelect={setSelectedEvent}
            onPageChange={setFeedPage}
            loading={eventsLoading}
          />
        </div>

        {/* Right sidebar: Pipeline + Live Agents */}
        <div className="flex flex-col gap-4">
          <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-4">
            <h3 className="text-xs font-semibold text-(--vestara-text-muted) uppercase tracking-wider mb-3">Pipeline</h3>
            <PipelinePanel stages={pipelineStages} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-(--vestara-text-muted) uppercase tracking-wider">Live Agents</h3>
              <span className="text-[9px] text-(--vestara-text-dim)">
                {telemetry.eventCount} events
              </span>
            </div>
            <div className="space-y-2">
              {telemetry.agents.map((a) => (
                <AgentTelemetryCard key={a.id} agentId={a.id} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {selectedExecution && <OpsExecutionsModal execution={selectedExecution} agents={agents} onClose={() => setSelectedExecution(null)} formatDuration={formatDuration} />}
      {selectedEvent && <OpsEventModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />}

      {showWorkflowModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowWorkflowModal(false)}>
          <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-xl p-5 w-full max-w-md mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Enter' && wfGoal.trim()) startWorkflow(); if (e.key === 'Escape') setShowWorkflowModal(false); }}>
            <h3 className="text-sm font-semibold text-(--vestara-text) mb-4">Start Workflow</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-(--vestara-text-2) block mb-1">Goal</label>
                <input type="text" value={wfGoal} onChange={(e) => setWfGoal(e.target.value)} placeholder="Describe the workflow goal..." autoFocus
                  className="w-full bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text) rounded-lg p-2 text-xs outline-none focus:border-(--vestara-accent) placeholder-(--vestara-text-dim)" />
              </div>
              <div>
                <label className="text-xs text-(--vestara-text-2) block mb-1">Type</label>
                <select value={wfType} onChange={(e) => setWfType(e.target.value)}
                  className="w-full bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text) rounded-lg p-2 text-xs outline-none focus:border-(--vestara-accent)">
                  {[{id:'feature',label:'Feature',icon:'✨'},{id:'analyze',label:'Analysis',icon:'🔍'},{id:'document',label:'Documentation',icon:'📝'},{id:'refactor',label:'Refactor',icon:'🔄'},{id:'release',label:'Release',icon:'📦'}].map((t) => (<option key={t.id} value={t.id}>{t.icon} {t.label}</option>))}
                </select>
              </div>
              <button onClick={startWorkflow} disabled={!wfGoal.trim() || wfRunning}
                className="w-full px-4 py-2 bg-(--vestara-accent) text-white rounded-lg font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer">
                {wfRunning ? 'Starting...' : 'Start Workflow'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
