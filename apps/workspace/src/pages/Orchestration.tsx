import { useCallback, useEffect, useMemo, useState } from 'react';
import { VestaraModal } from '../components/ui/VestaraModal';

/**
 * Orchestration — multi-agent workflow projects (ADR-118 / PCS-025).
 *
 * Lists orchestrated projects with phase/status and task metrics, creates new
 * projects (create → analyze → plan → architecture → approve → execute), shows
 * per-project detail (tasks, audit, plan approval, resume), and renders the
 * Approval Gateway queue with Approve/Deny actions.
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

interface Snapshot {
  project: ProjectSummary;
  plan?: { id: string; title: string; status: string };
  tasks: Array<{ id: string; summary: string; status: string; files: string[]; revisionCount: number; attemptCount: number }>;
  phase: string;
  status: string;
}

interface AuditEvent {
  type: string;
  at: string;
}

interface TaskRow {
  summary: string;
  files: string;
  capabilities: string;
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

const TASK_STATUS_BADGE: Record<string, string> = {
  completed: 'bg-emerald-500/15 text-emerald-300',
  approved: 'bg-teal-500/15 text-teal-300',
  blocked: 'bg-red-500/15 text-red-300',
  failed: 'bg-red-500/15 text-red-300',
  'awaiting-approval': 'bg-amber-500/15 text-amber-300',
  retrying: 'bg-amber-500/15 text-amber-300',
  running: 'bg-blue-500/15 text-blue-300',
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

async function postJson<T>(path: string, body?: unknown): Promise<T | null> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
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
  const [detail, setDetail] = useState<Record<string, { snapshot: Snapshot; audit: AuditEvent[] }>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', goal: '', repoPath: '' });
  const [taskRows, setTaskRows] = useState<TaskRow[]>([{ summary: '', files: '', capabilities: '' }]);

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

  const loadDetail = useCallback(async (projectId: string) => {
    const [snapshot, audit] = await Promise.all([
      fetchJson<{ snapshot: Snapshot }>(`${API}/projects/${projectId}`),
      fetchJson<{ events: AuditEvent[] }>(`${API}/projects/${projectId}/audit`),
    ]);
    if (snapshot) {
      setDetail((prev) => ({ ...prev, [projectId]: { snapshot: snapshot.snapshot, audit: audit?.events ?? [] } }));
    }
  }, []);

  const toggleExpand = useCallback(
    (projectId: string) => {
      const next = expandedId === projectId ? null : projectId;
      setExpandedId(next);
      if (next && !detail[projectId]) void loadDetail(projectId);
    },
    [expandedId, detail, loadDetail],
  );

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
      await postJson(`${API}/projects/${projectId}/tasks/${taskId}/approval`, { approved });
      await refresh();
      if (expandedId) await loadDetail(expandedId);
    } finally {
      setBusy(null);
    }
  };

  const approvePlan = async (projectId: string) => {
    setBusy(`plan-${projectId}`);
    try {
      await postJson(`${API}/projects/${projectId}/approve`, {});
      await refresh();
      if (expandedId) await loadDetail(expandedId);
    } finally {
      setBusy(null);
    }
  };

  const resumeProject = async (projectId: string) => {
    setBusy(`resume-${projectId}`);
    try {
      await postJson(`${API}/projects/${projectId}/resume`);
      await refresh();
      if (expandedId) await loadDetail(expandedId);
    } finally {
      setBusy(null);
    }
  };

  const createAndRun = async () => {
    if (!form.name.trim() || !form.goal.trim()) {
      setCreateError('Name and goal are required.');
      return;
    }
    const tasks = taskRows
      .map((row) => ({
        summary: row.summary.trim(),
        files: row.files.split(',').map((f) => f.trim()).filter(Boolean),
        requiredCapabilities: row.capabilities.split(',').map((c) => c.trim()).filter(Boolean),
      }))
      .filter((task) => task.summary);
    if (tasks.length === 0) {
      setCreateError('Add at least one task with a summary.');
      return;
    }

    setCreateBusy(true);
    setCreateError(null);
    try {
      const created = await postJson<{ project: { id: string } }>(`${API}/projects`, {
        name: form.name.trim(),
        goal: form.goal.trim(),
        repoPath: form.repoPath.trim() || undefined,
      });
      if (!created) throw new Error('Failed to create project');
      const id = created.project.id;
      await postJson(`${API}/projects/${id}/start`);
      await postJson(`${API}/projects/${id}/analysis`, { analystId: 'analyst', report: {} });
      const planBody = tasks.map((task) => ({ ...task, description: '', dependencies: [], effort: 'medium' }));
      await postJson(`${API}/projects/${id}/plan`, { plannerId: 'planner', title: form.name.trim(), goal: form.goal.trim(), tasks: planBody });
      await postJson(`${API}/projects/${id}/architecture`, { architectId: 'architect', status: 'approved' });
      await postJson(`${API}/projects/${id}/approve`, {});
      await postJson(`${API}/projects/${id}/execute`);
      setCreateOpen(false);
      setForm({ name: '', goal: '', repoPath: '' });
      setTaskRows([{ summary: '', files: '', capabilities: '' }]);
      await refresh();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Failed to start project');
    } finally {
      setCreateBusy(false);
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCreateOpen(true)}
            className="text-xs px-3 py-1.5 bg-(--vestara-accent) text-white rounded-lg hover:opacity-90 transition-opacity cursor-pointer font-medium"
          >
            + New project
          </button>
          <button
            onClick={() => void refresh()}
            className="text-xs px-3 py-1.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-lg hover:text-(--vestara-text) transition-colors cursor-pointer"
          >
            ↻ Refresh
          </button>
        </div>
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
          <button
            onClick={() => setCreateOpen(true)}
            className="mt-3 text-xs px-3 py-1.5 bg-(--vestara-accent) text-white rounded-lg hover:opacity-90 cursor-pointer"
          >
            Create your first project
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => {
            const metrics = metricsByProject[project.id];
            const approvals = approvalsByProject[project.id] ?? [];
            const expanded = expandedId === project.id;
            const projectDetail = detail[project.id];
            return (
              <div key={project.id} className="rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg)/40">
                <button
                  onClick={() => toggleExpand(project.id)}
                  className="w-full text-left p-4 cursor-pointer"
                >
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
                    </div>
                    {metrics && (
                      <div className="flex items-center gap-3 text-xs text-(--vestara-text-2)">
                        <span>{metrics.tasks.completed}/{metrics.tasks.total} tasks</span>
                        <span>·</span>
                        <span>{metrics.retries} retries</span>
                        <span>·</span>
                        <span>{metrics.artifacts} artifacts</span>
                        <span className="text-(--vestara-text-dim)">{expanded ? '▴' : '▾'}</span>
                      </div>
                    )}
                  </div>
                </button>

                {approvals.length > 0 && (
                  <div className="mx-4 mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
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

                {expanded && (
                  <div className="border-t border-(--vestara-accent-border) p-4 space-y-4">
                    {projectDetail ? (
                      <>
                        <div className="flex items-center gap-2 flex-wrap">
                          {projectDetail.snapshot.phase === 'pending-approval' && (
                            <button
                              onClick={() => void approvePlan(project.id)}
                              disabled={busy === `plan-${project.id}`}
                              className="px-3 py-1 text-xs rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 cursor-pointer disabled:opacity-50"
                            >
                              Approve plan
                            </button>
                          )}
                          {(projectDetail.snapshot.status === 'running' || projectDetail.snapshot.status === 'awaiting-approval') && (
                            <button
                              onClick={() => void resumeProject(project.id)}
                              disabled={busy === `resume-${project.id}`}
                              className="px-3 py-1 text-xs rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-300 hover:bg-blue-500/25 cursor-pointer disabled:opacity-50"
                            >
                              Resume execution
                            </button>
                          )}
                          {projectDetail.snapshot.plan && (
                            <span className="text-[10px] text-(--vestara-text-muted)">Plan: {projectDetail.snapshot.plan.status}</span>
                          )}
                        </div>

                        <div>
                          <div className="text-xs font-medium text-(--vestara-text-2) mb-2">Tasks</div>
                          <div className="space-y-1">
                            {projectDetail.snapshot.tasks.length === 0 && (
                              <p className="text-xs text-(--vestara-text-muted)">No tasks yet.</p>
                            )}
                            {projectDetail.snapshot.tasks.map((task) => (
                              <div key={task.id} className="flex items-center gap-3 flex-wrap text-xs">
                                <span className="text-(--vestara-text)">{task.summary}</span>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] ${TASK_STATUS_BADGE[task.status] ?? 'bg-zinc-600/20 text-zinc-300'}`}>
                                  {task.status}
                                </span>
                                {task.revisionCount > 0 && <span className="text-(--vestara-text-dim)">{task.revisionCount}r</span>}
                                {task.attemptCount > 0 && <span className="text-(--vestara-text-dim)">{task.attemptCount}a</span>}
                                <span className="text-(--vestara-text-dim)">{task.files.join(', ')}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs font-medium text-(--vestara-text-2) mb-2">Audit trail</div>
                          <div className="space-y-1 max-h-40 overflow-y-auto">
                            {projectDetail.audit.length === 0 && (
                              <p className="text-xs text-(--vestara-text-muted)">No events.</p>
                            )}
                            {projectDetail.audit.map((event) => (
                              <div key={`${event.at}-${event.type}`} className="flex items-center gap-2 text-[10px]">
                                <span className="text-(--vestara-text-dim)">{new Date(event.at).toLocaleTimeString()}</span>
                                <span className="text-(--vestara-text-2)">{event.type.replace('orchestration.', '')}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-(--vestara-text-muted)">Loading detail...</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {createOpen && (
        <VestaraModal onClose={() => setCreateOpen(false)} className="max-w-lg">
          <div className="p-5 space-y-4">
            <h2 className="text-sm font-bold text-(--vestara-text)">New orchestrated project</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-(--vestara-text-2)">Name</span>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-1 w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-(--vestara-accent-border) text-sm text-(--vestara-text) focus:outline-none"
                  placeholder="Feature"
                />
              </label>
              <label className="block">
                <span className="text-xs text-(--vestara-text-2)">Repo path (optional)</span>
                <input
                  value={form.repoPath}
                  onChange={(e) => setForm({ ...form, repoPath: e.target.value })}
                  className="mt-1 w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-(--vestara-accent-border) text-sm text-(--vestara-text) focus:outline-none"
                  placeholder="/repo"
                />
              </label>
            </div>
            <label className="block">
              <span className="text-xs text-(--vestara-text-2)">Goal</span>
              <textarea
                value={form.goal}
                onChange={(e) => setForm({ ...form, goal: e.target.value })}
                className="mt-1 w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-(--vestara-accent-border) text-sm text-(--vestara-text) focus:outline-none"
                rows={2}
                placeholder="What should the agents build?"
              />
            </label>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-(--vestara-text-2)">Tasks</span>
                <button
                  onClick={() => setTaskRows((rows) => [...rows, { summary: '', files: '', capabilities: '' }])}
                  className="text-xs text-(--vestara-accent-text) hover:underline cursor-pointer"
                >
                  + Add task
                </button>
              </div>
              <div className="space-y-2">
                {taskRows.map((row, index) => (
                  <div key={index} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      value={row.summary}
                      onChange={(e) => setTaskRows((rows) => rows.map((r, i) => (i === index ? { ...r, summary: e.target.value } : r)))}
                      className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-(--vestara-accent-border) text-xs text-(--vestara-text) focus:outline-none"
                      placeholder="Task summary"
                    />
                    <input
                      value={row.files}
                      onChange={(e) => setTaskRows((rows) => rows.map((r, i) => (i === index ? { ...r, files: e.target.value } : r)))}
                      className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-(--vestara-accent-border) text-xs text-(--vestara-text) focus:outline-none"
                      placeholder="Files (comma separated)"
                    />
                    <input
                      value={row.capabilities}
                      onChange={(e) => setTaskRows((rows) => rows.map((r, i) => (i === index ? { ...r, capabilities: e.target.value } : r)))}
                      className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-(--vestara-accent-border) text-xs text-(--vestara-text) focus:outline-none"
                      placeholder="Capabilities (comma separated)"
                    />
                  </div>
                ))}
              </div>
            </div>

            {createError && <p className="text-xs text-red-400">{createError}</p>}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setCreateOpen(false)}
                className="px-3 py-1.5 text-xs text-(--vestara-text-2) hover:text-(--vestara-text) cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => void createAndRun()}
                disabled={createBusy}
                className="px-3 py-1.5 text-xs bg-(--vestara-accent) text-white rounded-lg hover:opacity-90 cursor-pointer disabled:opacity-50"
              >
                {createBusy ? 'Creating...' : 'Create & run'}
              </button>
            </div>
          </div>
        </VestaraModal>
      )}
    </div>
  );
}
