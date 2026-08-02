import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Orchestration — multi-agent workflow projects (ADR-118 / PCS-025).
 *
 * Lists orchestrated projects with their phase/status, task metrics, and the
 * Approval Gateway queue (high-risk changes awaiting a human decision).
 */

const API = '/api/orchestration';

interface ProjectSummary {
  id: string;
  name: string;
  goal: string;
  phase: string;
  status: string;
  createdAt: string;
}

interface ProjectMetrics {
  projectId: string;
  status: string;
  tasks: { total: number; completed: number; failed: number; blocked: number; awaitingApproval: number; running: number };
  retries: number;
  revisions: number;
  artifacts: number;
  elapsedMs: number;
}

interface ApprovalTask {
  id: string;
  summary: string;
  approvalReason?: string;
  files: string[];
}

const PHASE_BADGE: Record<string, string> = {
  draft: 'bg-zinc-600/20 text-zinc-300 border-zinc-500/30',
  analyzing: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  planning: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  architecture: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  'pending-approval': 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  executing: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  verifying: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
  completed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  cancelled: 'bg-red-500/15 text-red-300 border-red-500/30',
  archived: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
};

function StatCard({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg border-l-[3px]" style={{ borderLeftColor: accent }}>
      <div className="text-[9px] text-(--vestara-text-muted) uppercase tracking-widest">{label}</div>
      <div className="text-lg font-bold text-(--vestara-text) mt-1">{value}</div>
    </div>
  );
}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export default function OrchestrationPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [metricsByProject, setMetricsByProject] = useState<Record<string, ProjectMetrics>>({});
  const [approvalsByProject, setApprovalsByProject] = useState<Record<string, ApprovalTask[]>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const data = await fetchJson<{ projects: ProjectSummary[] }>(`${API}/projects`);
    const list = data?.projects ?? [];
    setProjects(list);

    const metricsData = await fetchJson<{ metrics: ProjectMetrics[] }>(`${API}/metrics`);
    setMetricsByProject(Object.fromEntries((metricsData?.metrics ?? []).map((m) => [m.projectId, m])));

    const approvals: Record<string, ApprovalTask[]> = {};
    for (const project of list) {
      const approvalData = await fetchJson<{ approvals: ApprovalTask[] }>(`${API}/projects/${project.id}/approvals`);
      if (approvalData) approvals[project.id] = approvalData.approvals ?? [];
    }
    setApprovalsByProject(approvals);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const stats = useMemo(() => {
    const byStatus: Record<string, number> = {};
    let approvals = 0;
    for (const project of projects) byStatus[project.status] = (byStatus[project.status] || 0) + 1;
    for (const list of Object.values(approvalsByProject)) approvals += list.length;
    return { total: projects.length, running: byStatus['running'] || 0, completed: byStatus['completed'] || 0, approvals };
  }, [projects, approvalsByProject]);

  const resolveApproval = async (projectId: string, taskId: string, approved: boolean) => {
    setBusy(taskId);
    try {
      await fetch(`${API}/projects/${projectId}/tasks/${taskId}/approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved }),
      });
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-(--vestara-text)">Multi-Agent Orchestration</h1>
          <p className="text-[10px] text-(--vestara-text-muted) mt-1">
            WorkflowOrchestrator projects · task waves · approval gateway (ADR-118 / PCS-025)
          </p>
        </div>
        <button
          onClick={() => void refresh()}
          className="text-xs px-3 py-1.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-lg hover:text-(--vestara-text) transition-colors cursor-pointer"
        >
          ↻ Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Projects" value={stats.total} accent="#8b5cf6" />
        <StatCard label="Running" value={stats.running} accent="#3b82f6" />
        <StatCard label="Completed" value={stats.completed} accent="#10b981" />
        <StatCard label="Awaiting approval" value={stats.approvals} accent={stats.approvals ? '#f59e0b' : '#52525b'} />
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm text-(--vestara-text-muted)">Loading projects...</div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
          <div className="text-4xl text-(--vestara-text-2) mb-3">⚙</div>
          <p className="text-sm text-(--vestara-text-2)">No orchestrated projects yet</p>
          <p className="text-xs text-(--vestara-text-muted) mt-1">
            Start one via <code className="text-(--vestara-accent-text)">POST /api/orchestration/projects</code>.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => {
            const metrics = metricsByProject[project.id];
            const approvals = approvalsByProject[project.id] ?? [];
            return (
              <div key={project.id} className="rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg)/40 p-4">
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-sm font-semibold text-(--vestara-text)">{project.name}</h2>
                      <span className={`px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-wider ${PHASE_BADGE[project.phase] ?? 'bg-zinc-600/20 text-zinc-300'}`}>
                        {project.phase}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${project.status === 'completed' ? 'bg-emerald-500/15 text-emerald-300' : project.status === 'cancelled' ? 'bg-red-500/15 text-red-300' : 'bg-blue-500/15 text-blue-300'}`}>
                        {project.status}
                      </span>
                    </div>
                    <p className="text-xs text-(--vestara-text-muted) mt-1 truncate">{project.goal}</p>
                    <p className="text-[10px] text-(--vestara-text-dim) mt-0.5">{project.id}</p>
                  </div>
                  {metrics && (
                    <div className="flex items-center gap-3 text-xs text-(--vestara-text-2)">
                      <span>{metrics.tasks.completed}/{metrics.tasks.total} tasks</span>
                      <span>·</span>
                      <span>{metrics.retries} retries</span>
                      <span>·</span>
                      <span>{metrics.artifacts} artifacts</span>
                      <span>·</span>
                      <span>{(metrics.elapsedMs / 1000).toFixed(0)}s</span>
                    </div>
                  )}
                </div>

                {approvals.length > 0 && (
                  <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                    <div className="text-xs font-medium text-amber-300 mb-2">Approval required</div>
                    <div className="space-y-2">
                      {approvals.map((task) => (
                        <div key={task.id} className="flex items-center gap-3 flex-wrap">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-(--vestara-text)">{task.summary}</p>
                            <p className="text-[10px] text-(--vestara-text-muted)">{task.approvalReason ?? 'high-risk change'}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => void resolveApproval(project.id, task.id, true)}
                              disabled={busy === task.id}
                              className="px-3 py-1 text-xs rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 transition-colors cursor-pointer disabled:opacity-50"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => void resolveApproval(project.id, task.id, false)}
                              disabled={busy === task.id}
                              className="px-3 py-1 text-xs rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500/25 transition-colors cursor-pointer disabled:opacity-50"
                            >
                              Deny
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
