import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ArtifactKind } from '@vestara/workflow-orchestrator';
import { StatusIndicator } from '@vestara/ui';
import { WorkspaceTabs } from '../components/ui/WorkspaceTabs';
import { VestaraModal } from '../components/ui/VestaraModal';
import { WorkspacePanelIcon } from '../components/WorkspaceOperationalPanel';
import { WorkflowGraph } from '../components/workflow/WorkflowGraph';
import { WorkflowNodeInspector } from '../components/workflow/WorkflowNodeInspector';
import { WorkflowSupportingPanels } from '../components/workflow/WorkflowSupportingPanels';
import { SectionCard } from '../features/overview/components/SectionCard';
import { navIcon } from '../layouts/workspace-navigation';
import OperationalWorkspaceLayout from '../layouts/OperationalWorkspaceLayout';
import { getNextAction } from '../lib/orchestration-next-action';
import { projectOrchestrationGraph, type OrchestrationGraphSnapshot } from '../lib/orchestration-graph';
import '../styles/workflow-page.css';
import '../styles/activity-room.css';

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

function WorkflowEmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-[var(--vestara-spacing-element)] rounded-[var(--vestara-radius-lg)] border border-dashed border-[var(--vestara-border-subtle)] bg-[color-mix(in_srgb,var(--vestara-surface-panel-raised)_72%,transparent)] px-[var(--vestara-spacing-section)] py-[var(--vestara-spacing-section)] text-center">
      <WorkspacePanelIcon icon={icon} tone="info" />
      <div className="max-w-prose">
        <h2 className="text-[var(--vestara-font-size-sm)] font-semibold text-[var(--vestara-text-primary)]">{title}</h2>
        <p className="mt-[var(--vestara-spacing-element)] text-[var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}

interface WorkflowQuickAction {
  id: string;
  label: string;
  sub: string;
  tile: string;
  glyph: string;
  disabled?: boolean;
  onSelect: () => void;
}

function WorkflowQuickActions({ actions }: { actions: WorkflowQuickAction[] }) {
  return (
    <ul className="grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-4" aria-label="Workflow quick actions">
      {actions.map((action, i) => (
        <li key={action.id} className="mpg-enter" style={{ animationDelay: `${i * 40}ms` }}>
          <button
            type="button"
            onClick={action.onSelect}
            disabled={action.disabled}
            className="mpg-card group flex w-full items-center gap-3 p-3.5 text-left disabled:cursor-not-allowed disabled:opacity-45"
          >
            <span
              aria-hidden="true"
              className="mpg-icon-box text-[var(--ov-solid-on-tile)]"
              style={{
                color: 'var(--ov-solid-on-tile)',
                background: `color-mix(in srgb, ${action.tile} 88%, transparent)`,
                borderColor: `color-mix(in srgb, ${action.tile} 55%, transparent)`,
                boxShadow: `0 0 14px color-mix(in srgb, ${action.tile} 40%, transparent)`,
              }}
            >
              {action.glyph}
            </span>
            <span className="relative z-[2] min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-[var(--vestara-text-primary)]">
                {action.label}
              </span>
              <span className="block truncate text-[11px] text-[var(--vestara-text-muted)]">{action.sub}</span>
            </span>
            <span aria-hidden="true" className="relative z-[2] text-[var(--vestara-marketplace-primary)] transition-transform group-hover:translate-x-0.5">
              ›
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ApprovalActions({ projectId, approvals, busy, onResolve }: {
  projectId: string;
  approvals: ApprovalTask[];
  busy: string | null;
  onResolve: (projectId: string, taskId: string, approved: boolean) => void;
}) {
  if (approvals.length === 0) return null;
  return (
    <div className="mt-3 rounded-lg border border-[var(--vestara-status-warning-border)] bg-[var(--vestara-status-warning-bg)] p-3">
      <div className="text-xs font-medium text-[var(--vestara-status-warning)] mb-2">Approval required</div>
      <div className="space-y-2">
        {approvals.map((task) => (
          <div key={task.id} className="flex items-center gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-[var(--vestara-text-primary)]">{task.summary}</p>
              <p className="text-[10px] text-[var(--vestara-text-muted)]">{task.approvalReason ?? 'high-risk change'}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void onResolve(projectId, task.id, true)}
                disabled={busy === task.id}
                className="px-3 py-1 text-xs rounded-lg bg-[var(--vestara-status-success-bg)] border border-[var(--vestara-status-success-border)] text-[var(--vestara-status-success)] hover:brightness-125 transition-colors cursor-pointer disabled:opacity-50"
              >
                Approve
              </button>
              <button
                onClick={() => void onResolve(projectId, task.id, false)}
                disabled={busy === task.id}
                className="px-3 py-1 text-xs rounded-lg bg-[var(--vestara-status-error-bg)] border border-[var(--vestara-status-error-border)] text-[var(--vestara-status-error)] hover:brightness-125 transition-colors cursor-pointer disabled:opacity-50"
              >
                Deny
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectCards({ projects, metricsByProject, approvalsByProject, expandedId, busy, detail, onToggle, onResolveApproval, onOpenGraph }: {
  projects: ProjectSummary[];
  metricsByProject: Record<string, ProjectMetrics>;
  approvalsByProject: Record<string, ApprovalTask[]>;
  expandedId: string | null;
  busy: string | null;
  detail: Record<string, { snapshot: Snapshot; audit: AuditEvent[] }>;
  onToggle: (projectId: string) => void;
  onResolveApproval: (projectId: string, taskId: string, approved: boolean) => void;
  onOpenGraph: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3">
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
              onClick={() => onToggle(project.id)}
              className="w-full cursor-pointer text-left"
              aria-expanded={expanded}
              aria-label={`${expanded ? 'Collapse' : 'Expand'} ${project.name}`}
            >
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm font-semibold text-[var(--vestara-text-primary)]">{project.name}</h2>
                    <span className="workflow-status-chip" data-status={project.phase}>
                      {project.phase}
                    </span>
                    <span className="workflow-status-chip" data-status={project.status}>
                      {project.status}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--vestara-text-muted)] mt-1 truncate">{project.goal}</p>
                </div>
                {metrics && (
                  <div className="flex items-center gap-3 text-xs text-[var(--vestara-text-secondary)]">
                    <span>{metrics.tasks.completed}/{metrics.tasks.total} tasks</span>
                    <span>·</span>
                    <span>{metrics.retries} retries</span>
                    <span>·</span>
                    <span>{metrics.artifacts} artifacts</span>
                    <span className="text-[var(--vestara-text-muted)]">{expanded ? '▴' : '▾'}</span>
                  </div>
                )}
              </div>
            </button>

            <ApprovalActions projectId={project.id} approvals={approvals} busy={busy} onResolve={onResolveApproval} />

            {expanded && (
              <div className="workflow-project-selection-note">
                {projectDetail ? (
                  <>
                    <span>Selected workflow loaded. Use the tabs for its graph, tasks, and evidence.</span>
                    <button type="button" className="workflow-tab-action" onClick={onOpenGraph}>
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
  );
}

function formatFreshness(timestamp: number | null): string | null {
  if (timestamp === null) return null;
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 5) return 'updated just now';
  if (seconds < 60) return `updated ${seconds}s ago`;
  return `updated ${Math.floor(seconds / 60)}m ago`;
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
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
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
    setUpdatedAt(Date.now());
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

  const nextAction = useMemo(
    () => getNextAction(projects, metricsByProject, approvalsByProject),
    [projects, metricsByProject, approvalsByProject],
  );

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

  const handleNextAction = useCallback(() => {
    if (!nextAction) return;
    const { kind, projectId } = nextAction;
    if (kind === 'plan-approval') {
      void approvePlan(projectId);
      return;
    }
    if (kind === 'resume') {
      void resumeProject(projectId);
      return;
    }
    if (expandedId !== projectId) toggleExpand(projectId);
    if (kind === 'task-failure') setActiveTab('tasks');
    if (kind === 'progress') setActiveTab('workflow-graph');
  }, [nextAction, expandedId, toggleExpand, approvePlan, resumeProject]);

  const nextActionBusy =
    nextAction?.kind === 'plan-approval'
      ? busy === `plan-${nextAction.projectId}`
      : nextAction?.kind === 'resume'
        ? busy === `resume-${nextAction.projectId}`
        : false;

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
  const selectedDone = selectedDetail
    ? selectedDetail.snapshot.tasks.filter((task) => task.status === 'completed').length
    : 0;
  const selectedTotal = selectedDetail ? selectedDetail.snapshot.tasks.length : 0;
  const selectedPct = selectedTotal > 0 ? Math.round((selectedDone / selectedTotal) * 100) : 0;
  const focusProjectTab = (tab: 'workflow-graph' | 'evidence') => {
    const target = expandedId ?? projects[0]?.id;
    if (!target) return;
    if (expandedId !== target) toggleExpand(target);
    if (detail[target]) setActiveTab(tab);
  };
  const reviewApprovals = () => {
    const target = projects.find((project) => (approvalsByProject[project.id] ?? []).length > 0);
    if (target && expandedId !== target.id) toggleExpand(target.id);
  };
  const selectRecommended = () => {
    const target = nextAction?.projectId ?? projects[0]?.id;
    if (target && expandedId !== target) toggleExpand(target);
  };
  const quickActions: WorkflowQuickAction[] = [
    {
      id: 'new',
      label: 'New project',
      sub: 'Start building',
      tile: 'var(--vestara-accent)',
      glyph: '✚',
      onSelect: () => setCreateOpen(true),
    },
    {
      id: 'approvals',
      label: 'Review approvals',
      sub: stats.approvals > 0 ? `${stats.approvals} pending` : 'None pending',
      tile: 'var(--vestara-status-warning)',
      glyph: '!',
      disabled: stats.approvals === 0,
      onSelect: reviewApprovals,
    },
    {
      id: 'graph',
      label: 'Open graph',
      sub: selectedProject?.name ?? 'Select workflow',
      tile: 'var(--vestara-status-info)',
      glyph: '⁂',
      disabled: projects.length === 0,
      onSelect: () => focusProjectTab('workflow-graph'),
    },
    {
      id: 'evidence',
      label: 'View evidence',
      sub: 'Audit + artifacts',
      tile: 'var(--vestara-status-success)',
      glyph: '▤',
      disabled: projects.length === 0,
      onSelect: () => focusProjectTab('evidence'),
    },
  ];
  const workflowTabs = [
    { id: 'overview', label: 'Overview', shortLabel: 'Overview', icon: navIcon('dashboard'), borderBottom: false },
    { id: 'workflow-graph', label: 'Workflow Graph', shortLabel: 'Graph', icon: navIcon('workflows'), borderBottom: false },
    { id: 'tasks', label: 'Tasks', shortLabel: 'Tasks', icon: navIcon('executions'), borderBottom: false },
    { id: 'evidence', label: 'Evidence', shortLabel: 'Evidence', icon: navIcon('artifacts'), borderBottom: false },
  ];

  const blockedCount = dashboard.tasks.failed + dashboard.tasks.blocked;
  const freshness = formatFreshness(updatedAt);
  const heroLive = !loading && dashboard.attention === 0;
  const heroStatusClass = heroLive ? 'ar-status--live' : 'ar-status--warn';
  const heroStatusLabel = loading
    ? 'Loading'
    : dashboard.attention > 0
      ? `${dashboard.attention} need attention`
      : stats.running > 0
        ? 'Live · running'
        : 'Ready';

  return (
    <div className="workflow-page">
        <header className="ar-header px-[var(--vestara-spacing-page)]" aria-label="Workflows controls">
          <div className="ar-header__identity">
            <div className="min-w-0">
              <p className="ar-kicker">Workflow orchestration</p>
              <h1 className="ar-header__title">{selectedProject?.name ?? 'Workflows'}</h1>
              <p className="ar-header__subtitle">
                {loading
                  ? 'Loading current state…'
                  : (selectedProject?.goal ?? `${stats.total} projects · ${dashboard.completion}% task completion`)}
                {freshness ? ` · ${freshness}` : ''}
              </p>
              {selectedProject && (
                <button
                  type="button"
                  className="ar-header__scope"
                  onClick={() => setExpandedId(null)}
                  title="Clear selected workflow"
                >
                  <span>Scope: {selectedProject.name} · {selectedProject.phase}</span>
                  <span aria-hidden="true">×</span>
                </button>
              )}
            </div>
          </div>
          <div className="ar-header__signals" aria-label="Operational summary">
            {dashboard.attention > 0 ? (
              <button
                type="button"
                className="ar-signal ar-signal--attention"
                onClick={handleNextAction}
                disabled={!nextAction}
                title={nextAction ? `Next: ${nextAction.title}` : undefined}
              >
                <strong>{dashboard.attention}</strong>
                <span>needs attention</span>
                {stats.approvals > 0 && <small>{stats.approvals} approvals</small>}
              </button>
            ) : (
              <span className="ar-signal ar-signal--quiet"><strong>0</strong><span>needs attention</span></span>
            )}
            <span className="ar-signal"><strong>{dashboard.tasks.running}</strong><span>running</span></span>
            {blockedCount > 0 && (
              <span className="ar-signal ar-signal--blocked"><strong>{blockedCount}</strong><span>blocked</span></span>
            )}
            {stats.running > 0 ? (
              <span className="ar-signal"><strong>{stats.running}</strong><span>workflows running</span></span>
            ) : (
              stats.total > 0 && (
                <span className="ar-signal ar-signal--quiet"><strong>{stats.total}</strong><span>workflows</span></span>
              )
            )}
            {freshness && <span className="ar-signal ar-signal--quiet"><strong>Data</strong><span>{freshness}</span></span>}
          </div>
          <div className="ar-header__controls">
            <span className={`ar-status ${heroStatusClass}`} role="status" aria-live="polite" title={`Workflows: ${heroStatusLabel}`}>
              <StatusIndicator variant={heroLive ? 'live' : 'warn'} size="xs" pulse={heroLive && stats.running > 0} ariaLabel={`Workflows: ${heroStatusLabel}`} />
              {heroStatusLabel}
            </span>
            <button type="button" className="ar-control-button" onClick={() => setCreateOpen(true)}>
              New project
            </button>
            <button type="button" className="ar-control-button" onClick={() => void refresh()}>
              Refresh
            </button>
            {selectedDetail?.snapshot.phase === 'pending-approval' && expandedId && (
              <button
                type="button"
                className="ar-control-button"
                onClick={() => void approvePlan(expandedId)}
                disabled={busy === `plan-${expandedId}`}
              >
                Approve plan
              </button>
            )}
            {selectedDetail && expandedId && (selectedDetail.snapshot.status === 'running' || selectedDetail.snapshot.status === 'awaiting-approval') && (
              <button
                type="button"
                className="ar-control-button"
                onClick={() => void resumeProject(expandedId)}
                disabled={busy === `resume-${expandedId}`}
              >
                Resume
              </button>
            )}
          </div>
        </header>

        <WorkspaceTabs tabs={workflowTabs} activeTab={activeTab} onTabChange={setActiveTab} ariaLabel="Workflow sections" />
        <OperationalWorkspaceLayout
          rail={
            <aside className="ar-panel workflow-rail" aria-label="Projects">
              <div className="ar-panel__head">
                <span className="ar-panel__label">Projects · {projects.length}</span>
                <button type="button" className="workflow-tab-action" onClick={() => setCreateOpen(true)}>
                  + New
                </button>
              </div>
              {loading ? (
                <div className="space-y-2" role="status" aria-label="Loading projects">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="mpg-skeleton h-20" />
                  ))}
                  <p className="sr-only">Loading projects…</p>
                </div>
              ) : projects.length === 0 ? (
                <WorkflowEmptyState
                  icon={navIcon('workflows')}
                  title="No orchestrated projects yet"
                  description="Draft a goal, gate the risky steps, and let the agents run the waves."
                  action={
                    <button type="button" onClick={() => setCreateOpen(true)} className="workflow-action workflow-action-primary">
                      Create your first project
                    </button>
                  }
                />
              ) : (
                <ProjectCards
                  projects={projects}
                  metricsByProject={metricsByProject}
                  approvalsByProject={approvalsByProject}
                  expandedId={expandedId}
                  busy={busy}
                  detail={detail}
                  onToggle={toggleExpand}
                  onResolveApproval={(projectId, taskId, approved) => void resolveApproval(projectId, taskId, approved)}
                  onOpenGraph={() => setActiveTab('workflow-graph')}
                />
              )}
            </aside>
          }
          context={
            <aside className="ar-panel workflow-context" aria-label="Selected workflow">
              <div className="ar-panel__head">
                <span className="ar-panel__label">Selected workflow</span>
                {selectedProject && (
                  <span className="workflow-status-chip" data-status={selectedProject.status}>
                    {selectedProject.status}
                  </span>
                )}
              </div>
              {!selectedProject ? (
                <WorkflowEmptyState
                  icon={navIcon('workflows')}
                  title="No workflow selected"
                  description="Select a project from the rail to inspect its graph, tasks, and evidence."
                />
              ) : !selectedDetail ? (
                <div className="space-y-2" role="status" aria-label="Loading selected workflow">
                  <div className="mpg-skeleton h-24" />
                  <p className="sr-only">Loading workflow snapshot…</p>
                </div>
              ) : (
                <div className="space-y-[var(--vestara-spacing-section)]">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-[var(--vestara-text-primary)]">{selectedProject.name}</h2>
                    <p className="mt-1 text-xs text-[var(--vestara-text-muted)]">{selectedProject.goal}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="workflow-status-chip" data-status={selectedProject.phase}>
                        {selectedProject.phase}
                      </span>
                      {selectedDetail.snapshot.plan && (
                        <span className="mpg-tag-pill">Plan: {selectedDetail.snapshot.plan.status}</span>
                      )}
                      <span className="mpg-tag-pill">
                        {selectedTotal} tasks · {selectedDetail.snapshot.artifacts?.length ?? 0} artifacts
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-3 text-[11px] text-[var(--vestara-text-muted)]">
                      <span>Task progress</span>
                      <span>{selectedDone} / {selectedTotal} · {selectedPct}%</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--vestara-accent-bg)]">
                      <div
                        className="h-full rounded-full bg-[var(--vestara-status-success)] transition-[width] duration-300"
                        style={{ width: `${selectedPct}%` }}
                      />
                    </div>
                  </div>
                  {selectedGraph && selectedGraph.nodes.length > 0 && (
                    <WorkflowGraph
                      chrome="bare"
                      height={240}
                      showLegend={false}
                      showControls={false}
                      graph={selectedGraph}
                      selectedNodeId={selectedGraphNodeId}
                      onNodeSelect={(node) => setSelectedGraphNodeId(node?.id)}
                    />
                  )}
                  <div className="flex flex-wrap gap-2">
                    {selectedDetail.snapshot.phase === 'pending-approval' && expandedId && (
                      <button
                        type="button"
                        className="ar-control-button"
                        onClick={() => void approvePlan(expandedId)}
                        disabled={busy === `plan-${expandedId}`}
                      >
                        Approve plan
                      </button>
                    )}
                    {selectedDetail.snapshot.status === 'running' || selectedDetail.snapshot.status === 'awaiting-approval' ? (
                      expandedId && (
                        <button
                          type="button"
                          className="ar-control-button"
                          onClick={() => void resumeProject(expandedId)}
                          disabled={busy === `resume-${expandedId}`}
                        >
                          Resume
                        </button>
                      )
                    ) : null}
                    <button type="button" className="ar-control-button" onClick={() => setActiveTab('workflow-graph')}>
                      Open graph
                    </button>
                  </div>
                  <ApprovalActions
                    projectId={selectedProject.id}
                    approvals={approvalsByProject[selectedProject.id] ?? []}
                    busy={busy}
                    onResolve={(projectId, taskId, approved) => void resolveApproval(projectId, taskId, approved)}
                  />
                </div>
              )}
            </aside>
          }
        >
        <div className="space-y-[var(--vestara-spacing-section)]">
          {activeTab === 'workflow-graph' ? (
              selectedDetail ? (
                <div className="space-y-[var(--vestara-spacing-section)]">
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
                </div>
              ) : (
                <WorkflowEmptyState
                  icon={navIcon('workflows')}
                  title="No workflow selected"
                  description="Select a project from the Projects rail to inspect its Workflow graph."
                  action={
                    <button type="button" className="workflow-tab-action" onClick={selectRecommended} disabled={projects.length === 0}>
                      Select a workflow
                    </button>
                  }
                />
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
                <WorkflowEmptyState
                  icon={navIcon('executions')}
                  title="No workflow selected"
                  description="Select a project from the Projects rail to view tasks."
                  action={
                    <button type="button" className="workflow-tab-action" onClick={selectRecommended} disabled={projects.length === 0}>
                      Select a workflow
                    </button>
                  }
                />
              )
            ) : activeTab === 'evidence' ? (
              selectedDetail ? (
                <div>
                  <WorkflowSupportingPanels variant="evidence" audit={selectedDetail.audit} artifacts={selectedDetail.snapshot.artifacts ?? []} />
                </div>
              ) : (
                <WorkflowEmptyState
                  icon={navIcon('artifacts')}
                  title="No workflow selected"
                  description="Select a project from the Projects rail to view artifacts."
                  action={
                    <button type="button" className="workflow-tab-action" onClick={selectRecommended} disabled={projects.length === 0}>
                      Select a workflow
                    </button>
                  }
                />
              )
            ) : (
              <>
                {!loading && <WorkflowQuickActions actions={quickActions} />}
                {!loading && nextAction && (
                  <SectionCard title="Next recommended action" badge={nextAction.projectName} index={0}>
                    <div className="workflow-next-action">
                      <div className="workflow-next-action-text">
                        <strong>{nextAction.title}</strong>
                        <p>{nextAction.detail}</p>
                      </div>
                      <button
                        type="button"
                        className="workflow-action workflow-action-primary"
                        onClick={handleNextAction}
                        disabled={nextActionBusy}
                      >
                        {nextAction.ctaLabel}
                      </button>
                    </div>
                  </SectionCard>
                )}

        {!loading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SectionCard title="Task progress" badge={`${dashboard.tasks.completed} / ${dashboard.tasks.total} tasks`} index={1}>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--vestara-accent-bg)]">
              <div
                className="h-full rounded-full bg-[var(--vestara-status-success)] transition-[width] duration-300"
                style={{ width: `${dashboard.completion}%` }}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-[var(--vestara-text-muted)]">
              <span className="mpg-tag-pill">{dashboard.completion}% complete</span>
              <span className="mpg-tag-pill">{dashboard.tasks.running} running</span>
              <span className="mpg-tag-pill">{dashboard.tasks.blocked} blocked</span>
              <span className="mpg-tag-pill">{dashboard.tasks.failed} failed</span>
              <span className="mpg-tag-pill">{dashboard.tasks.awaitingApproval} awaiting approval</span>
            </div>
          </SectionCard>

          <SectionCard
            title="Projects by phase"
            badge={`${projects.length} project${projects.length === 1 ? '' : 's'}`}
            index={2}
          >
            <div className="flex flex-wrap gap-2">
              {dashboard.phases.length > 0 ? (
                dashboard.phases.map(([phase, count]) => (
                  <span key={phase} className="workflow-status-chip" data-status={phase}>
                    {phase.replaceAll('-', ' ')} · {count}
                  </span>
                ))
              ) : (
                <span className="text-[11px] text-[var(--vestara-text-muted)]">No project phases yet.</span>
              )}
            </div>
          </SectionCard>
        </div>
        )}

        {loading ? (
          <div className="space-y-4" role="status" aria-live="polite" aria-label="Loading workflows">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="mpg-skeleton h-16" />
              ))}
            </div>
            <div className="mpg-skeleton h-36" />
            <p className="sr-only">Loading orchestrated projects…</p>
          </div>
        ) : null}
              </>
            )}
        </div>
        </OperationalWorkspaceLayout>

      {createOpen && (
        <VestaraModal onClose={() => setCreateOpen(false)} className="max-w-lg">
          <div className="p-5 space-y-4">
            <h2 className="text-sm font-bold text-[var(--vestara-text-primary)]">New orchestrated project</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-[var(--vestara-text-secondary)]">Name</span>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-1 w-full px-3 py-1.5 rounded-lg bg-[var(--vestara-surface-canvas)] border border-[var(--vestara-accent-border)] text-sm text-[var(--vestara-text-primary)] focus:outline-none"
                  placeholder="Feature"
                />
              </label>
              <label className="block">
                <span className="text-xs text-[var(--vestara-text-secondary)]">Repo path (optional)</span>
                <input
                  value={form.repoPath}
                  onChange={(e) => setForm({ ...form, repoPath: e.target.value })}
                  className="mt-1 w-full px-3 py-1.5 rounded-lg bg-[var(--vestara-surface-canvas)] border border-[var(--vestara-accent-border)] text-sm text-[var(--vestara-text-primary)] focus:outline-none"
                  placeholder="/repo"
                />
              </label>
            </div>
            <label className="block">
              <span className="text-xs text-[var(--vestara-text-secondary)]">Goal</span>
              <textarea
                value={form.goal}
                onChange={(e) => setForm({ ...form, goal: e.target.value })}
                className="mt-1 w-full px-3 py-1.5 rounded-lg bg-[var(--vestara-surface-canvas)] border border-[var(--vestara-accent-border)] text-sm text-[var(--vestara-text-primary)] focus:outline-none"
                rows={2}
                placeholder="What should the agents build?"
              />
            </label>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-[var(--vestara-text-secondary)]">Tasks</span>
                <button
                  onClick={() => setTaskRows((rows) => [...rows, { summary: '', files: '', capabilities: '' }])}
                  className="text-xs text-[var(--vestara-accent-text)] hover:underline cursor-pointer"
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
                      className="px-3 py-1.5 rounded-lg bg-[var(--vestara-surface-canvas)] border border-[var(--vestara-accent-border)] text-xs text-[var(--vestara-text-primary)] focus:outline-none"
                      placeholder="Task summary"
                    />
                    <input
                      value={row.files}
                      onChange={(e) => setTaskRows((rows) => rows.map((r, i) => (i === index ? { ...r, files: e.target.value } : r)))}
                      className="px-3 py-1.5 rounded-lg bg-[var(--vestara-surface-canvas)] border border-[var(--vestara-accent-border)] text-xs text-[var(--vestara-text-primary)] focus:outline-none"
                      placeholder="Files (comma separated)"
                    />
                    <input
                      value={row.capabilities}
                      onChange={(e) => setTaskRows((rows) => rows.map((r, i) => (i === index ? { ...r, capabilities: e.target.value } : r)))}
                      className="px-3 py-1.5 rounded-lg bg-[var(--vestara-surface-canvas)] border border-[var(--vestara-accent-border)] text-xs text-[var(--vestara-text-primary)] focus:outline-none"
                      placeholder="Capabilities (comma separated)"
                    />
                  </div>
                ))}
              </div>
            </div>

            {createError && <p className="text-xs text-[var(--vestara-status-error)]">{createError}</p>}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setCreateOpen(false)}
                className="px-3 py-1.5 text-xs text-[var(--vestara-text-secondary)] hover:text-[var(--vestara-text-primary)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => void createAndRun()}
                disabled={createBusy}
                className="px-3 py-1.5 text-xs bg-[var(--vestara-accent)] text-[var(--vestara-on-accent)] rounded-lg hover:brightness-110 cursor-pointer disabled:opacity-50"
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
