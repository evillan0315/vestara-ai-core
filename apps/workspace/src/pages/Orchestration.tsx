import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ArtifactKind } from '@vestara/workflow-orchestrator';
import { Badge, Button, EmptyState, Input, StatusIndicator, Tabs } from '@vestara/ui';
import { Modal, OperationalPanel, ProgressBar, StatCard } from '@vestara/ui-components';
import { WorkspaceTabs } from '../components/ui/WorkspaceTabs';
import { WorkflowGraph } from '../components/workflow/WorkflowGraph';
import { WorkflowSupportingPanels } from '../components/workflow/WorkflowSupportingPanels';
import { navIcon } from '../layouts/workspace-navigation';
import OperationalWorkspaceLayout from '../layouts/OperationalWorkspaceLayout';
import { getNextAction, getNextActions, getProjectAction } from '../lib/orchestration-next-action';
import { projectOrchestrationGraph, type OrchestrationGraphSnapshot } from '../lib/orchestration-graph';
import '../styles/workflow-page.css';
import '../styles/activity-room.css';

/**
 * Orchestration — multi-agent workflow projects (ADR-118 / PCS-025).
 *
 * Restructured shell (Vestara-Workflow-Orchestration-Restructured template):
 * PageHero header → toolbar (search + status filters) → tabbed 3-pane shell
 * (projects rail / graph canvas / selected-workflow inspector) with
 * authoritative + blocker footer bars. Composed from @vestara/ui primitives
 * (PageHero, Tabs via WorkspaceTabs, Button, Badge, Input, EmptyState) and
 * @vestara/ui-components chrome (OperationalPanel, StatCard, ProgressBar,
 * Modal). Data flow (create → analyze → plan → architecture → approve →
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

type RailStatusFilter = 'all' | 'running' | 'blocked' | 'completed' | 'attention';

const RAIL_FILTERS: Array<{ id: RailStatusFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'running', label: 'Running' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'completed', label: 'Completed' },
  { id: 'attention', label: 'Needs approval' },
];

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
    <ul className="grid list-none grid-cols-2 gap-[var(--vestara-spacing-3)] p-0 md:grid-cols-4" aria-label="Workflow quick actions">
      {actions.map((action, i) => (
        <li key={action.id} className="mpg-enter" style={{ animationDelay: `${i * 40}ms` }}>
          <button
            type="button"
            onClick={action.onSelect}
            disabled={action.disabled}
            className="mpg-card group flex w-full items-center gap-[var(--vestara-spacing-3)] p-3.5 text-left disabled:cursor-not-allowed disabled:opacity-45"
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
              <span className="block truncate text-[length:var(--vestara-font-size-sm)] font-semibold text-[var(--vestara-text-primary)]">
                {action.label}
              </span>
              <span className="block truncate text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">{action.sub}</span>
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
    <div className="mt-[var(--vestara-spacing-3)] rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-status-warning-border)] bg-[var(--vestara-status-warning-bg)] p-[var(--vestara-spacing-3)]">
      <div className="text-xs font-medium text-[var(--vestara-status-warning)] mb-[var(--vestara-spacing-2)]">Approval required</div>
      <div className="space-y-[var(--vestara-spacing-2)]">
        {approvals.map((task) => (
          <div key={task.id} className="flex items-center gap-[var(--vestara-spacing-3)] flex-wrap">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-[var(--vestara-text-primary)]">{task.summary}</p>
              <p className="text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">{task.approvalReason ?? 'high-risk change'}</p>
            </div>
            <div className="flex items-center gap-[var(--vestara-spacing-2)]">
              <button
                onClick={() => void onResolve(projectId, task.id, true)}
                disabled={busy === task.id}
                className="px-[var(--vestara-spacing-3)] py-[var(--vestara-spacing-1)] text-xs rounded-[var(--vestara-radius-lg)] bg-[var(--vestara-status-success-bg)] border border-[var(--vestara-status-success-border)] text-[var(--vestara-status-success)] hover:brightness-125 transition-colors cursor-pointer disabled:opacity-50"
              >
                Approve
              </button>
              <button
                onClick={() => void onResolve(projectId, task.id, false)}
                disabled={busy === task.id}
                className="px-[var(--vestara-spacing-3)] py-[var(--vestara-spacing-1)] text-xs rounded-[var(--vestara-radius-lg)] bg-[var(--vestara-status-error-bg)] border border-[var(--vestara-status-error-border)] text-[var(--vestara-status-error)] hover:brightness-125 transition-colors cursor-pointer disabled:opacity-50"
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

function NextActionButton({ kind, projectId, actionable, onSelect }: {
  kind: string;
  projectId: string;
  actionable: boolean;
  onSelect: (projectId: string, kind: string) => void;
}) {
  const label = kind === 'task-approval'
    ? 'Review approvals'
    : kind === 'task-failure'
      ? 'Open tasks'
      : kind === 'plan-approval'
        ? 'Approve plan'
        : kind === 'resume'
          ? 'Resume'
          : kind === 'progress'
            ? 'Open graph'
            : 'View project';
  return (
    <Button
      variant={actionable ? 'primary' : 'secondary'}
      size="sm"
      onClick={() => onSelect(projectId, kind)}
    >
      {label}
    </Button>
  );
}

function NextActionsPanel({ actions, onSelect }: {
  actions: ReturnType<typeof getNextActions>;
  onSelect: (projectId: string, kind: string) => void;
}) {
  if (actions.length === 0) {
    return (
      <div className="space-y-[var(--vestara-spacing-section)]">
        <p className="font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
          No recommended actions across workflows.
        </p>
      </div>
    );
  }
  const actionable = actions.filter((a) => a.actionable);
  const observational = actions.filter((a) => !a.actionable);
  return (
    <div className="space-y-[var(--vestara-spacing-section)]">
      {actionable.length > 0 && (
        <div className="space-y-[var(--vestara-spacing-2)]">
          <div className="font-mono text-[length:var(--vestara-font-size-xs)] font-semibold uppercase tracking-widest text-[var(--vestara-status-warning)]">
            Action needed · {actionable.length}
          </div>
          {actionable.map((action) => (
            <div
              key={`${action.projectId}-${action.kind}`}
              className="rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-status-warning-border)] bg-[var(--vestara-status-warning-bg)] p-[var(--vestara-spacing-3)]"
            >
              <div className="flex items-start justify-between gap-[var(--vestara-spacing-2)]">
                <div className="min-w-0 flex-1">
                  <p className="text-[length:var(--vestara-font-size-xs)] font-semibold text-[var(--vestara-text-primary)]">
                    {action.title}
                  </p>
                  <p className="mt-0.5 text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
                    {action.detail}
                  </p>
                </div>
                <NextActionButton
                  kind={action.kind}
                  projectId={action.projectId}
                  actionable={action.actionable}
                  onSelect={onSelect}
                />
              </div>
            </div>
          ))}
        </div>
      )}
      {observational.length > 0 && (
        <div className="space-y-[var(--vestara-spacing-2)]">
          <div className="font-mono text-[length:var(--vestara-font-size-xs)] font-semibold uppercase tracking-widest text-[var(--vestara-text-muted)]">
            Suggested · {observational.length}
          </div>
          {observational.map((action) => (
            <div
              key={`${action.projectId}-${action.kind}`}
              className="flex items-center justify-between gap-[var(--vestara-spacing-2)] rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] px-[var(--vestara-spacing-3)] py-[var(--vestara-spacing-2)]"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-secondary)]">
                  {action.title}
                </p>
              </div>
              <NextActionButton
                kind={action.kind}
                projectId={action.projectId}
                actionable={action.actionable}
                onSelect={onSelect}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCards({ projects, metricsByProject, approvalsByProject, projectActions, expandedId, busy, detail, onToggle, onResolveApproval, onOpenGraph }: {
  projects: ProjectSummary[];
  metricsByProject: Record<string, ProjectMetrics>;
  approvalsByProject: Record<string, ApprovalTask[]>;
  projectActions: Record<string, ReturnType<typeof getProjectAction>>;
  expandedId: string | null;
  busy: string | null;
  detail: Record<string, { snapshot: Snapshot; audit: AuditEvent[] }>;
  onToggle: (projectId: string) => void;
  onResolveApproval: (projectId: string, taskId: string, approved: boolean) => void;
  onOpenGraph: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-[var(--vestara-spacing-3)]">
      {projects.map((project, i) => {
        const metrics = metricsByProject[project.id];
        const approvals = approvalsByProject[project.id] ?? [];
        const action = projectActions[project.id];
        const expanded = expandedId === project.id;
        const projectDetail = detail[project.id];
        const done = metrics?.tasks.completed ?? 0;
        const total = metrics?.tasks.total ?? 0;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        const actionableCount = action?.actionable ? 1 : 0;
        return (
          <div
            key={project.id}
            className="mpg-card mpg-enter min-w-0 p-[var(--vestara-spacing-4)]"
            style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
          >
            <div className="flex items-start justify-between gap-[var(--vestara-spacing-2)]">
              <h2 className="min-w-0 flex-1 truncate text-[length:var(--vestara-font-size-sm)] font-semibold text-[var(--vestara-text-primary)]">
                {project.name}
              </h2>
              <div className="flex shrink-0 items-center gap-[var(--vestara-spacing-element)]">
                {action?.actionable && (
                  <span
                    className="inline-flex items-center gap-[var(--vestara-spacing-1)] rounded-[var(--vestara-radius-full)] border border-[var(--vestara-status-warning-border)] bg-[var(--vestara-status-warning-bg)] px-[var(--vestara-spacing-element)] py-0.5 font-mono text-[length:var(--vestara-font-size-xs)] font-semibold text-[var(--vestara-status-warning)]"
                    title={action.title}
                  >
                    ⚡ {actionableCount}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onToggle(project.id)}
                  className="shrink-0 cursor-pointer rounded-[var(--vestara-radius)] px-[var(--vestara-spacing-1)] font-mono text-[var(--vestara-text-muted)] hover:text-[var(--vestara-text-primary)]"
                  aria-expanded={expanded}
                  aria-label={`${expanded ? 'Collapse' : 'Expand'} ${project.name}`}
                >
                  ⋯
                </button>
              </div>
            </div>
            <div className="mt-[var(--vestara-spacing-2)] flex flex-wrap items-center gap-[var(--vestara-spacing-element)]">
              <span className="workflow-status-chip" data-status={project.phase}>
                {project.phase.replaceAll('-', ' ')}
              </span>
              <span className="workflow-status-chip" data-status={project.status}>
                {project.status.replaceAll('-', ' ')}
              </span>
            </div>
            <p className="mt-[var(--vestara-spacing-2)] line-clamp-3 text-[length:var(--vestara-font-size-xs)] leading-relaxed text-[var(--vestara-text-muted)]">
              {project.goal}
            </p>
            {metrics && (
              <p className="mt-[var(--vestara-spacing-2)] font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-secondary)]">
                {done}/{total} tasks · {metrics.retries} retries · {metrics.artifacts} artifacts
              </p>
            )}
            {metrics && (
              <div className="mt-[var(--vestara-spacing-2)]">
                <ProgressBar pct={pct} size="sm" />
              </div>
            )}
            <div className="mt-[var(--vestara-spacing-2)] flex items-center justify-between gap-[var(--vestara-spacing-2)]">
              <span className="font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
                Task progress {done}/{total} {pct}%
              </span>
              <Button variant="ghost" size="sm" onClick={onOpenGraph}>
                Open graph
              </Button>
            </div>

            {action && !expanded && (
              <div
                className={`mt-[var(--vestara-spacing-2)] flex items-center justify-between gap-[var(--vestara-spacing-2)] rounded-[var(--vestara-radius-lg)] border px-2.5 py-[var(--vestara-spacing-element)] ${
                  action.actionable
                    ? 'border-[var(--vestara-status-warning-border)] bg-[var(--vestara-status-warning-bg)]'
                    : 'border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)]'
                }`}
                role="status"
              >
                <span
                  className={`truncate text-[length:var(--vestara-font-size-xs)] ${
                    action.actionable
                      ? 'text-[var(--vestara-status-warning)]'
                      : 'text-[var(--vestara-text-secondary)]'
                  }`}
                >
                  {action.actionable ? '⚡' : 'ℹ'} {action.title}
                </span>
                <button
                  type="button"
                  onClick={() => onToggle(project.id)}
                  className="shrink-0 cursor-pointer font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-accent-text)] hover:underline"
                >
                  {action.ctaLabel}
                </button>
              </div>
            )}

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

type StatusTone = 'default' | 'success' | 'warning' | 'error' | 'info';

/** Maps an orchestrator status/phase string to a Badge tone. */
function statusTone(status: string): StatusTone {
  switch (status) {
    case 'running':
    case 'completed':
    case 'approved':
      return 'success';
    case 'blocked':
    case 'failed':
    case 'cancelled':
      return 'error';
    case 'awaiting-approval':
    case 'pending-approval':
    case 'awaiting-verification':
      return 'warning';
    case 'executing':
    case 'verifying':
      return 'info';
    default:
      return 'default';
  }
}

function formatElapsed(elapsedMs: number | undefined): string | null {
  if (elapsedMs === undefined || elapsedMs < 0) return null;
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
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
  const [inspectorTab, setInspectorTab] = useState<'overview' | 'node' | 'audit' | 'blocker' | 'actions'>('node');
  const [form, setForm] = useState({ name: '', goal: '', repoPath: '' });
  const [taskRows, setTaskRows] = useState<TaskRow[]>([{ summary: '', files: '', capabilities: '' }]);
  const [railQuery, setRailQuery] = useState('');
  const [railFilter, setRailFilter] = useState<RailStatusFilter>('all');
  const [bannerDismissed, setBannerDismissed] = useState(false);

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

  const allNextActions = useMemo(
    () => getNextActions(projects, metricsByProject, approvalsByProject),
    [projects, metricsByProject, approvalsByProject],
  );

  const projectActions = useMemo(() => {
    const map: Record<string, ReturnType<typeof getProjectAction>> = {};
    for (const project of projects) {
      map[project.id] = getProjectAction(project, metricsByProject[project.id], approvalsByProject[project.id]);
    }
    return map;
  }, [projects, metricsByProject, approvalsByProject]);

  const nextActionBanner = useMemo(() => {
    if (!nextAction || bannerDismissed) return null;
    // Don't show the empty-state synthetic action as a banner — it belongs in the empty state.
    if (projects.length === 0) return null;
    return nextAction;
  }, [nextAction, bannerDismissed, projects.length]);

  const visibleProjects = useMemo(() => {
    const needle = railQuery.trim().toLowerCase();
    return projects.filter((project) => {
      if (needle && !`${project.name} ${project.goal} ${project.phase} ${project.status}`.toLowerCase().includes(needle)) {
        return false;
      }
      const metrics = metricsByProject[project.id];
      const approvals = approvalsByProject[project.id] ?? [];
      switch (railFilter) {
        case 'running':
          return project.status === 'running' || (metrics?.tasks.running ?? 0) > 0;
        case 'blocked':
          return (metrics?.tasks.failed ?? 0) + (metrics?.tasks.blocked ?? 0) > 0;
        case 'completed':
          return project.status === 'completed';
        case 'attention':
          return approvals.length > 0;
        default:
          return true;
      }
    });
  }, [projects, metricsByProject, approvalsByProject, railQuery, railFilter]);

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
    // Empty-state synthetic action — open the create modal.
    if (kind === 'start' && !projectId) {
      setCreateOpen(true);
      return;
    }
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
    if (kind === 'start') setActiveTab('overview');
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
  const evidenceCount = (selectedDetail?.snapshot.artifacts?.length ?? 0) + (selectedDetail?.audit.length ?? 0);
  const runElapsed = selectedProject ? formatElapsed(metricsByProject[selectedProject.id]?.elapsedMs) : null;
  const selectedBlockerCount =
    (approvalsByProject[selectedProject?.id ?? ''] ?? []).length +
    (selectedDetail?.snapshot.tasks.filter((task) => task.status === 'blocked' || task.status === 'failed').length ?? 0);
  const inspectorActionCount = allNextActions.filter((action) => action.actionable).length;
  const workflowTabs = [
    { id: 'overview', label: 'Overview', shortLabel: 'Overview', icon: navIcon('dashboard'), borderBottom: false },
    {
      id: 'workflow-graph',
      label: 'Workflow graph',
      shortLabel: 'Graph',
      icon: navIcon('workflows'),
      borderBottom: false,
      badge: selectedGraph ? selectedGraph.nodes.length : undefined,
    },
    {
      id: 'tasks',
      label: 'Tasks',
      shortLabel: 'Tasks',
      icon: navIcon('executions'),
      borderBottom: false,
      badge: selectedDetail ? selectedTotal : undefined,
    },
    {
      id: 'evidence',
      label: 'Evidence',
      shortLabel: 'Evidence',
      icon: navIcon('artifacts'),
      borderBottom: false,
      badge: selectedDetail ? evidenceCount : undefined,
    },
  ];
  const inspectorTabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'node', label: 'Node' },
    { id: 'audit', label: 'Audit', badge: selectedDetail && selectedDetail.audit.length > 0 ? selectedDetail.audit.length : undefined },
    { id: 'blocker', label: 'Blockers', badge: selectedBlockerCount > 0 ? selectedBlockerCount : undefined },
    { id: 'actions', label: 'Actions', badge: inspectorActionCount > 0 ? inspectorActionCount : undefined },
  ] as const;

  const blockedCount = dashboard.tasks.failed + dashboard.tasks.blocked;
  const freshness = formatFreshness(updatedAt);
  const heroStatusLabel = loading
    ? 'Loading'
    : dashboard.attention > 0
      ? `${dashboard.attention} need attention`
      : stats.running > 0
        ? 'Live · running'
        : 'Ready';

  const heroActions: Array<{ label: string; onClick: () => void; primary?: boolean; disabled?: boolean; title?: string }> = [
    { label: 'New project', onClick: () => setCreateOpen(true), primary: true },
    { label: 'Refresh', onClick: () => void refresh() },
    ...(selectedDetail?.snapshot.phase === 'pending-approval' && expandedId
      ? [{ label: 'Approve plan', onClick: () => void approvePlan(expandedId) }]
      : []),
    ...(selectedDetail && expandedId && (selectedDetail.snapshot.status === 'running' || selectedDetail.snapshot.status === 'awaiting-approval')
      ? [{ label: 'Resume', onClick: () => void resumeProject(expandedId) }]
      : []),
  ];

  return (
    <div className="workflow-page">
        <div className="flex flex-wrap items-start justify-between gap-[var(--vestara-spacing-3)]" aria-label="Workflow header">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-[var(--vestara-spacing-2)]">
              <h1 className="max-w-xl truncate text-[length:var(--vestara-font-size-lg)] font-semibold tracking-tight text-[var(--vestara-text-primary)]">
                {selectedProject?.name ?? 'Workflows'}
              </h1>
              {selectedProject && (
                <>
                  <Badge variant="default" size="sm">
                    Scope
                  </Badge>
                  <button
                    type="button"
                    onClick={() => setExpandedId(null)}
                    title="Clear selected workflow"
                    className="max-w-64 truncate cursor-pointer font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)] hover:text-[var(--vestara-text-primary)]"
                  >
                    {selectedProject.id}
                    {runElapsed ? ` · ${runElapsed}` : ''} ✕
                  </button>
                </>
              )}
            </div>
            <p className="mt-[var(--vestara-spacing-1)] max-w-2xl truncate text-[length:var(--vestara-font-size-sm)] text-[var(--vestara-text-muted)]">
              {loading ? 'Loading current state…' : (selectedProject?.goal ?? 'Validate end-to-end multi-agent orchestration')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-[var(--vestara-spacing-2)]">
            <button
              type="button"
              onClick={handleNextAction}
              disabled={!nextAction}
              title={nextAction ? `Next: ${nextAction.title}` : undefined}
              className="cursor-pointer rounded-[var(--vestara-radius-full)] border border-[var(--vestara-status-warning-border)] bg-[var(--vestara-status-warning-bg)] px-[var(--vestara-spacing-3)] py-[var(--vestara-spacing-element)] font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-status-warning)] transition-colors hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-50"
            >
              ● {dashboard.attention} needs attention
            </button>
            <span className="rounded-[var(--vestara-radius-full)] border border-[var(--vestara-status-info-border)] bg-[var(--vestara-status-info-bg)] px-[var(--vestara-spacing-3)] py-[var(--vestara-spacing-element)] font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-status-info)]">
              ● {dashboard.tasks.running} running
            </span>
            <span className="rounded-[var(--vestara-radius-full)] border border-[var(--vestara-accent-border)] bg-transparent px-[var(--vestara-spacing-3)] py-[var(--vestara-spacing-element)] font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-accent-text)]">
              {stats.running} workflows running
            </span>
            {freshness && (
              <span className="font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
                Data {freshness}
              </span>
            )}
            {freshness && (
              <span className="font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
                Data updated {freshness.replace('updated ', '')}
              </span>
            )}
            <span
              className="inline-flex items-center gap-[var(--vestara-spacing-element)] rounded-[var(--vestara-radius-full)] border border-[var(--vestara-status-success-border)] bg-[var(--vestara-status-success-bg)] px-[var(--vestara-spacing-3)] py-[var(--vestara-spacing-element)] font-mono text-[length:var(--vestara-font-size-xs)] font-semibold uppercase tracking-wide text-[var(--vestara-status-success)]"
              role="status"
              aria-live="polite"
              title={`Workflows: ${heroStatusLabel}`}
            >
              <StatusIndicator variant={loading ? 'idle' : dashboard.attention > 0 ? 'warn' : 'live'} size="xs" pulse={stats.running > 0} ariaLabel={`Workflows: ${heroStatusLabel}`} />
              {loading ? 'Loading' : stats.running > 0 ? 'Live running' : heroStatusLabel}
            </span>
            {heroActions.map((action) => (
              <Button
                key={action.label}
                variant={action.primary ? 'primary' : 'secondary'}
                size="sm"
                onClick={action.onClick}
                disabled={action.disabled}
                title={action.title}
              >
                {action.label}
              </Button>
            ))}
          </div>
        </div>

        {nextActionBanner && (
          <div
            className="mpg-enter flex flex-wrap items-center gap-[var(--vestara-spacing-3)] rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-status-warning-border)] bg-[var(--vestara-status-warning-bg)] p-[var(--vestara-spacing-3)]"
            role="alert"
            aria-label="Next recommended action"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[length:var(--vestara-font-size-sm)] font-semibold text-[var(--vestara-text-primary)]">
                Next action: {nextActionBanner.title}
              </p>
              <p className="mt-0.5 text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
                {nextActionBanner.detail}
              </p>
              {allNextActions.length > 1 && (
                <p className="mt-0.5 font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
                  + {allNextActions.length - 1} more recommended action{allNextActions.length - 1 === 1 ? '' : 's'} — see Next actions tab
                </p>
              )}
            </div>
            <div className="flex items-center gap-[var(--vestara-spacing-2)]">
              <Button
                variant="primary"
                size="sm"
                onClick={handleNextAction}
                disabled={nextActionBusy}
              >
                {nextActionBanner.ctaLabel}
              </Button>
              <button
                type="button"
                onClick={() => setBannerDismissed(true)}
                className="cursor-pointer rounded-[var(--vestara-radius)] px-[var(--vestara-spacing-2)] py-[var(--vestara-spacing-1)] font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)] hover:text-[var(--vestara-text-secondary)]"
                aria-label="Dismiss next action banner"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        <div
          className="flex flex-wrap items-center gap-[var(--vestara-spacing-2)] rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] p-[var(--vestara-spacing-element)]"
          role="toolbar"
          aria-label="Workflow filters"
        >
          <Input
            value={railQuery}
            onChange={(event) => setRailQuery(event.target.value)}
            placeholder="Filter workflows…"
            aria-label="Filter workflows"
            className="min-w-48 flex-1"
          />
          <div className="flex flex-wrap items-center gap-[var(--vestara-spacing-element)]" role="group" aria-label="Status filter">
            {RAIL_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setRailFilter(filter.id)}
                aria-pressed={railFilter === filter.id}
                className={`cursor-pointer rounded-[var(--vestara-radius-full)] border px-[var(--vestara-spacing-3)] py-[var(--vestara-spacing-element)] font-mono text-[length:var(--vestara-font-size-xs)] transition-colors ${
                  railFilter === filter.id
                    ? 'border-[var(--vestara-accent-border)] bg-[var(--vestara-accent-bg)] text-[var(--vestara-text-primary)]'
                    : 'border-[var(--vestara-border-subtle)] text-[var(--vestara-text-muted)] hover:text-[var(--vestara-text-secondary)]'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
          {railQuery.trim() !== '' || railFilter !== 'all' ? (
            <span className="font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
              {visibleProjects.length} of {projects.length}
            </span>
          ) : null}
        </div>

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
                <div className="space-y-[var(--vestara-spacing-2)]" role="status" aria-label="Loading projects">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="mpg-skeleton h-20" />
                  ))}
                  <p className="sr-only">Loading projects…</p>
                </div>
              ) : projects.length === 0 ? (
                <EmptyState
                  icon={navIcon('workflows')}
                  title="No orchestrated projects yet"
                  description="Draft a goal, gate the risky steps, and let the agents run the waves."
                  action={
                    <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
                      Create your first project
                    </Button>
                  }
                />
              ) : visibleProjects.length === 0 ? (
                <EmptyState
                  icon={navIcon('workflows')}
                  title="No workflows match the current filters"
                  description="Clear the search or choose a different status filter."
                  action={
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setRailQuery('');
                        setRailFilter('all');
                      }}
                    >
                      Clear filters
                    </Button>
                  }
                />
              ) : (
                <ProjectCards
                  projects={visibleProjects}
                  metricsByProject={metricsByProject}
                  approvalsByProject={approvalsByProject}
                  projectActions={projectActions}
                  expandedId={expandedId}
                  busy={busy}
                  detail={detail}
                  onToggle={toggleExpand}
                  onResolveApproval={(projectId, taskId, approved) => void resolveApproval(projectId, taskId, approved)}
                  onOpenGraph={() => setActiveTab('workflow-graph')}
                />
              )}
              {dashboard.phases.length > 0 && (
                <div className="mt-[var(--vestara-spacing-3)] border-t border-[var(--vestara-border-subtle)] pt-[var(--vestara-spacing-3)]">
                  <span className="ar-panel__label">PhaseCards</span>
                  <div className="mt-[var(--vestara-spacing-2)] grid grid-cols-2 gap-[var(--vestara-spacing-2)]">
                    {dashboard.phases.map(([phase, count]) => (
                      <div
                        key={phase}
                        className="rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] p-[var(--vestara-spacing-2)]"
                      >
                        <div className="font-mono text-[length:var(--vestara-font-size-xs)] font-semibold uppercase tracking-wide text-[var(--vestara-text-secondary)]">
                          {phase.replaceAll('-', ' ')}
                        </div>
                        <div className="mt-0.5 font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
                          {count} project{count === 1 ? '' : 's'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </aside>
          }
          context={
            <aside className="ar-panel workflow-context" aria-label="Selected workflow">
              <div className="ar-panel__head">
                <span className="ar-panel__label">Selected workflow</span>
                {selectedProject && (
                  <Badge variant={statusTone(selectedProject.status)} size="sm" dot>
                    {selectedProject.status.replaceAll('-', ' ')}
                  </Badge>
                )}
              </div>
              {!selectedProject ? (
                <EmptyState
                  icon={navIcon('workflows')}
                  title="No workflow selected"
                  description="Select a project from the rail to inspect its graph, tasks, and evidence."
                />
              ) : !selectedDetail ? (
                <div className="space-y-[var(--vestara-spacing-2)]" role="status" aria-label="Loading selected workflow">
                  <div className="mpg-skeleton h-24" />
                  <p className="sr-only">Loading workflow snapshot…</p>
                </div>
              ) : (
                <div className="space-y-[var(--vestara-spacing-section)]">
                  <Tabs
                    tabs={inspectorTabs}
                    activeTab={inspectorTab}
                    onTabChange={(tab) => setInspectorTab(tab as typeof inspectorTab)}
                    ariaLabel="Inspector views"
                    border="accent"
                    tablistClassName="border-b border-[var(--vestara-border-subtle)]"
                  />
                  {inspectorTab === 'overview' && (
                    <div className="space-y-[var(--vestara-spacing-section)]">
                      <OperationalPanel
                        icon={navIcon('workflows')}
                        title={selectedProject.name}
                        description={selectedProject.goal}
                      >
                        <div className="flex flex-wrap gap-[var(--vestara-spacing-2)]">
                          <span className="workflow-status-chip" data-status={selectedProject.phase}>
                            {selectedProject.phase.replaceAll('-', ' ')}
                          </span>
                          {selectedDetail.snapshot.plan && (
                            <Badge variant="default" size="sm">
                              Plan: {selectedDetail.snapshot.plan.status}
                            </Badge>
                          )}
                          <Badge variant="default" size="sm">
                            {selectedTotal} tasks · {selectedDetail.snapshot.artifacts?.length ?? 0} artifacts
                          </Badge>
                        </div>
                        <div className="mt-[var(--vestara-spacing-3)]">
                          <div className="flex items-center justify-between gap-[var(--vestara-spacing-3)] text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
                            <span>Task progress</span>
                            <span>
                              {selectedDone} / {selectedTotal} · {selectedPct}%
                            </span>
                          </div>
                          <div className="mt-[var(--vestara-spacing-2)]">
                            <ProgressBar pct={selectedPct} size="md" />
                          </div>
                        </div>
                      </OperationalPanel>
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
                      <div className="flex flex-wrap gap-[var(--vestara-spacing-2)]">
                        {selectedDetail.snapshot.phase === 'pending-approval' && expandedId && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => void approvePlan(expandedId)}
                            disabled={busy === `plan-${expandedId}`}
                          >
                            Approve plan
                          </Button>
                        )}
                        {(selectedDetail.snapshot.status === 'running' || selectedDetail.snapshot.status === 'awaiting-approval') &&
                          expandedId && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => void resumeProject(expandedId)}
                              disabled={busy === `resume-${expandedId}`}
                            >
                              Resume
                            </Button>
                          )}
                        <Button variant="ghost" size="sm" onClick={() => setActiveTab('workflow-graph')}>
                          Open graph
                        </Button>
                      </div>
                    </div>
                  )}
                  {inspectorTab === 'node' && (
                    <div className="space-y-[var(--vestara-spacing-section)]">
                      {!selectedNode ? (
                        <EmptyState
                          icon={navIcon('workflows')}
                          title="No node selected"
                          description="Select a plan or task node in the graph to inspect its authoritative details."
                          action={
                            <Button variant="secondary" size="sm" onClick={() => setActiveTab('workflow-graph')}>
                              Open graph
                            </Button>
                          }
                        />
                      ) : (
                        <>
                          <div className="rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] p-[var(--vestara-spacing-3)]">
                            <div className="font-mono text-[length:var(--vestara-font-size-xs)] font-semibold uppercase tracking-widest text-[var(--vestara-text-muted)]">
                              Node details
                            </div>
                            <div className="mt-[var(--vestara-spacing-1)] text-[length:var(--vestara-font-size-sm)] font-semibold text-[var(--vestara-text-primary)]">
                              {selectedNode.label}
                            </div>
                            <div className="mt-[var(--vestara-spacing-1)] font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
                              {selectedNode.kind} · {selectedTask ? `${selectedTask.dependencies.length} dependencies` : 'plan node'}
                            </div>
                            <dl className="mt-[var(--vestara-spacing-2)] space-y-[var(--vestara-spacing-1)] rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] p-[var(--vestara-spacing-2)] font-mono text-[length:var(--vestara-font-size-xs)]">
                              <div className="flex gap-[var(--vestara-spacing-2)]">
                                <dt className="shrink-0 text-[var(--vestara-text-muted)]">ID:</dt>
                                <dd className="truncate text-[var(--vestara-text-secondary)]">{selectedNode.source.id}</dd>
                              </div>
                              <div className="flex gap-[var(--vestara-spacing-2)]">
                                <dt className="shrink-0 text-[var(--vestara-text-muted)]">Type:</dt>
                                <dd className="text-[var(--vestara-text-secondary)]">{selectedNode.kind}</dd>
                              </div>
                              <div className="flex gap-[var(--vestara-spacing-2)]">
                                <dt className="shrink-0 text-[var(--vestara-text-muted)]">Status:</dt>
                                <dd className="text-[var(--vestara-text-secondary)]">{selectedNode.status}</dd>
                              </div>
                            </dl>
                          </div>
                          <div className="rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] p-[var(--vestara-spacing-3)]">
                            <div className="font-mono text-[length:var(--vestara-font-size-xs)] font-semibold uppercase tracking-widest text-[var(--vestara-accent-text)]">
                              Authoritative details
                            </div>
                            <p className="mt-[var(--vestara-spacing-1)] text-[length:var(--vestara-font-size-xs)] leading-relaxed text-[var(--vestara-text-secondary)]">
                              This node is part of the running workflow. Selection, status, and technical identity render
                              from the unified inspector — every view stays in sync with the graph.
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  {inspectorTab === 'audit' && (
                    <div className="space-y-[var(--vestara-spacing-section)]">
                      <div className="font-mono text-[length:var(--vestara-font-size-xs)] font-semibold uppercase tracking-widest text-[var(--vestara-text-muted)]">
                        Audit trail
                      </div>
                      {selectedDetail.audit.length === 0 ? (
                        <p className="font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
                          No audit events recorded yet.
                        </p>
                      ) : (
                        <ul className="space-y-1.5">
                          {selectedDetail.audit.map((event, index) => (
                            <li
                              key={`${event.type}-${event.at}-${index}`}
                              className="flex items-center justify-between gap-[var(--vestara-spacing-2)] rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-2.5 py-[var(--vestara-spacing-element)] font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-secondary)]"
                            >
                              <span className="truncate">{event.type}</span>
                              <span className="shrink-0 text-[var(--vestara-text-muted)]">
                                {Number.isNaN(Date.parse(event.at)) ? event.at : `${new Date(event.at).toISOString().slice(11, 16)} UTC`}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  {inspectorTab === 'blocker' && (
                    <div className="space-y-[var(--vestara-spacing-section)]">
                      <ApprovalActions
                        projectId={selectedProject.id}
                        approvals={approvalsByProject[selectedProject.id] ?? []}
                        busy={busy}
                        onResolve={(projectId, taskId, approved) => void resolveApproval(projectId, taskId, approved)}
                      />
                      {(selectedDetail.snapshot.tasks.filter((task) => task.status === 'blocked' || task.status === 'failed')).map(
                        (task) => (
                          <OperationalPanel
                            key={task.id}
                            icon={navIcon('executions')}
                            title={task.summary}
                            description={task.description}
                            tone="info"
                            actions={
                              <Badge variant="error" size="sm">
                                {task.status}
                              </Badge>
                            }
                          >
                            <div className="flex flex-wrap gap-[var(--vestara-spacing-2)]">
                              {expandedId && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => void resumeProject(expandedId)}
                                  disabled={busy === `resume-${expandedId}`}
                                >
                                  Resume
                                </Button>
                              )}
                              <Button variant="ghost" size="sm" onClick={() => setActiveTab('tasks')}>
                                Inspect tasks
                              </Button>
                            </div>
                          </OperationalPanel>
                        ),
                      )}
                      {(approvalsByProject[selectedProject.id] ?? []).length === 0 &&
                        !selectedDetail.snapshot.tasks.some((task) => task.status === 'blocked' || task.status === 'failed') && (
                          <EmptyState
                            icon={navIcon('executions')}
                            title="No blockers"
                            description="No approvals pending and no blocked or failed tasks. Waves are clear."
                          />
                        )}
                    </div>
                  )}
                  {inspectorTab === 'actions' && (
                    <div className="space-y-[var(--vestara-spacing-section)]">
                      <div className="font-mono text-[length:var(--vestara-font-size-xs)] font-semibold uppercase tracking-widest text-[var(--vestara-text-muted)]">
                        Recommended next actions
                      </div>
                      <NextActionsPanel
                        actions={allNextActions}
                        onSelect={(projectId, kind) => {
                          if (projectId && expandedId !== projectId) toggleExpand(projectId);
                          if (kind === 'task-approval') {
                            setActiveTab('overview');
                            setInspectorTab('blocker');
                          } else if (kind === 'task-failure') {
                            setActiveTab('tasks');
                          } else if (kind === 'plan-approval') {
                            void approvePlan(projectId);
                          } else if (kind === 'resume') {
                            void resumeProject(projectId);
                          } else if (kind === 'progress') {
                            setActiveTab('workflow-graph');
                          } else if (kind === 'start') {
                            setActiveTab('overview');
                          }
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
            </aside>
          }
        >
        <WorkspaceTabs
          tabs={workflowTabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          ariaLabel="Workflow sections"
        />
        <div className="space-y-[var(--vestara-spacing-section)]">
          {activeTab === 'workflow-graph' ? (
              selectedDetail ? (
                <WorkflowGraph
                  chrome="canvas"
                  height={560}
                  graph={selectedGraph}
                  error={selectedGraph ? undefined : 'Workflow graph is unavailable until a plan exists.'}
                  selectedNodeId={selectedGraphNodeId}
                  onNodeSelect={(node) => {
                    setSelectedGraphNodeId(node?.id);
                    if (node) setInspectorTab('node');
                  }}
                />
              ) : (
                <EmptyState
                  icon={navIcon('workflows')}
                  title="No workflow selected"
                  description="Select a project from the Projects rail to inspect its Workflow graph."
                  action={
                    <Button variant="secondary" size="sm" onClick={selectRecommended} disabled={projects.length === 0}>
                      Select a workflow
                    </Button>
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
                          <span className="workflow-status-chip" data-status={task.status}>{task.status.replaceAll('-', ' ')}</span>
                          <span>{task.dependencies.length} prerequisite{task.dependencies.length === 1 ? '' : 's'}</span>
                          <span>{(selectedDetail.snapshot.artifacts ?? []).filter((artifact) => artifact.taskId === task.id).length} artifacts</span>
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={navIcon('executions')}
                  title="No workflow selected"
                  description="Select a project from the Projects rail to view tasks."
                  action={
                    <Button variant="secondary" size="sm" onClick={selectRecommended} disabled={projects.length === 0}>
                      Select a workflow
                    </Button>
                  }
                />
              )
            ) : activeTab === 'evidence' ? (
              selectedDetail ? (
                <div>
                  <WorkflowSupportingPanels variant="evidence" audit={selectedDetail.audit} artifacts={selectedDetail.snapshot.artifacts ?? []} />
                </div>
              ) : (
                <EmptyState
                  icon={navIcon('artifacts')}
                  title="No workflow selected"
                  description="Select a project from the Projects rail to view artifacts."
                  action={
                    <Button variant="secondary" size="sm" onClick={selectRecommended} disabled={projects.length === 0}>
                      Select a workflow
                    </Button>
                  }
                />
              )
            ) : (
              <>
                {!loading && <WorkflowQuickActions actions={quickActions} />}
                {!loading && nextAction && (
                  <OperationalPanel
                    icon={navIcon('workflows')}
                    title="Next recommended action"
                    description={nextAction.projectName}
                    actions={
                      <Button variant="primary" size="sm" onClick={handleNextAction} disabled={nextActionBusy}>
                        {nextAction.ctaLabel}
                      </Button>
                    }
                  >
                    <p className="text-[length:var(--vestara-font-size-sm)] font-semibold text-[var(--vestara-text-primary)]">
                      {nextAction.title}
                    </p>
                    <p className="mt-[var(--vestara-spacing-1)] text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
                      {nextAction.detail}
                    </p>
                  </OperationalPanel>
                )}

        {!loading && (
        <>
        <div className="grid grid-cols-1 gap-[var(--vestara-spacing-4)] md:grid-cols-2">
          <OperationalPanel
            icon={navIcon('executions')}
            title="Task progress"
            description={`${dashboard.tasks.completed} / ${dashboard.tasks.total} tasks`}
          >
            <ProgressBar pct={dashboard.completion} size="md" />
            <div className="mt-[var(--vestara-spacing-3)] flex flex-wrap gap-[var(--vestara-spacing-2)]">
              <Badge variant="default" size="sm">{dashboard.completion}% complete</Badge>
              <Badge variant="info" size="sm">{dashboard.tasks.running} running</Badge>
              <Badge variant="warning" size="sm">{dashboard.tasks.blocked} blocked</Badge>
              <Badge variant="error" size="sm">{dashboard.tasks.failed} failed</Badge>
              <Badge variant="warning" size="sm">{dashboard.tasks.awaitingApproval} awaiting approval</Badge>
            </div>
          </OperationalPanel>

          <OperationalPanel
            icon={navIcon('dashboard')}
            title="Projects by phase"
            description={`${projects.length} project${projects.length === 1 ? '' : 's'}`}
          >
            <div className="flex flex-wrap gap-[var(--vestara-spacing-2)]">
              {dashboard.phases.length > 0 ? (
                dashboard.phases.map(([phase, count]) => (
                  <span key={phase} className="workflow-status-chip" data-status={phase}>
                    {phase.replaceAll('-', ' ')} · {count}
                  </span>
                ))
              ) : (
                <span className="text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">No project phases yet.</span>
              )}
            </div>
          </OperationalPanel>
        </div>
        <div className="mt-[var(--vestara-spacing-4)] grid grid-cols-2 gap-[var(--vestara-spacing-4)] md:grid-cols-4">
          <StatCard label="Running tasks" value={dashboard.tasks.running} accent="var(--vestara-status-info)" />
          <StatCard label="Blocked / failed" value={dashboard.tasks.blocked + dashboard.tasks.failed} accent="var(--vestara-status-error)" />
          <StatCard label="Awaiting approval" value={dashboard.tasks.awaitingApproval} accent="var(--vestara-status-warning)" />
          <StatCard label="Artifacts" value={Object.values(metricsByProject).reduce((sum, metric) => sum + metric.artifacts, 0)} accent="var(--vestara-status-success)" />
        </div>
        </>
        )}

        {loading ? (
          <div className="space-y-[var(--vestara-spacing-4)]" role="status" aria-live="polite" aria-label="Loading workflows">
            <div className="grid grid-cols-2 gap-[var(--vestara-spacing-3)] md:grid-cols-4">
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
        <Modal onClose={() => setCreateOpen(false)} ariaLabel="New orchestrated project">
          <div className="space-y-[var(--vestara-spacing-4)] p-[var(--vestara-spacing-5)]">
            <h2 className="text-[length:var(--vestara-font-size-sm)] font-bold text-[var(--vestara-text-primary)]">
              New orchestrated project
            </h2>
            <div className="grid grid-cols-1 gap-[var(--vestara-spacing-3)] sm:grid-cols-2">
              <Input
                label="Name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Feature"
              />
              <Input
                label="Repo path (optional)"
                value={form.repoPath}
                onChange={(e) => setForm({ ...form, repoPath: e.target.value })}
                placeholder="/repo"
              />
            </div>
            <label className="block">
              <span className="text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-secondary)]">Goal</span>
              <textarea
                value={form.goal}
                onChange={(e) => setForm({ ...form, goal: e.target.value })}
                className="mt-[var(--vestara-spacing-1)] w-full rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-accent-border)] bg-[var(--vestara-surface-canvas)] px-[var(--vestara-spacing-3)] py-[var(--vestara-spacing-element)] text-[length:var(--vestara-font-size-sm)] text-[var(--vestara-text-primary)] focus:outline-none"
                rows={2}
                placeholder="What should the agents build?"
              />
            </label>

            <div>
              <div className="mb-[var(--vestara-spacing-2)] flex items-center justify-between">
                <span className="text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-secondary)]">Tasks</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setTaskRows((rows) => [...rows, { summary: '', files: '', capabilities: '' }])}
                >
                  + Add task
                </Button>
              </div>
              <div className="space-y-[var(--vestara-spacing-2)]">
                {taskRows.map((row, index) => (
                  <div key={index} className="grid grid-cols-1 gap-[var(--vestara-spacing-2)] sm:grid-cols-3">
                    <Input
                      value={row.summary}
                      onChange={(e) =>
                        setTaskRows((rows) => rows.map((r, i) => (i === index ? { ...r, summary: e.target.value } : r)))
                      }
                      placeholder="Task summary"
                      aria-label={`Task ${index + 1} summary`}
                    />
                    <Input
                      value={row.files}
                      onChange={(e) =>
                        setTaskRows((rows) => rows.map((r, i) => (i === index ? { ...r, files: e.target.value } : r)))
                      }
                      placeholder="Files (comma separated)"
                      aria-label={`Task ${index + 1} files`}
                    />
                    <Input
                      value={row.capabilities}
                      onChange={(e) =>
                        setTaskRows((rows) => rows.map((r, i) => (i === index ? { ...r, capabilities: e.target.value } : r)))
                      }
                      placeholder="Capabilities (comma separated)"
                      aria-label={`Task ${index + 1} capabilities`}
                    />
                  </div>
                ))}
              </div>
            </div>

            {createError && <p className="text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-status-error)]">{createError}</p>}

            <div className="flex items-center justify-end gap-[var(--vestara-spacing-2)] pt-[var(--vestara-spacing-1)]">
              <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={() => void createAndRun()} disabled={createBusy} loading={createBusy}>
                {createBusy ? 'Creating...' : 'Create & run'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
