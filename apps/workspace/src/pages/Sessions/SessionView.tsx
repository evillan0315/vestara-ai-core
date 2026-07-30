import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import SessionTimeline from '../../components/SessionTimeline';
import WorkflowPipeline from '../../components/WorkflowPipeline';
import type { ExecutionSession } from './types';
import { statusBadge } from './constants';

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export default function SessionView() {
  const { id } = useParams();
  const [session, setSession] = useState<any | null>(null);
  const [exSession, setExSession] = useState<ExecutionSession | null>(null);
  const [agents, setAgents] = useState<Array<{ id: string; name: string; role: string; color?: string }>>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [sessionData, exsData, agentsData, approvalsData] = await Promise.all([
          fetch(`/api/sessions/${id || 'current'}`).then((r) => r.json()).catch(() => ({ session: null })),
          fetch('/api/sessions/executions').then((r) => r.json()).catch(() => ({ sessions: [] })),
          fetch('/api/agents').then((r) => r.json()).catch(() => ({ agents: [] })),
          fetch('/api/approvals').then((r) => r.json()).catch(() => ({ approvals: [] })),
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="md:col-span-1 lg:col-span-2 space-y-4">
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
  if (!display) return <div className="w-full px-4 py-16 text-center text-zinc-600">Session not found</div>;

  const agentList = (display.timeline || []).map((t: any) => ({
    ...t,
    agentName: agentMap[t.agentId]?.name || t.agentId,
    agentColor: agentMap[t.agentId]?.color || '#6b7280',
  }));
  const uniqueAgents = [...new Map(agentList.map((t: any) => [t.agentId, t])).values()];
  const badge = statusBadge(display.status);

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 text-xs text-zinc-600 mb-4">
        <Link to="/sessions" className="hover:text-zinc-400 transition-colors">Sessions</Link>
        <span className="text-zinc-800">/</span>
        <span className="text-zinc-300 font-medium truncate">{display.goal || display.title || display.id}</span>
      </div>

      <WorkflowPipeline session={display} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="md:col-span-1 lg:col-span-2 space-y-5">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-bold text-(--vestara-text)">{display.goal || session?.title || 'Session'}</h1>
              <span className={`text-[9px] px-2 py-0.5 rounded uppercase font-medium ${badge.bg} ${badge.text}`}>{display.status}</span>
            </div>
            {session?.objective && <p className="text-xs text-(--vestara-text-2)">{session.objective}</p>}
          </div>

          <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-4">
            <h3 className="text-[9px] font-semibold text-zinc-600 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <span className="w-1 h-3.5 rounded-full bg-blue-500/60 shrink-0" /> Progress
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-zinc-600 block text-[9px]">Created</span>
                <span className="text-zinc-300">{new Date(display.createdAt).toLocaleDateString()}</span>
              </div>
              {display.completedAt && (<div><span className="text-zinc-600 block text-[9px]">Completed</span><span className="text-zinc-300">{new Date(display.completedAt).toLocaleDateString()}</span></div>)}
              {display.workflowId && (<div><span className="text-zinc-600 block text-[9px]">Workflow</span><span className="text-zinc-300 font-mono text-[10px] truncate">{display.workflowId}</span></div>)}
              {display.metrics && (<div><span className="text-zinc-600 block text-[9px]">Steps</span><span className="text-zinc-300">{display.metrics.completedSteps}/{display.metrics.totalSteps}</span></div>)}
            </div>
            {display.metrics && display.metrics.totalSteps > 0 && (
              <div className="mt-3 w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.round((display.metrics.completedSteps / display.metrics.totalSteps) * 100)}%`, backgroundColor: 'var(--vestara-accent)' }} />
              </div>
            )}
          </div>

          {uniqueAgents.length > 0 && (
            <div>
              <h2 className="text-[9px] font-semibold text-zinc-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <span className="w-1 h-3.5 rounded-full bg-amber-500/60 shrink-0" /> Agents ({uniqueAgents.length})
              </h2>
              <div className="space-y-1">
                {uniqueAgents.map((t: any, i: number) => (
                  <div key={i} className="p-2.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg flex items-center gap-2.5 border-l-[3px]" style={{ borderLeftColor: t.agentColor }}>
                    <span className="text-xs text-zinc-300 flex-1 truncate font-medium">{t.agentName}</span>
                    <span className="text-[8px] px-1.5 py-0.5 rounded bg-zinc-800 text-(--vestara-text-muted) uppercase font-medium">{t.step || t.agentId}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-medium ${t.status === 'completed' ? 'bg-green-400/10 text-green-400' : t.status === 'running' ? 'bg-amber-400/10 text-amber-400' : t.status === 'failed' ? 'bg-red-400/10 text-red-400' : 'bg-zinc-800 text-(--vestara-text-muted)'}`}>{t.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h2 className="text-[9px] font-semibold text-zinc-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span className="w-1 h-3.5 rounded-full bg-cyan-500/60 shrink-0" /> Timeline
            </h2>
            <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-3">
              <SessionTimeline session={display} />
            </div>
          </div>

          {(() => {
            const sessionApprovals = approvals.filter((a: any) => a.sessionId === id || a.planId === display.planIds?.[0]);
            if (sessionApprovals.length === 0) return null;
            return (
              <div>
                <h2 className="text-[9px] font-semibold text-zinc-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <span className="w-1 h-3.5 rounded-full bg-purple-500/60 shrink-0" /> Approvals ({sessionApprovals.length})
                </h2>
                <div className="space-y-1">
                  {sessionApprovals.map((a: any, i: number) => (
                    <div key={a.id || i} className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg flex items-center gap-3 border-l-[3px]" style={{ borderLeftColor: a.status === 'approved' ? '#10b981' : a.status === 'rejected' ? '#ef4444' : '#f59e0b' }}>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-zinc-300 truncate font-medium">{a.title || a.changeSetId || a.planId}</div>
                        <div className="text-[9px] text-zinc-600">{a.status} · {new Date(a.createdAt || Date.now()).toLocaleDateString()}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        <div className="space-y-3">
          {(display.planIds?.length > 0 || display.changeSetIds?.length > 0 || display.verificationIds?.length > 0) && (
            <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-3">
              <h3 className="text-[9px] font-semibold text-zinc-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <span className="w-1 h-3 rounded-full bg-blue-500/60" /> Artifacts
              </h3>
              <div className="space-y-1.5">
                {display.planIds?.length > 0 && <div className="p-2.5 bg-zinc-800/40 border border-(--vestara-accent-border)/50 rounded-lg text-xs flex items-center gap-2"><span className="text-accent">△</span> {display.planIds.length} plans</div>}
                {display.changeSetIds?.length > 0 && <div className="p-2.5 bg-zinc-800/40 border border-(--vestara-accent-border)/50 rounded-lg text-xs flex items-center gap-2"><span className="text-cyan-400">◇</span> {display.changeSetIds.length} change sets</div>}
                {display.verificationIds?.length > 0 && <div className="p-2.5 bg-zinc-800/40 border border-(--vestara-accent-border)/50 rounded-lg text-xs flex items-center gap-2"><span className="text-green-400">✓</span> {display.verificationIds.length} verifications</div>}
              </div>
            </div>
          )}
          {display.metrics && (
            <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-3">
              <h3 className="text-[9px] font-semibold text-zinc-600 uppercase tracking-wider mb-2 flex items-center gap-1.5"><span className="w-1 h-3 rounded-full bg-green-500/60" /> Metrics</h3>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between"><span className="text-zinc-600">Steps</span><span className="text-zinc-300 font-medium">{display.metrics.completedSteps}/{display.metrics.totalSteps}</span></div>
                <div className="flex items-center justify-between"><span className="text-zinc-600">Agents</span><span className="text-zinc-300 font-medium">{display.metrics.agentCount || uniqueAgents.length}</span></div>
                <div className="flex items-center justify-between"><span className="text-zinc-600">Artifacts</span><span className="text-zinc-300 font-medium">{display.metrics.artifactCount || 0}</span></div>
                {display.metrics.duration && <div className="flex items-center justify-between"><span className="text-zinc-600">Duration</span><span className="text-zinc-300 font-medium">{formatDuration(Math.round(display.metrics.duration / 1000))}</span></div>}
              </div>
            </div>
          )}
          {session?.participants && session.participants.length > 0 && (
            <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-3">
              <h3 className="text-[9px] font-semibold text-zinc-600 uppercase tracking-wider mb-2 flex items-center gap-1.5"><span className="w-1 h-3 rounded-full bg-purple-500/60" /> Participants</h3>
              <div className="space-y-1">
                {session.participants.map((p: any, i: number) => (
                  <div key={i} className="text-xs text-zinc-400 flex items-center gap-2 py-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0" />
                    <span className="truncate text-zinc-300">{p.id}</span>
                    <span className="text-zinc-700">({p.role})</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-3">
            <h3 className="text-[9px] font-semibold text-zinc-600 uppercase tracking-wider mb-2 flex items-center gap-1.5"><span className="w-1 h-3 rounded-full bg-zinc-500/60" /> Info</h3>
            <div className="space-y-1.5 text-[11px] text-zinc-600">
              <div className="flex items-center justify-between"><span>ID</span><span className="text-zinc-400 font-mono text-[9px]">{display.id.slice(0, 16)}</span></div>
              <div className="flex items-center justify-between"><span>Source</span><span className="text-zinc-400">{exSession ? 'Workflow' : 'Session'}</span></div>
              <div className="flex items-center justify-between"><span>Status</span><span className={`font-medium ${badge.text}`}>{display.status}</span></div>
              {display.workflowId && <div className="flex items-center justify-between"><span>Workflow</span><span className="text-zinc-400 text-[9px] font-mono">{display.workflowId.slice(0, 16)}</span></div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
