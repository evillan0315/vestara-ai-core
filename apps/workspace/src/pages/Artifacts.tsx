import { useCallback, useEffect, useMemo, useState } from 'react';
import { approvePlan, implementPlan, verifyChangeSet } from '../lib/api';
import StatCard from '../components/dashboard/StatCard';
import SessionTimeline from '../components/SessionTimeline';
import WorkflowPipeline from '../components/WorkflowPipeline';
import CreateArtifactModal from '../components/artifacts/CreateArtifactModal';
import EditArtifactModal from '../components/artifacts/EditArtifactModal';
import DeleteConfirmDialog from '../components/artifacts/DeleteConfirmDialog';
import ApproveRejectDialog from '../components/artifacts/ApproveRejectDialog';
import AssignPlanDialog from '../components/artifacts/AssignPlanDialog';
import ArtifactStatusChip from '../components/artifacts/ArtifactStatusChip';
import ArtifactActionsMenu from '../components/artifacts/ArtifactActionsMenu';
import type { ActionItem } from '../components/artifacts/ArtifactActionsMenu';
import ArtifactEmptyState from '../components/artifacts/ArtifactEmptyState';

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

interface Plan {
  id: string;
  title: string;
  goal: string;
  status: string;
  createdAt: string;
  taskCount?: number;
  tasks?: any[];
}
interface ChangeSet {
  id: string;
  planId: string;
  status: string;
  fileCount?: number;
  createdAt: string;
  message?: string;
  title?: string;
  files?: any[];
}
interface CollabRecord {
  id: string;
  title: string;
  status: string;
  createdAt: string;
}
interface Verification {
  id: string;
  changeSetId: string;
  planId: string;
  status: string;
  summary: { total: number; passed: number; failed: number; skipped: number };
  checks: Array<{ type: string; status: string; output: string; durationMs: number }>;
  createdAt: string;
}
interface ExecSession {
  id: string;
  goal: string;
  status: string;
  workflowId?: string;
  timeline?: Array<{ agentId: string; step: string; status: string }>;
  metrics?: { totalSteps: number; completedSteps: number; agentCount?: number; artifactCount?: number };
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: string; color: string; border: string }> = {
  workspace: { label: 'Workspace', icon: '◈', color: 'text-blue-400', border: 'border-l-blue-500' },
  explanation: { label: 'Explanation', icon: '?', color: 'text-purple-400', border: 'border-l-purple-500' },
  plan: { label: 'Plan', icon: '△', color: 'text-amber-400', border: 'border-l-amber-500' },
  changeset: { label: 'Change Set', icon: '◇', color: 'text-cyan-400', border: 'border-l-cyan-500' },
  verification: { label: 'Verification', icon: '✓', color: 'text-green-400', border: 'border-l-green-500' },
  approval: { label: 'Approval', icon: '⟐', color: 'text-pink-400', border: 'border-l-pink-500' },
};

function statusBadge(status: string): { bg: string; text: string; dot: string } {
  if (status === 'completed' || status === 'passed' || status === 'approved')
    return { bg: 'bg-green-400/10', text: 'text-green-400', dot: 'bg-green-500' };
  if (status === 'failed') return { bg: 'bg-red-400/10', text: 'text-red-400', dot: 'bg-red-400' };
  if (status === 'running' || status === 'active' || status === 'submitted' || status === 'queued')
    return { bg: 'bg-amber-400/10', text: 'text-amber-400', dot: 'bg-amber-400' };
  return { bg: 'bg-zinc-800', text: 'text-(--vestara-text-2)', dot: 'bg-zinc-600' };
}

function StatusDot({ status }: { status: string }) {
  const s = statusBadge(status);
  return <span className={`w-2 h-2 rounded-full shrink-0 ${s.dot}`} />;
}

function StatusBadge({ status }: { status: string }) {
  const s = statusBadge(status);
  return <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-medium ${s.bg} ${s.text}`}>{status}</span>;
}

export default function Artifacts() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [changeSets, setChangeSets] = useState<ChangeSet[]>([]);
  const [collab, setCollab] = useState<CollabRecord[]>([]);
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [exSessions, setExSessions] = useState<ExecSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string>('plan');
  const [analysis, setAnalysis] = useState<any>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [planActionLoading, setPlanActionLoading] = useState<string | null>(null);
  const [generatedChangeSets, setGeneratedChangeSets] = useState<Record<string, string>>({});
  const [verificationResults, setVerificationResults] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Dialog state
  const [showCreate, setShowCreate] = useState(false);
  const [editingArtifact, setEditingArtifact] = useState<any>(null);
  const [deletingArtifact, setDeletingArtifact] = useState<any>(null);
  const [approveRejectAction, setApproveRejectAction] = useState<{ artifact: any; action: 'approve' | 'reject' } | null>(null);
  const [assigningArtifact, setAssigningArtifact] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const [d, exs, v] = await Promise.all([
        fetch('/api/artifacts')
          .then((r) => r.json())
          .catch(() => ({ plans: [], changeSets: [], collaboration: [] })),
        fetch('/api/sessions/executions')
          .then((r) => r.json())
          .catch(() => ({ sessions: [] })),
        fetch('/api/verifications')
          .then((r) => r.json())
          .catch(() => ({ verifications: [] })),
      ]);
      setPlans(d.plans ?? []);
      setChangeSets(d.changeSets ?? []);
      setCollab(d.collaboration ?? []);
      setExSessions(exs.sessions ?? []);
      setVerifications(v.verifications ?? []);
    } catch {}
    setLoading(false);
  }, []);

  // Plan action handlers
  const handleApprove = useCallback(async (planId: string) => {
    setPlanActionLoading(`approve-${planId}`);
    const ok = await approvePlan(planId);
    if (ok) load();
    setPlanActionLoading(null);
  }, [load]);

  const handleImplement = useCallback(async (planId: string) => {
    setPlanActionLoading(`implement-${planId}`);
    const result = await implementPlan(planId);
    if (result?.changeSet) {
      setGeneratedChangeSets((prev) => ({ ...prev, [planId]: result.changeSet.id }));
    }
    load();
    setPlanActionLoading(null);
  }, [load]);

  const handleVerify = useCallback(async (changeSetId: string) => {
    setPlanActionLoading(`verify-${changeSetId}`);
    const result = await verifyChangeSet(changeSetId);
    if (result?.report) {
      setVerificationResults((prev) => ({ ...prev, [changeSetId]: result.report.status }));
    }
    load();
    setPlanActionLoading(null);
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  const activeSession = useMemo(
    () => exSessions.find((s) => s.status === 'running' || s.status === 'queued'),
    [exSessions],
  );
  const selectedSession = useMemo(
    () => (selectedSessionId ? exSessions.find((s) => s.id === selectedSessionId) : null),
    [exSessions, selectedSessionId],
  );
  const detailSession = selectedSession || activeSession || exSessions[0];

  const categories = useMemo(() => {
    const items: Array<{ key: string; items: any[] }> = [
      { key: 'workspace', items: [{ type: 'workspace', name: 'Repository', status: 'active' }] },
      { key: 'explanation', items: [{ type: 'explanation', name: 'Workspace Analysis', status: 'completed' }] },
      { key: 'plan', items: plans.map((p) => ({ ...p, _type: 'plan' })) },
      { key: 'changeset', items: changeSets.map((c) => ({ ...c, _type: 'changeset' })) },
      { key: 'verification', items: verifications.map((v) => ({ ...v, _type: 'verification' })) },
      { key: 'approval', items: collab.map((c) => ({ ...c, _type: 'approval' })) },
    ];
    return items;
  }, [plans, changeSets, verifications, collab]);

  const totalArtifacts = plans.length + changeSets.length + verifications.length + collab.length;

  const sessionArtifacts = useMemo(() => {
    if (!detailSession) return [];
    return [
      ...plans
        .filter(
          (p) => p.id === detailSession.id || detailSession.goal?.toLowerCase().includes(p.goal?.toLowerCase() || ''),
        )
        .map((p) => ({ ...p, _type: 'plan' as const })),
      ...changeSets
        .filter((cs) => cs.planId === detailSession.id || cs.id === detailSession.id)
        .map((cs) => ({ ...cs, _type: 'changeset' as const })),
    ];
  }, [detailSession, plans, changeSets]);

  const verificationCounts = useMemo(
    () => ({
      passed: verifications.filter((v) => v.status === 'passed').length,
      failed: verifications.filter((v) => v.status === 'failed').length,
      totalChecks: verifications.reduce((s, v) => s + (v.summary?.total || 0), 0),
      passedChecks: verifications.reduce((s, v) => s + (v.summary?.passed || 0), 0),
      failedChecks: verifications.reduce((s, v) => s + (v.summary?.failed || 0), 0),
    }),
    [verifications],
  );

  if (loading)
    return <div className="w-full px-4 py-16 text-center text-[var(--vestara-text-muted)] animate-pulse">Loading artifacts...</div>;

  return (
    <div className="w-full px-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-zinc-100">Artifacts</h1>
          <p className="text-[11px] text-zinc-500 mt-0.5">Manage project artifacts and approval workflows.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCreate(true)}
            className="text-xs px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-all cursor-pointer font-medium shadow-sm shadow-blue-600/20">
            + Create Artifact
          </button>
          <button onClick={load} className="w-8 h-8 flex items-center justify-center rounded-lg border border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer" title="Refresh">↻</button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        <StatCard label="Plans" value={plans.length} accent="#8b5cf6" />
        <StatCard label="Change Sets" value={changeSets.length} accent="#06b6d4" />
        <StatCard label="Verifications" value={verifications.length} accent="#10b981" />
        <StatCard label="Approvals" value={collab.length} accent="#ec4899" />
        <StatCard label="Sessions" value={exSessions.length} accent="#3b82f6" />
        <StatCard label="Active" value={activeSession ? 1 : 0} accent={activeSession ? '#10b981' : '#52525b'} sub={activeSession ? 'Running' : undefined} />
      </div>

      {/* Search + Filter bar */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-0 max-w-xs">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search artifacts..." className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-8 pr-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:border-zinc-500 transition-colors" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-zinc-900 border border-zinc-700 text-zinc-300 rounded-lg px-3 py-2 text-xs outline-none cursor-pointer focus:border-zinc-500 transition-colors">
          <option value="all">All Status</option>
          <option value="draft">Draft</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="running">Running</option>
        </select>
        <span className="text-[10px] text-zinc-600">{totalArtifacts} total</span>
      </div>

      {/* Session selector */}
      {exSessions.length > 0 && (
        <div className="mb-4">
          <div className="text-[9px] text-(--vestara-text-muted) uppercase tracking-wider mb-1.5 font-semibold">
            Filter by Session
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setSelectedSessionId(null)}
              className={`text-[9px] px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                !selectedSessionId
                  ? 'bg-(--vestara-accent-bg) text-(--vestara-text) border border-(--vestara-accent-border-active) font-medium'
                  : 'bg-zinc-800 text-(--vestara-text-2) hover:text-(--vestara-text) border border-zinc-700'
              }`}
            >
              All
            </button>
            {exSessions.slice(0, 10).map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedSessionId(selectedSessionId === s.id ? null : s.id)}
                className={`text-[9px] px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
                  selectedSessionId === s.id
                    ? 'bg-accent text-accent border-accent font-medium'
                    : 'bg-zinc-800 text-(--vestara-text-2) hover:text-(--vestara-text) border border-zinc-700'
                }`}
              >
                <StatusDot status={s.status} />
                <span className="truncate max-w-[120px]">{s.goal?.slice(0, 24) || s.id?.slice(0, 12)}</span>
              </button>
            ))}
            {exSessions.length > 10 && <span className="text-[8px] text-(--vestara-text-dim)">+{exSessions.length - 10} more</span>}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* ===== LEFT: Main artifact chain ===== */}
        <div className="lg:col-span-8 space-y-4">
          {/* Workspace Analysis */}
          {analysis && showAnalysis && (
            <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold text-(--vestara-text-2) uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-1 h-3 rounded-full bg-purple-500/60" /> Workspace Analysis
                </h2>
                <button
                  onClick={() => setShowAnalysis(false)}
                  className="text-(--vestara-text-dim) hover:text-(--vestara-text-2) cursor-pointer text-[9px]"
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                <div className="p-2.5 bg-zinc-800/50 border border-zinc-700 rounded-lg text-center">
                    <div className="text-lg font-bold text-[var(--vestara-text)]">{analysis.metrics?.totalFiles || 0}</div>
                  <div className="text-[9px] text-(--vestara-text-muted) uppercase tracking-wider">Files</div>
                </div>
                <div className="p-2.5 bg-zinc-800/50 border border-zinc-700 rounded-lg text-center">
                  <div className="text-lg font-bold text-zinc-200">{analysis.metrics?.totalPackages || 0}</div>
                  <div className="text-[9px] text-(--vestara-text-muted) uppercase tracking-wider">Packages</div>
                </div>
                <div className="p-2.5 bg-zinc-800/50 border border-zinc-700 rounded-lg text-center">
                  <div
                    className={`text-lg font-bold ${(analysis.metrics?.testCoverage || 0) >= 70 ? 'text-green-400' : 'text-amber-400'}`}
                  >
                    {analysis.metrics?.testCoverage || 0}%
                  </div>
                  <div className="text-[9px] text-(--vestara-text-muted) uppercase tracking-wider">Coverage</div>
                </div>
                <div className="p-2.5 bg-zinc-800/50 border border-zinc-700 rounded-lg text-center">
                  <div className="text-lg font-bold text-zinc-200">{analysis.metrics?.agentCount || 0}</div>
                  <div className="text-[9px] text-(--vestara-text-muted) uppercase tracking-wider">Agents</div>
                </div>
              </div>
              {analysis.summary && (
                <div className="p-2.5 bg-zinc-800/30 border border-zinc-700/50 rounded-lg text-[11px] text-(--vestara-text-2) leading-relaxed mb-3">
                  {analysis.summary}
                </div>
              )}
              {analysis.risks?.length > 0 && (
                <div className="mb-2">
                  <span className="text-[9px] text-(--vestara-text-2) uppercase font-semibold tracking-wider">Risks</span>
                  <div className="space-y-1 mt-1">
                    {analysis.risks.slice(0, 3).map((r: any, i: number) => (
                      <div
                        key={i}
                        className={`text-[10px] px-2.5 py-1.5 rounded-lg flex items-center gap-2 ${
                          r.severity === 'high'
                            ? 'bg-red-400/10 text-red-400 border border-red-400/20'
                            : r.severity === 'medium'
                              ? 'bg-amber-400/10 text-amber-400 border border-amber-400/20'
                              : 'bg-zinc-800 text-(--vestara-text-2) border border-zinc-700'
                        }`}
                      >
                        <span className="font-semibold shrink-0">
                          {r.severity === 'high' ? '⚠' : r.severity === 'medium' ? '!' : '·'}
                        </span>
                        <span>
                          <strong>{r.area}:</strong> {r.finding}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {analysis.recommendations?.length > 0 && (
                <div>
                  <span className="text-[9px] text-(--vestara-text-2) uppercase font-semibold tracking-wider">
                    Recommendations
                  </span>
                  <div className="space-y-1 mt-1">
                    {analysis.recommendations.slice(0, 3).map((r: any, i: number) => (
                      <div
                        key={i}
                        className="text-[10px] text-(--vestara-text-2) flex items-start gap-2 p-1.5 bg-zinc-800/30 rounded-lg"
                      >
                        <span className={r.priority === 'high' ? 'text-red-400 shrink-0' : 'text-amber-400 shrink-0'}>
                          •
                        </span>
                        <span>
                          <strong className="text-(--vestara-text)">{r.action}</strong>: {r.rationale}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Pipeline */}
          {detailSession && <WorkflowPipeline session={detailSession} />}

          {/* Empty state */}
          {totalArtifacts === 0 && exSessions.length === 0 && (
            <ArtifactEmptyState
              title="No Artifacts Yet"
              description="Create your first artifact to begin planning your workflow."
              actionLabel="Create Artifact"
              onAction={() => setShowCreate(true)}
            />
          )}

          {/* Category sections */}
          <div className="space-y-2">
            {categories.map(({ key, items }) => {
              const cfg = CATEGORY_CONFIG[key] || {
                label: key,
                icon: '·',
                color: 'text-(--vestara-text-2)',
                border: 'border-l-zinc-600',
              };
              const isExpanded = expandedCategory === key;
              return (
                <div
                  key={key}
                  className={`bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg overflow-hidden transition-colors hover:border-(--vestara-accent-border-hover) border-l-[3px] ${cfg.border}`}
                >
                  <div
                    className="flex items-center justify-between p-3 cursor-pointer select-none"
                    onClick={() => setExpandedCategory(isExpanded ? '' : key)}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`text-xs font-semibold uppercase tracking-wider ${cfg.color}`}>
                        {cfg.icon} {cfg.label}
                      </span>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded-full ${items.length > 0 ? 'bg-zinc-800 text-(--vestara-text-2)' : 'text-(--vestara-text-dim) bg-zinc-800/50'}`}
                      >
                        {items.length}
                      </span>
                    </div>
                    <span
                      className={`text-(--vestara-text-muted) text-[10px] transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    >
                      ▼
                    </span>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-zinc-800 divide-y divide-zinc-800/40">
                      {items.length === 0 && (
                        <div className="p-6 text-center text-[10px] text-(--vestara-text-dim) italic">
                          No {cfg.label.toLowerCase()} artifacts
                        </div>
                      )}
                      {items.slice(0, 20).map((item: any, idx: number) => {
                        const isSelected = selectedItem?.id === item.id && selectedItem?._type === item._type;
                        return (
                          <div
                            key={item.id || item.title || idx}
                            className={`p-3 transition-colors cursor-pointer ${isSelected ? 'bg-zinc-800/50' : 'hover:bg-zinc-800/20'}`}
                            onClick={() => setSelectedItem(isSelected ? null : item)}
                          >
                            <div className="flex items-center gap-2.5">
                              <StatusDot status={item.status} />
                              <span className="text-sm text-[var(--vestara-text)] truncate flex-1 font-medium">
                                {item.title || item.goal || item.message || item.name || item.id}
                              </span>
                              <StatusBadge status={item.status} />
                            </div>

                            {/* Metadata row */}
                            <div className="flex items-center gap-3 mt-1 text-[10px] text-(--vestara-text-muted) ml-[18px]">
                              {item._type === 'plan' && (
                                <>
                                  {(item.taskCount ?? item.tasks?.length) !== undefined && (
                                    <span>{item.taskCount ?? item.tasks?.length} tasks</span>
                                  )}
                                  <div className="flex items-center gap-1 ml-auto">
                                    {item.status === 'draft' && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleApprove(item.id); }}
                                        disabled={planActionLoading === `approve-${item.id}`}
                                        className="text-[8px] px-1.5 py-0.5 rounded bg-blue-400/10 text-blue-400 hover:bg-blue-400/20 transition-colors cursor-pointer disabled:opacity-30 font-medium"
                                      >
                                        {planActionLoading === `approve-${item.id}` ? '...' : 'Approve'}
                                      </button>
                                    )}
                                    {item.status === 'approved' && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleImplement(item.id); }}
                                        disabled={planActionLoading === `implement-${item.id}`}
                                        className="text-[8px] px-1.5 py-0.5 rounded bg-amber-400/10 text-amber-400 hover:bg-amber-400/20 transition-colors cursor-pointer disabled:opacity-30 font-medium"
                                      >
                                        {planActionLoading === `implement-${item.id}` ? '...' : 'Implement'}
                                      </button>
                                    )}
                                    {generatedChangeSets[item.id] && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleVerify(generatedChangeSets[item.id]); }}
                                        disabled={planActionLoading === `verify-${generatedChangeSets[item.id]}`}
                                        className="text-[8px] px-1.5 py-0.5 rounded bg-green-400/10 text-green-400 hover:bg-green-400/20 transition-colors cursor-pointer disabled:opacity-30 font-medium"
                                      >
                                        {planActionLoading === `verify-${generatedChangeSets[item.id]}`
                                          ? '...'
                                          : verificationResults[generatedChangeSets[item.id]]
                                            ? verificationResults[generatedChangeSets[item.id]] === 'passed' ? '✓ Verified' : '✗ Failed'
                                            : 'Verify'}
                                      </button>
                                    )}
                                    <button onClick={(e) => { e.stopPropagation(); setEditingArtifact(item); }}
                                      className="text-[8px] px-1.5 py-0.5 rounded bg-zinc-700/50 text-zinc-400 hover:bg-zinc-700 transition-colors cursor-pointer font-medium">Edit</button>
                                    <button onClick={(e) => { e.stopPropagation(); setDeletingArtifact(item); }}
                                      className="text-[8px] px-1.5 py-0.5 rounded bg-red-400/10 text-red-400 hover:bg-red-400/20 transition-colors cursor-pointer font-medium">Del</button>
                                  </div>
                                </>
                              )}
                              {item._type === 'changeset' && (
                                <>
                                  {(item.fileCount ?? item.files?.length) !== undefined && (
                                    <span>{item.fileCount ?? item.files?.length} files</span>
                                  )}
                                </>
                              )}
                              {item._type === 'verification' && item.summary && (
                                <>
                                  <span className={item.summary.failed > 0 ? 'text-red-400' : 'text-green-400'}>
                                    {item.summary.passed}/{item.summary.total} passed
                                  </span>
                                  {item.summary.failed > 0 && (
                                    <span className="text-red-400">{item.summary.failed} failed</span>
                                  )}
                                </>
                              )}
                              {item._type === 'approval' && item.title && <span>{item.title}</span>}
                              <span className="text-(--vestara-text-dim)">
                                {new Date(item.createdAt || Date.now()).toLocaleDateString()}
                              </span>
                            </div>

                            {/* Expanded detail */}
                            {isSelected && item._type === 'verification' && item.checks && (
                              <div className="mt-2 pt-2.5 border-t border-(--vestara-accent-border) space-y-1">
                                <div className="text-[9px] text-(--vestara-text-muted) uppercase tracking-wider font-semibold mb-1.5">
                                  Checks ({item.checks.length})
                                </div>
                                {item.checks.map((c: any, ci: number) => (
                                  <div
                                    key={ci}
                                    className="flex items-start gap-2.5 text-[10px] p-2 bg-zinc-800/30 rounded-lg border border-zinc-700/50"
                                  >
                                    <span
                                      className={`shrink-0 mt-0.5 text-[11px] ${c.status === 'passed' ? 'text-green-400' : c.status === 'failed' ? 'text-red-400' : 'text-(--vestara-text-muted)'}`}
                                    >
                                      {c.status === 'passed' ? '✓' : c.status === 'failed' ? '✗' : '−'}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-(--vestara-text) font-medium text-[11px]">{c.type}</div>
                                      {c.output && (
                                        <div className="text-(--vestara-text-2) truncate mt-0.5">{c.output.slice(0, 160)}</div>
                                      )}
                                      {c.durationMs > 0 && (
                                        <span className="text-(--vestara-text-dim) text-[9px]">{c.durationMs}ms</span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {isSelected && item._type === 'changeset' && item.files && (
                              <div className="mt-2 pt-2.5 border-t border-(--vestara-accent-border) space-y-0.5">
                                <div className="text-[9px] text-(--vestara-text-muted) uppercase tracking-wider font-semibold mb-1">
                                  Files ({item.files.length})
                                </div>
                                {item.files.map((f: any, fi: number) => (
                                  <div
                                    key={fi}
                                    className="text-[9px] text-(--vestara-text-2) font-mono px-1 py-0.5 bg-zinc-800/20 rounded"
                                  >
                                    {f.path || f}
                                  </div>
                                ))}
                              </div>
                            )}

                            {isSelected && item._type === 'plan' && item.tasks && (
                              <div className="mt-2 pt-2.5 border-t border-(--vestara-accent-border) space-y-0.5">
                                <div className="text-[9px] text-(--vestara-text-muted) uppercase tracking-wider font-semibold mb-1">
                                  Tasks ({item.tasks.length})
                                </div>
                                {item.tasks.map((t: any, ti: number) => (
                                  <div key={ti} className="text-[10px] text-(--vestara-text-2) flex items-start gap-1.5 py-0.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0 mt-0.5" />
                                    <span>{t.description || t.title || t}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {items.length > 20 && (
                        <div className="p-2 text-center text-[10px] text-(--vestara-text-dim)">{items.length - 20} more...</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ===== RIGHT: Session + Summary sidebar ===== */}
        <div className="lg:col-span-4 space-y-3">
          {/* Session timeline */}
          {detailSession && (
            <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-3">
              <h3 className="text-[10px] font-semibold text-(--vestara-text-2) uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <span className="w-1 h-3 rounded-full bg-blue-500/60" />
                {detailSession.goal ? detailSession.goal.slice(0, 36) : 'Session'}
                <StatusBadge status={detailSession.status} />
              </h3>
              <SessionTimeline session={detailSession} compact />
              {detailSession.metrics && (
                <div className="mt-2 pt-2 border-t border-(--vestara-accent-border) space-y-1.5 text-[10px] text-(--vestara-text-muted)">
                  <div className="flex items-center justify-between">
                    <span>Progress</span>
                    <span className="text-(--vestara-text)">
                      {detailSession.metrics.completedSteps}/{detailSession.metrics.totalSteps} steps
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Agents</span>
                    <span className="text-(--vestara-text)">
                      {detailSession.metrics.agentCount || detailSession.timeline?.length || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Artifacts</span>
                    <span className="text-(--vestara-text)">
                      {detailSession.metrics.artifactCount || sessionArtifacts.length || 0}
                    </span>
                  </div>
                  <div className="mt-1.5 bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-1.5 rounded-full bg-blue-500 transition-all"
                      style={{
                        width: `${detailSession.metrics.totalSteps > 0 ? Math.round((detailSession.metrics.completedSteps / detailSession.metrics.totalSteps) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Session agents */}
          {detailSession?.timeline && detailSession.timeline.length > 0 && (
            <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-3">
              <h3 className="text-[10px] font-semibold text-(--vestara-text-2) uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <span className="w-1 h-3 rounded-full bg-purple-500/60" /> Agents ({detailSession.timeline.length})
              </h3>
              <div className="space-y-1.5">
                {detailSession.timeline.map((t: any, i: number) => (
                  <div
                    key={i}
                    className="flex items-center gap-2.5 text-[10px] py-1 px-1 rounded hover:bg-zinc-800/20 transition-colors"
                  >
                    <StatusDot status={t.status} />
                    <span className="text-(--vestara-text) flex-1 truncate font-medium">{t.step || t.agentId}</span>
                    <StatusBadge status={t.status} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Artifact Summary */}
          <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-3">
            <h3 className="text-[10px] font-semibold text-(--vestara-text-2) uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span className="w-1 h-3 rounded-full bg-zinc-500/60" /> Summary
            </h3>
            <div className="space-y-2 text-[10px]">
              {[
                { label: 'Plans', value: plans.length, color: 'text-accent', bar: 'bg-amber-500' },
                { label: 'Change Sets', value: changeSets.length, color: 'text-cyan-400', bar: 'bg-cyan-500' },
                { label: 'Verifications', value: verifications.length, color: 'text-green-400', bar: 'bg-green-500' },
                { label: 'Approvals', value: collab.length, color: 'text-pink-400', bar: 'bg-pink-500' },
                { label: 'Exec Sessions', value: exSessions.length, color: 'text-blue-400', bar: 'bg-blue-500' },
              ].map(({ label, value, color, bar }) => {
                const pct = totalArtifacts > 0 ? Math.round((value / totalArtifacts) * 100) : 0;
                const accentBars = ['bg-amber-500', 'bg-amber-400'];
                return (
                  <div key={label} className="flex items-center gap-2">
                    <span className={`w-16 ${color} shrink-0`}>{value}</span>
                    <div className="flex-1 bg-zinc-800 rounded-full h-1 overflow-hidden">
                      <div
                        className={`h-1 rounded-full ${accentBars.includes(bar) ? '' : bar}`}
                        style={{
                          width: `${pct}%`,
                          backgroundColor: accentBars.includes(bar) ? 'var(--vestara-accent)' : undefined,
                        }}
                      />
                    </div>
                    <span className="text-(--vestara-text-dim) w-8 text-right">{pct}%</span>
                  </div>
                );
              })}
              <div className="border-t border-zinc-800 pt-1.5 mt-1.5 flex items-center justify-between">
                <span className="text-(--vestara-text-2) font-medium">Total</span>
                <span className="text-zinc-200 font-semibold">{totalArtifacts}</span>
              </div>
            </div>
          </div>

          {/* Verification health */}
          {verifications.length > 0 && (
            <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-3">
              <h3 className="text-[10px] font-semibold text-(--vestara-text-2) uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <span className="w-1 h-3 rounded-full bg-green-500/60" /> Verification Health
              </h3>
              <div className="space-y-2 text-[10px]">
                <div className="flex items-center justify-between">
                  <span className="text-green-400">Passed</span>
                  <span className="text-(--vestara-text) font-medium">{verificationCounts.passed}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-red-400">Failed</span>
                  <span className="text-(--vestara-text) font-medium">{verificationCounts.failed}</span>
                </div>
                {verificationCounts.totalChecks > 0 && (
                  <>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-zinc-800 rounded-full h-1.5 flex overflow-hidden">
                        <div
                          className="h-1.5 bg-green-500 transition-all"
                          style={{
                            width: `${(verificationCounts.passedChecks / verificationCounts.totalChecks) * 100}%`,
                          }}
                        />
                        <div
                          className="h-1.5 bg-red-500 transition-all"
                          style={{
                            width: `${(verificationCounts.failedChecks / verificationCounts.totalChecks) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[9px]">
                      <span className="text-(--vestara-text-dim)">{verificationCounts.totalChecks} total checks</span>
                      <span className="text-(--vestara-text-dim)">
                        {verificationCounts.passedChecks}✓ / {verificationCounts.failedChecks}✗
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <CreateArtifactModal open={showCreate} onClose={() => setShowCreate(false)} onCreated={load} />
      <EditArtifactModal open={!!editingArtifact} artifact={editingArtifact} onClose={() => setEditingArtifact(null)} onUpdated={load} />
      <DeleteConfirmDialog open={!!deletingArtifact} artifact={deletingArtifact} onClose={() => setDeletingArtifact(null)} onDeleted={load} />
      <ApproveRejectDialog open={!!approveRejectAction} artifact={approveRejectAction?.artifact ?? null} action={approveRejectAction?.action ?? null} onClose={() => setApproveRejectAction(null)} onCompleted={load} />
      <AssignPlanDialog open={!!assigningArtifact} artifact={assigningArtifact} plans={plans} onClose={() => setAssigningArtifact(null)} onAssigned={load} />
    </div>
  );
}
