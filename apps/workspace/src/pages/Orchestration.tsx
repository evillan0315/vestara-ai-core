import { useCallback, useEffect, useMemo, useState } from 'react';
import { Tabs } from '@vestara/ui';
import type { ArtifactKind } from '@vestara/workflow-orchestrator';
import { VestaraModal } from '../components/ui/VestaraModal';
import { WorkflowGraph } from '../components/workflow/WorkflowGraph';
import { WorkflowNodeInspector } from '../components/workflow/WorkflowNodeInspector';
import { WorkflowSupportingPanels } from '../components/workflow/WorkflowSupportingPanels';
import WorkspacePanelLayout from '../layouts/WorkspacePanelLayout';
import { projectOrchestrationGraph, type OrchestrationGraphSnapshot } from '../lib/orchestration-graph';
import '../styles/workflow-page.css';

/**
 * Orchestration — multi-agent workflow projects (ADR-118 / PCS-025).
 *
 * Overview-grammar presentation (VES-OVERVIEW-001): shared PageHero with
 * hero stats, premium mpg-card project list, skeleton + centered empty
 * states. Data flow (create → analyze → plan → architecture → approve →
 * execute), approval gateway actions, and detail loading are unchanged.
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
  plan?: OrchestrationGraphSnapshot['plan'];
  tasks: Array<
    OrchestrationGraphSnapshot['tasks'][number] & {
      description: string;
      files: string[];
      revisionCount: number;
      attemptCount: number;
    }
  >;
  artifacts?: Array<{
    id: string;
    kind: ArtifactKind;
    planId?: string;
    taskId?: string;
    createdAt: string;
  }>;
  phase: string;
  status: string;
}

function projectSnapshotGraph(snapshot: Snapshot): ReturnType<typeof projectOrchestrationGraph> | null {
  try {
    return projectOrchestrationGraph(snapshot);
  } catch {
    return null;
  }
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
  const [selectedGraphNodeId, setSelectedGraphNodeId] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState('overview');
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

  const dashboard = useMemo(() => {
    const projectIds = new Set(projects.map((project) => project.id));
    const metrics = Object.values(metricsByProject).filter((metric) => projectIds.has(metric.projectId));
    const tasks = metrics.reduce(
      (total, metric) => ({
        total: total.total + metric.tasks.total,
        completed: total.completed + metric.tasks.completed,
        running: total.running + metric.tasks.running,
        failed: total.failed + metric.tasks.failed,
        blocked: total.blocked + metric.tasks.blocked,
        awaitingApproval: total.awaitingApproval + metric.tasks.awaitingApproval,
      }),
      { total: 0, completed: 0, running: 0, failed: 0, blocked: 0, awaitingApproval: 0 },
    );
    const phases = projects.reduce<Record<string, number>>((counts, project) => {
      counts[project.phase] = (counts[project.phase] ?? 0) + 1;
      return counts;
    }, {});
    return {
      tasks,
      phases: Object.entries(phases).sort(([, a], [, b]) => b - a),
      completion: tasks.total > 0 ? Math.round((tasks.completed / tasks.total) * 100) : 0,
      attention: tasks.failed + tasks.blocked + tasks.awaitingApproval,
    };
  }, [projects, metricsByProject]);

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

  const selectedProject = projects.find((project) => project.id === expandedId) ?? null;
  const selectedDetail = expandedId ? detail[expandedId] : undefined;
  const selectedGraph = selectedDetail ? projectSnapshotGraph(selectedDetail.snapshot) : null;
  const selectedNode = selectedGraph?.nodes.find((node) => node.id === selectedGraphNodeId) ?? null;
  const selectedTask = selectedNode?.kind === 'task'
    ? selectedDetail?.snapshot.tasks.find((task) => task.id === selectedNode.source.id)
    : undefined;
  const selectedProgress = selectedDetail
    ? selectedDetail.snapshot.tasks.length > 0
      ? Math.round(
          (selectedDetail.snapshot.tasks.filter((task) => task.status === 'completed').length /
            selectedDetail.snapshot.tasks.length) *
            100,
        )
      : 0
    : null;
  const workflowTabs = [
    { id: 'overview', label: 'Overview', shortLabel: 'Overview' },
    { id: 'workflow-graph', label: 'Workflow Graph', shortLabel: 'Graph' },
    { id: 'tasks', label: 'Tasks', shortLabel: 'Tasks' },
    { id: 'executions', label: 'Executions', shortLabel: 'Exec.', disabled: true },
    { id: 'evidence', label: 'Evidence', shortLabel: 'Evidence' },
    { id: 'configuration', label: 'Configuration', shortLabel: 'Config.', disabled: true },
  ];

  return (
    <WorkspacePanelLayout>
      <h1 className="sr-only">Workflows</h1>
      <div className="w-full min-w-0 space-y-4">
        <header className="workflow-page-header">
          <div className="workflow-page-header-main">
            <p className="workflow-eyebrow">Workflow orchestration</p>
            <h2 className="workflow-page-title">{selectedProject?.name ?? 'Workflows'}</h2>
            <p className="workflow-page-description">
              {selectedProject?.goal ?? 'Plan, inspect, and monitor authoritative WorkflowOrchestrator projects.'}
            </p>
            <div className="workflow-page-meta">
              <span className="workflow-status-chip" data-status={selectedProject?.status}>{selectedProject?.status ?? `${stats.total} projects`}</span>
              {selectedProject && <span>Phase: {selectedProject.phase}</span>}
              {selectedDetail?.snapshot.plan && <span>Plan: {selectedDetail.snapshot.plan.status}</span>}
            </div>
            {selectedDetail && (
              <>
                <div className="workflow-progress-block">
                  <div className="workflow-progress-label">
                    <span>Task progress</span>
                    <strong>{selectedProgress}%</strong>
                  </div>
                  <div className="workflow-progress-track" aria-label={`${selectedProgress}% task progress`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={selectedProgress ?? 0}>
                    <span style={{ width: `${selectedProgress}%` }} />
                  </div>
                </div>
                <div className="workflow-summary-row" aria-label="Workflow summary">
                <div className="workflow-summary-card"><span>Tasks</span><strong>{selectedDetail.snapshot.tasks.length}</strong></div>
                <div className="workflow-summary-card"><span>Artifacts</span><strong>{selectedDetail.snapshot.artifacts?.length ?? 0}</strong></div>
                </div>
              </>
            )}
          </div>
          <div className="workflow-page-actions">
            <button type="button" className="workflow-action workflow-action-primary" onClick={() => setCreateOpen(true)}>
              New project
            </button>
            <button type="button" className="workflow-action" onClick={() => void refresh()}>
              Refresh
            </button>
            {selectedDetail?.snapshot.phase === 'pending-approval' && expandedId && (
              <button type="button" className="workflow-action" onClick={() => void approvePlan(expandedId)} disabled={busy === `plan-${expandedId}`}>
                Approve plan
              </button>
            )}
            {selectedDetail && expandedId && (selectedDetail.snapshot.status === 'running' || selectedDetail.snapshot.status === 'awaiting-approval') && (
              <button type="button" className="workflow-action" onClick={() => void resumeProject(expandedId)} disabled={busy === `resume-${expandedId}`}>
                Resume
              </button>
            )}
          </div>
        </header>

        <Tabs tabs={workflowTabs} activeTab={activeTab} onTabChange={setActiveTab}>
          <div className="workflow-tab-content">
            {activeTab === 'workflow-graph' ? (
              selectedDetail ? (
                <>
                  <div className="workflow-graph-composition">
                    <WorkflowGraph
                      graph={selectedGraph}
                      error={selectedGraph ? undefined : 'Workflow graph is unavailable until a plan exists.'}
                      selectedNodeId={selectedGraphNodeId}
                      onNodeSelect={(node) => setSelectedGraphNodeId(node?.id)}
                    />
                    <WorkflowNodeInspector
                      node={selectedNode}
                      task={selectedTask ? { description: selectedTask.description, planId: selectedTask.planId, dependencies: selectedTask.dependencies } : undefined}
                    />
                  </div>
                  <WorkflowSupportingPanels audit={selectedDetail.audit} artifacts={selectedDetail.snapshot.artifacts ?? []} />
                </>
              ) : (
                <div className="workflow-panel workflow-panel-empty p-[var(--vestara-spacing-page)]">
                  Select a project from Overview to inspect its Workflow graph.
                </div>
              )
            ) : activeTab === 'tasks' ? (
              selectedDetail ? (
                <div className="workflow-task-list" aria-label="Workflow tasks">
                  {selectedDetail.snapshot.tasks.length === 0 ? (
                    <div className="workflow-panel workflow-panel-empty p-[var(--vestara-spacing-page)]">No tasks are available in this snapshot.</div>
                  ) : selectedDetail.snapshot.tasks.map((task) => (
                    <button
                      type="button"
                      className="workflow-task-row"
                      key={task.id}
                      onClick={() => {
                        setSelectedGraphNodeId(`workflow-task:${task.id}`);
                        setActiveTab('workflow-graph');
                      }}
                    >
                      <span className="workflow-task-row-main">
                        <strong>{task.summary}</strong>
                        {task.description && <small>{task.description}</small>}
                        <span className="workflow-task-row-meta">
                          <span className="workflow-status-chip" data-status={task.status}>{task.status}</span>
                          <span>{task.dependencies.length} prerequisite{task.dependencies.length === 1 ? '' : 's'}</span>
                          <span>{(selectedDetail.snapshot.artifacts ?? []).filter((artifact) => artifact.taskId === task.id).length} artifacts</span>
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="workflow-panel workflow-panel-empty p-[var(--vestara-spacing-page)]">Select a project from Overview to view tasks.</div>
              )
            ) : activeTab === 'evidence' ? (
              selectedDetail ? (
                <div>
                  <WorkflowSupportingPanels variant="evidence" audit={selectedDetail.audit} artifacts={selectedDetail.snapshot.artifacts ?? []} />
                </div>
              ) : (
                <div className="workflow-panel workflow-panel-empty p-[var(--vestara-spacing-page)]">Select a project from Overview to view artifacts.</div>
              )
            ) : (
              <>

        <section aria-labelledby="workflow-dashboard-title" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--vestara-accent)]">
                Operational overview
              </p>
              <h2 id="workflow-dashboard-title" className="mt-1 text-base font-semibold text-[var(--vestara-text-primary)]">
                Workflow pulse
              </h2>
            </div>
            <span className="text-[11px] text-[var(--vestara-text-muted)]">
              {loading ? 'Loading current state…' : `${dashboard.completion}% task completion`}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: 'Total tasks', value: dashboard.tasks.total, tone: 'var(--vestara-accent)' },
              { label: 'Completed', value: dashboard.tasks.completed, tone: 'var(--vestara-status-success)' },
              { label: 'Running now', value: dashboard.tasks.running, tone: 'var(--vestara-status-info)' },
              { label: 'Needs attention', value: dashboard.attention, tone: 'var(--vestara-status-warning)' },
            ].map((item) => (
              <div key={item.label} className="mpg-card min-w-0 p-4">
                <span className="mpg-card-accent" style={{ background: item.tone }} aria-hidden="true" />
                <div className="relative z-[2]">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--vestara-text-muted)]">
                    {item.label}
                  </p>
                  <p className="mt-2 text-2xl font-bold text-[var(--vestara-text-primary)]">{loading ? '—' : item.value}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,1fr)]">
            <div className="mpg-card p-4">
              <div className="relative z-[2]">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xs font-semibold text-[var(--vestara-text-primary)]">Task progress</h3>
                  <span className="text-[11px] text-[var(--vestara-text-muted)]">
                    {dashboard.tasks.completed} / {dashboard.tasks.total}
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--vestara-accent-bg)]">
                  <div
                    className="h-full rounded-full bg-[var(--vestara-status-success)] transition-[width] duration-300"
                    style={{ width: `${dashboard.completion}%` }}
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-[var(--vestara-text-muted)]">
                  <span className="mpg-tag-pill">{dashboard.tasks.running} running</span>
                  <span className="mpg-tag-pill">{dashboard.tasks.blocked} blocked</span>
                  <span className="mpg-tag-pill">{dashboard.tasks.failed} failed</span>
                  <span className="mpg-tag-pill">{dashboard.tasks.awaitingApproval} awaiting approval</span>
                </div>
              </div>
            </div>

            <div className="mpg-card p-4">
              <div className="relative z-[2]">
                <h3 className="text-xs font-semibold text-[var(--vestara-text-primary)]">Projects by phase</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {dashboard.phases.length > 0 ? (
                    dashboard.phases.map(([phase, count]) => (
                      <span key={phase} className={`rounded-full border px-2 py-1 text-[10px] ${PHASE_BADGE[phase] ?? PHASE_BADGE.draft}`}>
                        {phase.replaceAll('-', ' ')} · {count}
                      </span>
                    ))
                  ) : (
                    <span className="text-[11px] text-[var(--vestara-text-muted)]">No project phases yet.</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="space-y-3" role="status" aria-live="polite" aria-label="Loading workflows">
            <div className="mpg-skeleton h-10 w-48" />
            <div className="mpg-skeleton h-36" />
            <div className="mpg-skeleton h-36" />
            <p className="sr-only">Loading orchestrated projects…</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <div className="mb-3 text-4xl" aria-hidden="true">
                ⚙
              </div>
              <h2 className="text-lg font-semibold text-[var(--vestara-text-primary)]">No orchestrated projects yet</h2>
              <p className="mt-1 text-sm text-[var(--vestara-text-secondary)]">
                Draft a goal, gate the risky steps, and let the agents run the waves.
              </p>
              <button
                onClick={() => setCreateOpen(true)}
                className="mpg-install-btn mt-4"
              >
                Create your first project
              </button>
            </div>
          </div>
        ) : (
          <section aria-label="Projects">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-[13px] font-semibold text-[var(--vestara-text-primary)]">
                Projects{' '}
                <span className="mpg-tag-pill ml-1">{projects.length}</span>
              </h2>
              <span className="text-[11px] text-[var(--vestara-text-muted)]">Expand a card for tasks, audit, and approvals</span>
            </div>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {projects.map((project, i) => {
                const metrics = metricsByProject[project.id];
                const approvals = approvalsByProject[project.id] ?? [];
                const expanded = expandedId === project.id;
                const projectDetail = detail[project.id];
                return (
                  <div
                    key={project.id}
                    className="mpg-card mpg-enter min-w-0 p-4"
                    style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
                  >
                    <button
                      onClick={() => toggleExpand(project.id)}
                      className="w-full cursor-pointer text-left"
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

                {expanded && (
                  <div className="workflow-project-selection-note">
                    {projectDetail ? (
                      <>
                        <span>Selected workflow loaded. Use the tabs for its graph, tasks, and evidence.</span>
                        <button type="button" className="workflow-tab-action" onClick={() => setActiveTab('workflow-graph')}>
                          Open graph
                        </button>
                      </>
                    ) : (
                      <span>Loading workflow snapshot...</span>
                    )}
                  </div>
                )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
              </>
            )}
          </div>
        </Tabs>
      </div>

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
    </WorkspacePanelLayout>
  );
}
