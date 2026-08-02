import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { StatCard } from '../components/dashboard';
import SessionTimeline from '../components/SessionTimeline';
import WorkflowPipeline from '../components/WorkflowPipeline';
import { VestaraModal } from '../components/ui/VestaraModal';
import { HarnessThreadTimeline } from '../components/execution/harness-timeline';
import { WorkflowRail } from '../components/workflow/WorkflowRail';
import { threadIdFromSession } from '../lib/agent-harness';
import { workflowApi, type WorkflowProjection } from '../lib/workflow';

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

interface ExecutionSession {
  id: string;
  goal: string;
  status: string;
  workflowId?: string;
  createdAt: string;
  completedAt?: string;
  assignedAgentIds?: string[];
  planIds?: string[];
  changeSetIds?: string[];
  verificationIds?: string[];
  timeline?: Array<{
    agentId: string;
    step: string;
    status: string;
    startedAt?: string;
    completedAt?: string;
  }>;
  metrics?: {
    totalSteps: number;
    completedSteps: number;
    agentCount?: number;
    artifactCount?: number;
    duration?: number;
  };
}
const STATUS_DOT: Record<string, string> = {
  created: 'bg-zinc-600',
  planning: 'bg-blue-400',
  executing: 'bg-amber-400',
  verifying: 'bg-purple-400',
  reviewing: 'bg-cyan-400',
  completed: 'bg-green-500',
  failed: 'bg-red-400',
  running: 'bg-green-400',
  queued: 'bg-amber-400',
};
const STATUS_COLORS: Record<string, string> = {
  created: '#52525b',
  planning: '#60a5fa',
  executing: '#fbbf24',
  verifying: '#a78bfa',
  reviewing: '#22d3ee',
  completed: '#22c55e',
  failed: '#f87171',
  running: '#22c55e',
  queued: '#fbbf24',
};

function statusBadge(status: string): { bg: string; text: string } {
  if (status === 'completed') return { bg: 'bg-green-400/10', text: 'text-green-400' };
  if (status === 'failed') return { bg: 'bg-red-400/10', text: 'text-red-400' };
  if (status === 'running' || status === 'queued' || status === 'executing')
    return { bg: 'bg-amber-400/10', text: 'text-amber-400' };
  return { bg: 'bg-zinc-800', text: 'text-(--vestara-text-2)' };
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export default function SessionList() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [exSessions, setExSessions] = useState<ExecutionSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newObjective, setNewObjective] = useState('');
  const [showWorkflow, setShowWorkflow] = useState(false);
  const [wfGoal, setWfGoal] = useState('');
  const [wfFullscreen, setWfFullscreen] = useState(false);
  const [wfType, setWfType] = useState('feature');
  const [wfRunning, setWfRunning] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, ex] = await Promise.all([
        fetch('/api/sessions').then((r) => (r.ok ? r.json() : { sessions: [] })),
        fetch('/api/sessions/executions').then((r) => (r.ok ? r.json() : { sessions: [] })),
      ]);
      setSessions(s.sessions ?? []);
      setExSessions(ex.sessions ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    if (!newTitle.trim()) return;
    try {
      await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          objective: newObjective || newTitle,
        }),
      });
      setNewTitle('');
      setNewObjective('');
      setShowNew(false);
      load();
    } catch {}
  };

  const startWorkflow = async () => {
    if (!wfGoal.trim()) return;
    setWfRunning(true);
    try {
      await fetch('/api/sessions/executions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: wfGoal, workflow: wfType }),
      });
      setShowWorkflow(false);
      setWfGoal('');
      load();
    } catch {}
    setWfRunning(false);
  };

  const allItems = useMemo(() => {
    const items = [
      ...sessions.map((s) => ({ ...s, _type: 'session' as const })),
      ...exSessions.map((s) => ({
        ...s,
        _type: 'execution' as const,
        title: s.goal,
      })),
    ];
    items.sort((a, b) => new Date(b.createdAt || Date.now()).getTime() - new Date(a.createdAt || Date.now()).getTime());
    return items;
  }, [sessions, exSessions]);

  const filtered = useMemo(() => {
    let items = allItems;
    if (filter !== 'all')
      items = items.filter(
        (s) =>
          s.status === filter ||
          (filter === 'active' && (s.status === 'running' || s.status === 'queued' || s.status === 'executing')),
      );
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((s) => (s.title || s.goal || '').toLowerCase().includes(q));
    }
    return items;
  }, [allItems, filter, search]);

  const stats = useMemo(
    () => ({
      total: allItems.length,
      active: allItems.filter((s) => s.status === 'running' || s.status === 'queued' || s.status === 'executing')
        .length,
      completed: allItems.filter((s) => s.status === 'completed').length,
      failed: allItems.filter((s) => s.status === 'failed').length,
    }),
    [allItems],
  );

  const filterOptions = ['all', 'active', 'completed', 'failed'];

  if (loading)
    return <div className="w-full px-4 py-16 text-center text-[var(--vestara-text-muted)] animate-pulse">Loading sessions...</div>;

  return (
    <div className="w-full px-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-[var(--vestara-text)]">Sessions</h1>
          <p className="text-[10px] text-[var(--vestara-text-muted)] mt-0.5">
            {stats.total} total · {stats.active} active · {stats.completed} completed
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowWorkflow(true)}
            className="text-[10px] px-3 py-1.5 bg-amber-400/10 border border-amber-400/30 text-amber-400 rounded-lg cursor-pointer flex items-center gap-1 hover:bg-amber-400/20 transition-colors"
          >
            ▶ Start Workflow
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="text-[10px] px-3 py-1.5 accent-btn rounded-lg cursor-pointer flex items-center gap-1"
          >
            <span>+</span> New Session
          </button>
        </div>
      </div>

      {/* New session modal */}
      {showNew && (
        <VestaraModal onClose={() => setShowNew(false)} className="max-w-md">
          <div className="flex items-center justify-between p-4 border-b border-(--vestara-accent-border)">
            <h2 className="text-sm font-semibold text-[var(--vestara-text)] flex items-center gap-2">
              <span className="text-(--vestara-accent-text)">+</span> New Session
            </h2>
            <button onClick={() => setShowNew(false)} className="text-(--vestara-text-muted) hover:text-(--vestara-text-2) cursor-pointer text-sm">✕</button>
          </div>
          <div className="p-4 space-y-3">
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Session title*" autoFocus className="w-full bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg px-3 py-2 text-sm text-[var(--vestara-text)] placeholder:text-(--vestara-text-dim) outline-none focus:border-[var(--vestara-accent-border-active)]" onKeyDown={(e) => e.key === 'Enter' && create()} />
            <textarea value={newObjective} onChange={(e) => setNewObjective(e.target.value)} placeholder="Objective (optional)" rows={2} className="w-full bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg px-3 py-2 text-sm text-[var(--vestara-text)] placeholder:text-(--vestara-text-dim) outline-none focus:border-[var(--vestara-accent-border-active)] resize-none" />
          </div>
          <div className="flex gap-2 p-4 border-t border-(--vestara-accent-border)">
            <button onClick={create} disabled={!newTitle.trim()} className="flex-1 text-xs px-3 py-2 bg-[var(--vestara-accent)] text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer">Create</button>
            <button onClick={() => setShowNew(false)} className="text-xs px-3 py-2 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-lg hover:text-(--vestara-text) cursor-pointer transition-colors">Cancel</button>
          </div>
        </VestaraModal>
      )}

      {/* Workflow start modal */}
      {showWorkflow && (
        <VestaraModal onClose={() => setShowWorkflow(false)} className="max-w-md">
          <div className="flex items-center justify-between p-4 border-b border-(--vestara-accent-border)">
            <h2 className="text-sm font-semibold text-[var(--vestara-text)] flex items-center gap-2">
              <span className="text-amber-400">▶</span> Start Workflow
            </h2>
            <button onClick={() => setShowWorkflow(false)} className="text-(--vestara-text-muted) hover:text-(--vestara-text-2) cursor-pointer text-sm">✕</button>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <label className="text-[9px] text-[var(--vestara-text-muted)] uppercase tracking-widest mb-1.5 block font-medium">Goal</label>
              <input value={wfGoal} onChange={(e) => setWfGoal(e.target.value)} placeholder="Describe the workflow goal..." autoFocus className="w-full bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg px-3 py-2 text-sm text-[var(--vestara-text)] placeholder:text-(--vestara-text-dim) outline-none focus:border-[var(--vestara-accent-border-active)]" />
            </div>
            <div>
              <label className="text-[9px] text-[var(--vestara-text-muted)] uppercase tracking-widest mb-1.5 block font-medium">Type</label>
              <select value={wfType} onChange={(e) => setWfType(e.target.value)} className="w-full bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg px-3 py-2 text-sm text-[var(--vestara-text)] outline-none focus:border-[var(--vestara-accent-border-active)] cursor-pointer">
                <option value="feature">Feature</option>
                <option value="analyze">Analysis</option>
                <option value="document">Documentation</option>
                <option value="refactor">Refactor</option>
                <option value="release">Release</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 p-4 border-t border-(--vestara-accent-border)">
            <button onClick={startWorkflow} disabled={!wfGoal.trim() || wfRunning} className="flex-1 text-xs px-3 py-2 bg-amber-400/10 border border-amber-400/30 text-amber-400 rounded-lg disabled:opacity-30 cursor-pointer hover:bg-amber-400/20 transition-colors font-medium">{wfRunning ? 'Starting...' : 'Start Workflow'}</button>
            <button onClick={() => setShowWorkflow(false)} className="text-xs px-3 py-2 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-lg hover:text-(--vestara-text) cursor-pointer transition-colors">Cancel</button>
          </div>
        </VestaraModal>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <StatCard label="Total Sessions" value={stats.total} accent="#8b5cf6" />
        <StatCard label="Completed" value={stats.completed} accent="#10b981" />
        <StatCard label="Active" value={stats.active} sub={stats.active > 0 ? 'Running' : undefined} accent="#f59e0b" />
        <StatCard label="Failed" value={stats.failed} accent={stats.failed > 0 ? '#ef4444' : '#52525b'} />
      </div>

      {/* Search + Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-45 max-w-xs">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-(--vestara-text-dim) text-[11px]">🔍</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sessions..."
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-7 pr-2 py-1.5 text-xs text-(--vestara-text) placeholder-zinc-700 outline-none"
          />
        </div>
        <div className="flex items-center gap-1">
          {filterOptions.map((f) => {
            const count = f === 'all' ? allItems.length : (stats[f as keyof typeof stats] as number);
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-[10px] px-2.5 py-1 rounded-md cursor-pointer transition-colors ${filter === f ? 'bg-zinc-700 text-zinc-200 font-medium' : 'text-(--vestara-text-2) hover:text-(--vestara-text) hover:bg-zinc-800'}`}
              >
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                <span className={`ml-1 text-[8px] ${filter === f ? 'text-(--vestara-text-2)' : 'text-(--vestara-text-dim)'}`}>{count}</span>
              </button>
            );
          })}
        </div>
        <span className="text-[10px] text-(--vestara-text-dim) ml-auto">
          {filtered.length} of {allItems.length}
        </span>
        <button onClick={load} className="text-(--vestara-text-muted) hover:text-(--vestara-text-2) cursor-pointer text-sm" title="Refresh">
          ↻
        </button>
      </div>

      {/* List */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-14 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg text-center">
          <div className="text-2xl mb-2 opacity-20">◈</div>
          <p className="text-sm text-[var(--vestara-text-muted)] mb-1">No sessions found</p>
          <p className="text-[10px] text-(--vestara-text-dim)">Create a new session to begin, or adjust your search filters</p>
          <button onClick={() => setShowNew(true)} className="mt-4 text-xs px-4 py-2 bg-[var(--vestara-accent)] text-white rounded-lg hover:opacity-90 transition-opacity cursor-pointer">+ New Session</button>
        </div>
      )}
      <div className="space-y-1.5">
        {filtered.map((s) => {
          const borderColor = STATUS_COLORS[s.status] || '#52525b';
          const isExecution = s._type === 'execution';
          const agentCount = s.assignedAgentIds?.length || s.timeline?.length || 0;
          const stepCount = s.metrics ? `${s.metrics.completedSteps}/${s.metrics.totalSteps}` : null;
          const badge = statusBadge(s.status);
          return (
            <Link
              key={`${s._type}-${s.id}`}
              to={`/sessions/${s.id}`}
              className="block bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg hover:border-(--vestara-accent-border-hover) transition-colors border-l-[3px]"
              style={{ borderLeftColor: borderColor }}
            >
              <div className="p-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold text-[var(--vestara-text)] truncate">{s.title || s.goal || s.id}</span>
                    {isExecution && (
                      <span className="text-[8px] px-1.5 py-0.5 rounded bg-blue-400/10 text-blue-400 uppercase font-medium shrink-0">
                        Workflow
                      </span>
                    )}
                    <span className={`text-[8px] px-1.5 py-0.5 rounded uppercase font-medium shrink-0 ${badge.bg} ${badge.text}`}>{s.status}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[9px] text-(--vestara-text-muted) flex-wrap">
                    {agentCount > 0 && <span>{agentCount} agent{agentCount > 1 ? 's' : ''}</span>}
                    {stepCount && (<><span className="text-(--vestara-text-dim)">·</span><span>{stepCount} steps</span></>)}
                    {s.createdAt && (<><span className="text-(--vestara-text-dim)">·</span><span>{formatRelativeTime(s.createdAt)}</span></>)}
                    {s.metrics?.duration && (<><span className="text-(--vestara-text-dim)">·</span><span>{formatDuration(Math.round(s.metrics.duration / 1000))}</span></>)}
                  </div>
                </div>
                <span className="text-(--vestara-text-dim) shrink-0 text-[10px]">→</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function SessionView() {
  const { id } = useParams();
  const [session, setSession] = useState<any | null>(null);
  const [exSession, setExSession] = useState<ExecutionSession | null>(null);
  const [agents, setAgents] = useState<Array<{ id: string; name: string; role: string; color?: string }>>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [workflow, setWorkflow] = useState<WorkflowProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const harnessThreadId = exSession ? threadIdFromSession(exSession.workflowId) : null;

  const loadWorkflow = useCallback(async (threadId: string) => {
    const data = await workflowApi.workflow(threadId);
    if (data?.projection) setWorkflow(data.projection);
  }, []);

  useEffect(() => {
    if (harnessThreadId) void loadWorkflow(harnessThreadId);
    else setWorkflow(null);
  }, [harnessThreadId, loadWorkflow, reloadKey]);

  useEffect(() => {
    const load = async () => {
      try {
        const [sessionData, exsData, agentsData, approvalsData] = await Promise.all([
          fetch(`/api/sessions/${id || 'current'}`)
            .then((r) => r.json())
            .catch(() => ({ session: null })),
          fetch('/api/sessions/executions')
            .then((r) => r.json())
            .catch(() => ({ sessions: [] })),
          fetch('/api/agents')
            .then((r) => r.json())
            .catch(() => ({ agents: [] })),
          fetch('/api/approvals')
            .then((r) => r.json())
            .catch(() => ({ approvals: [] })),
        ]);
        setSession(sessionData.session);
        const sessions = exsData.sessions || [];
        setExSession(sessions.find((s: any) => s.id === id) || sessions[0] || null);
        setAgents(agentsData.agents ?? []);
        setApprovals(approvalsData.approvals ?? []);
      } catch {}
      setLoading(false);
    };
    load();
  }, [id]);

  const display = exSession || session;
  const agentMap = useMemo(() => {
    const map: Record<string, { name: string; color: string }> = {};
    for (const a of agents) {
      map[a.id] = { name: a.name, color: a.color || '#6b7280' };
      map[a.role] = { name: a.name, color: a.color || '#6b7280' };
    }
    return map;
  }, [agents]);

  if (loading)
    return (
      <div className="w-full px-4 py-16 animate-pulse">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-3 w-3 rounded-full bg-zinc-800" />
          <div className="h-6 w-48 bg-zinc-800 rounded" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="h-8 w-64 bg-zinc-800 rounded" />
            <div className="h-4 w-96 bg-zinc-800 rounded" />
            <div className="h-32 bg-zinc-800/50 rounded-lg" />
            <div className="h-24 bg-zinc-800/50 rounded-lg" />
          </div>
          <div className="space-y-4">
            <div className="h-48 bg-zinc-800/50 rounded-lg" />
            <div className="h-32 bg-zinc-800/50 rounded-lg" />
          </div>
        </div>
      </div>
    );
  if (!display) return <div className="w-full px-4 py-16 text-center text-[var(--vestara-text-muted)]">Session not found</div>;

  const agentList = (display.timeline || []).map((t: any) => ({
    ...t,
    agentName: agentMap[t.agentId]?.name || t.agentId,
    agentColor: agentMap[t.agentId]?.color || '#6b7280',
  }));
  const uniqueAgents = [...new Map(agentList.map((t: any) => [t.agentId, t])).values()];
  const badge = statusBadge(display.status);

  return (
    <div className="w-full px-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-[var(--vestara-text-muted)] mb-4">
        <Link to="/sessions" className="hover:text-(--vestara-text-2) transition-colors">Sessions</Link>
        <span className="text-zinc-800">/</span>
        <span className="text-[var(--vestara-text)] font-medium truncate">{display.goal || display.title || display.id}</span>
      </div>

      <WorkflowPipeline session={display} />

      {harnessThreadId && (
        <div className="mb-5">
          <WorkflowRail workflow={workflow} onRefresh={() => setReloadKey((key) => key + 1)} />
          <div className="mt-3">
            <HarnessThreadTimeline threadId={harnessThreadId} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          {/* Header + Status */}
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-bold text-(--vestara-text)">{display.goal || session?.title || 'Session'}</h1>
              <span className={`text-[9px] px-2 py-0.5 rounded uppercase font-medium ${badge.bg} ${badge.text}`}>
                {display.status}
              </span>
            </div>
            {session?.objective && <p className="text-xs text-(--vestara-text-2)">{session.objective}</p>}
          </div>

          {/* Progress card */}
          <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-4">
            <h3 className="text-[9px] font-semibold text-(--vestara-text-muted) uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <span className="w-1 h-3.5 rounded-full bg-blue-500/60 shrink-0" /> Progress
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-(--vestara-text-muted) block text-[9px]">Created</span>
                <span className="text-(--vestara-text)">{new Date(display.createdAt).toLocaleDateString()}</span>
              </div>
              {display.completedAt && (
                <div>
                  <span className="text-(--vestara-text-muted) block text-[9px]">Completed</span>
                  <span className="text-(--vestara-text)">{new Date(display.completedAt).toLocaleDateString()}</span>
                </div>
              )}
              {display.workflowId && (
                <div>
                  <span className="text-(--vestara-text-muted) block text-[9px]">Workflow</span>
                  <span className="text-(--vestara-text) font-mono text-[10px] truncate">{display.workflowId}</span>
                </div>
              )}
              {display.metrics && (
                <div>
                  <span className="text-(--vestara-text-muted) block text-[9px]">Steps</span>
                  <span className="text-(--vestara-text)">
                    {display.metrics.completedSteps}/{display.metrics.totalSteps}
                  </span>
                </div>
              )}
            </div>
            {display.metrics && display.metrics.totalSteps > 0 && (
              <div className="mt-3 w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: `${Math.round((display.metrics.completedSteps / display.metrics.totalSteps) * 100)}%`,
                    backgroundColor: 'var(--vestara-accent)',
                  }}
                />
              </div>
            )}
          </div>

          {/* Agents */}
          {uniqueAgents.length > 0 && (
            <div>
              <h2 className="text-[9px] font-semibold text-(--vestara-text-muted) uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <span className="w-1 h-3.5 rounded-full bg-amber-500/60 shrink-0" /> Agents ({uniqueAgents.length})
              </h2>
              <div className="space-y-1">
                {uniqueAgents.map((t: any, i: number) => (
                  <div
                    key={i}
                    className="p-2.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg flex items-center gap-2.5 border-l-[3px]"
                    style={{ borderLeftColor: t.agentColor }}
                  >
                    <span className="text-xs text-(--vestara-text) flex-1 truncate font-medium">{t.agentName}</span>
                    <span className="text-[8px] px-1.5 py-0.5 rounded bg-zinc-800 text-(--vestara-text-2) uppercase font-medium">
                      {t.step || t.agentId}
                    </span>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-medium ${
                        t.status === 'completed'
                          ? 'bg-green-400/10 text-green-400'
                          : t.status === 'running'
                            ? 'bg-amber-400/10 text-amber-400'
                            : t.status === 'failed'
                              ? 'bg-red-400/10 text-red-400'
                              : 'bg-zinc-800 text-(--vestara-text-2)'
                      }`}
                    >
                      {t.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timeline */}
          <div>
            <h2 className="text-[9px] font-semibold text-(--vestara-text-muted) uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span className="w-1 h-3.5 rounded-full bg-cyan-500/60 shrink-0" /> Timeline
            </h2>
            <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-3">
              <SessionTimeline session={display} />
            </div>
          </div>

          {/* Approvals */}
          {(() => {
            const sessionApprovals = approvals.filter(
              (a: any) => a.sessionId === id || a.planId === display.planIds?.[0],
            );
            if (sessionApprovals.length === 0) return null;
            return (
              <div>
                <h2 className="text-[9px] font-semibold text-(--vestara-text-muted) uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <span className="w-1 h-3.5 rounded-full bg-purple-500/60 shrink-0" /> Approvals (
                  {sessionApprovals.length})
                </h2>
                <div className="space-y-1">
                  {sessionApprovals.map((a: any, i: number) => (
                    <div
                      key={a.id || i}
                      className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg flex items-center gap-3 border-l-[3px]"
                      style={{
                        borderLeftColor:
                          a.status === 'approved' ? '#10b981' : a.status === 'rejected' ? '#ef4444' : '#f59e0b',
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-(--vestara-text) truncate font-medium">
                          {a.title || a.changeSetId || a.planId}
                        </div>
                        <div className="text-[9px] text-(--vestara-text-muted)">
                          {a.status} · {new Date(a.createdAt || Date.now()).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Sidebar */}
        <div className="space-y-3">
          {/* Artifact counts */}
          {(display.planIds?.length > 0 || display.changeSetIds?.length > 0 || display.verificationIds?.length > 0) && (
            <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-3">
              <h3 className="text-[9px] font-semibold text-(--vestara-text-muted) uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <span className="w-1 h-3 rounded-full bg-blue-500/60" /> Artifacts
              </h3>
              <div className="space-y-1.5">
                {display.planIds?.length > 0 && (
                  <div className="p-2.5 bg-zinc-800/40 border border-zinc-700/50 rounded-lg text-xs flex items-center gap-2">
                    <span className="text-accent">△</span> {display.planIds.length} plans
                  </div>
                )}
                {display.changeSetIds?.length > 0 && (
                  <div className="p-2.5 bg-zinc-800/40 border border-zinc-700/50 rounded-lg text-xs flex items-center gap-2">
                    <span className="text-cyan-400">◇</span> {display.changeSetIds.length} change sets
                  </div>
                )}
                {display.verificationIds?.length > 0 && (
                  <div className="p-2.5 bg-zinc-800/40 border border-zinc-700/50 rounded-lg text-xs flex items-center gap-2">
                    <span className="text-green-400">✓</span> {display.verificationIds.length} verifications
                  </div>
                )}
              </div>
            </div>
          )}
          {/* Metrics */}
          {display.metrics && (
            <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-3">
              <h3 className="text-[9px] font-semibold text-(--vestara-text-muted) uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <span className="w-1 h-3 rounded-full bg-green-500/60" /> Metrics
              </h3>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-(--vestara-text-muted)">Steps</span>
                  <span className="text-(--vestara-text) font-medium">
                    {display.metrics.completedSteps}/{display.metrics.totalSteps}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-(--vestara-text-muted)">Agents</span>
                  <span className="text-(--vestara-text) font-medium">{display.metrics.agentCount || uniqueAgents.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-(--vestara-text-muted)">Artifacts</span>
                  <span className="text-(--vestara-text) font-medium">{display.metrics.artifactCount || 0}</span>
                </div>
                {display.metrics.duration && (
                  <div className="flex items-center justify-between">
                    <span className="text-(--vestara-text-muted)">Duration</span>
                    <span className="text-(--vestara-text) font-medium">
                      {formatDuration(Math.round(display.metrics.duration / 1000))}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
          {/* Participants */}
          {session?.participants && session.participants.length > 0 && (
            <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-3">
              <h3 className="text-[9px] font-semibold text-(--vestara-text-muted) uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <span className="w-1 h-3 rounded-full bg-purple-500/60" /> Participants
              </h3>
              <div className="space-y-1">
                {session.participants.map((p: any, i: number) => (
                  <div key={i} className="text-xs text-(--vestara-text-2) flex items-center gap-2 py-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0" />
                    <span className="truncate text-(--vestara-text)">{p.id}</span>
                    <span className="text-(--vestara-text-dim)">({p.role})</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Info */}
          <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-3">
            <h3 className="text-[9px] font-semibold text-(--vestara-text-muted) uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span className="w-1 h-3 rounded-full bg-zinc-500/60" /> Info
            </h3>
            <div className="space-y-1.5 text-[11px] text-(--vestara-text-muted)">
              <div className="flex items-center justify-between">
                <span>ID</span>
                <span className="text-(--vestara-text-2) font-mono text-[9px]">{display.id.slice(0, 16)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Source</span>
                <span className="text-(--vestara-text-2)">{exSession ? 'Workflow' : 'Session'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Status</span>
                <span className={`font-medium ${badge.text}`}>{display.status}</span>
              </div>
              {display.workflowId && (
                <div className="flex items-center justify-between">
                  <span>Workflow</span>
                  <span className="text-(--vestara-text-2) text-[9px] font-mono">{display.workflowId.slice(0, 16)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
