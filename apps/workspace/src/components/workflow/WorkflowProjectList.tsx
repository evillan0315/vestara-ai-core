/**
 * WorkflowProjectList — projects rail list view.
 *
 * Owns its co-located UI state: hover/focus tooltip anchor (preview),
 * two-click delete confirm (confirmDeleteId), and the open/close + arm
 * timers. The page owns data (projects, metrics, approvals, actions),
 * selection (expandedId), busy flags, and all mutations (toggle, open
 * graph, re-run, archive, delete) via callbacks.
 *
 * Each row is a one-line summary (status lamp, name, phase + progress,
 * badges, chevron); hovering or keyboard-focusing a row reveals the full
 * card view inline, and selecting a row pins it open + loads the inspector.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ActionIcon, List, ListItemText, StatusIndicator } from '@vestara/ui';
import { icons, ProgressBar } from '@vestara/ui-components';
import { getActionBadgeLabel, getProjectAction } from '../../lib/orchestration-next-action';
import type {
  OrchestrationApprovalTask,
  OrchestrationProjectMetrics,
  OrchestrationProjectSummary,
} from './orchestration-project-types';
import { NEXT_ACTION_GLYPHS } from './workflow-next-action-meta';

/** Project phases that carry runnable tasks and can be re-run from scratch. */
export const RERUNNABLE_PHASES: ReadonlySet<string> = new Set(['executing', 'verifying', 'completed', 'cancelled']);

/**
 * Summary half of the rail hover tooltip — phase chips, goal, counts, and
 * task progress. Ends at task progress: actions live in the tooltip header
 * (top-right, beside the project name) and approvals stay in the inspector.
 */
export function WorkflowProjectCardBody({
  project,
  metrics,
}: {
  project: OrchestrationProjectSummary;
  metrics?: OrchestrationProjectMetrics;
}) {
  const done = metrics?.tasks.completed ?? 0;
  const total = metrics?.tasks.total ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <>
      <div className="flex flex-wrap items-center gap-[var(--vestara-spacing-element)]">
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
      </div>
    </>
  );
}

/** Row lamp for the projects list: blockers outrank approvals outrank phase. */
export function workflowRowStatusVariant(
  project: { status: string; phase: string },
  metrics?: { tasks: { failed: number; blocked: number } },
  approvalsCount = 0,
): 'live' | 'warn' | 'error' | 'idle' {
  if ((metrics?.tasks.failed ?? 0) + (metrics?.tasks.blocked ?? 0) > 0) return 'error';
  if (approvalsCount > 0) return 'warn';
  switch (project.status) {
    case 'running':
      return 'live';
    case 'awaiting-approval':
      return 'warn';
    case 'cancelled':
      return 'error';
    case 'completed':
      return 'idle';
    default:
      return 'idle';
  }
}

export interface WorkflowProjectListProps {
  projects: OrchestrationProjectSummary[];
  metricsByProject: Record<string, OrchestrationProjectMetrics>;
  approvalsByProject: Record<string, OrchestrationApprovalTask[]>;
  projectActions: Record<string, ReturnType<typeof getProjectAction>>;
  /** Id of the recommended project (head of the priority-ordered queue). The matching row renders the "Next" marker. */
  nextProjectId: string | null;
  expandedId: string | null;
  busy: string | null;
  onToggle: (projectId: string) => void;
  onOpenGraph: (projectId: string) => void;
  onRerun: (projectId: string) => void;
  onArchive: (projectId: string) => void;
  onDelete: (projectId: string) => void;
}

export function WorkflowProjectList({
  projects,
  metricsByProject,
  approvalsByProject,
  projectActions,
  nextProjectId,
  expandedId,
  busy,
  onToggle,
  onOpenGraph,
  onRerun,
  onArchive,
  onDelete,
}: WorkflowProjectListProps) {
  // Hover/focus tooltip anchor — a floating card preview positioned beside
  // the hovered row (portal to document.body so rail scroll never clips it).
  const [preview, setPreview] = useState<{ id: string; top: number; left: number } | null>(null);
  // Two-click delete confirm: the first click arms, the second executes. The
  // arm expires after a few seconds so a stray click never deletes later.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const closeTimer = useRef<number | null>(null);
  const armTimer = useRef<number | null>(null);
  const tooltipId = useId();

  const cancelClose = useCallback(() => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
      if (armTimer.current !== null) window.clearTimeout(armTimer.current);
    },
    [],
  );

  const handleDelete = useCallback(
    (project: { id: string; name: string }) => {
      if (confirmDeleteId === project.id) {
        if (armTimer.current !== null) {
          window.clearTimeout(armTimer.current);
          armTimer.current = null;
        }
        setConfirmDeleteId(null);
        setPreview(null);
        onDelete(project.id);
      } else {
        setConfirmDeleteId(project.id);
        if (armTimer.current !== null) window.clearTimeout(armTimer.current);
        armTimer.current = window.setTimeout(() => setConfirmDeleteId(null), 3000);
      }
    },
    [confirmDeleteId, onDelete],
  );

  const previewOpen = preview !== null;
  useEffect(() => {
    if (!previewOpen) return;
    const dismiss = () => setPreview(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
      document.removeEventListener('keydown', onKey);
    };
  }, [previewOpen]);

  const openPreview = useCallback(
    (projectId: string, anchor: HTMLElement) => {
      cancelClose();
      const rect = anchor.getBoundingClientRect();
      const gap = 8;
      const width = 320;
      let left = rect.right + gap;
      if (left + width > window.innerWidth - gap) left = Math.max(gap, rect.left - width - gap);
      const top = Math.min(Math.max(gap, rect.top - 4), Math.max(gap, window.innerHeight - 240));
      setPreview((current) => (current?.id === projectId ? current : { id: projectId, top, left }));
    },
    [cancelClose],
  );

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setPreview(null), 150);
  }, [cancelClose]);

  const previewProject = preview ? (projects.find((project) => project.id === preview.id) ?? null) : null;
  const previewData = previewProject
    ? {
        project: previewProject,
        metrics: metricsByProject[previewProject.id],
      }
    : null;

  return (
    <>
      <List dividers>
        {projects.map((project, i) => {
          const metrics = metricsByProject[project.id];
          const approvals = approvalsByProject[project.id] ?? [];
          const action = projectActions[project.id];
          const expanded = expandedId === project.id;
          const done = metrics?.tasks.completed ?? 0;
          const total = metrics?.tasks.total ?? 0;
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          // Badge text derives from the same resolver inputs (approvals
          // length, metrics failed+blocked) via getActionBadgeLabel, so counts
          // match the resolver output by construction.
          const badgeLabel = action ? getActionBadgeLabel(action, approvals, metrics) : null;
          const badgeGlyph = action ? NEXT_ACTION_GLYPHS[action.kind] : null;
          const stuckCount = (metrics?.tasks.failed ?? 0) + (metrics?.tasks.blocked ?? 0);
          const approvalCount = approvals.length;
          const showStuckBadge = stuckCount > 0 && action?.kind !== 'task-failure';
          const showApprovalBadge = approvalCount > 0 && action?.kind !== 'task-approval';
          const isNext = nextProjectId !== null && project.id === nextProjectId;
          const lamp = workflowRowStatusVariant(project, metrics, approvals.length);
          return (
            <li
              key={project.id}
              className="mpg-enter min-w-0"
              style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
              onMouseEnter={(event) => openPreview(project.id, event.currentTarget)}
              onMouseLeave={scheduleClose}
            >
              {/* List row — one-line summary mirroring ListItem tokens (selected /
                  hover / keyboard). Click selects; hover or focus opens the
                  floating card tooltip. */}
              {/* biome-ignore lint/a11y/noStaticElementInteractions: row owns selection like ListItem (Enter/Space handled, focus-visible ring); tooltip buttons stay native. */}
              <div
                role="button"
                tabIndex={0}
                aria-expanded={expanded}
                aria-describedby={preview?.id === project.id ? tooltipId : undefined}
                aria-label={`${expanded ? 'Collapse' : 'Expand'} ${project.name} — ${project.phase}, ${done} of ${total} tasks`}
                onClick={() => onToggle(project.id)}
                onFocus={(event) => openPreview(project.id, event.currentTarget)}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) scheduleClose();
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onToggle(project.id);
                  }
                }}
                className={`flex cursor-pointer items-center gap-[var(--vestara-spacing-3)] px-[var(--vestara-spacing-3)] py-[var(--vestara-spacing-2)] transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-[var(--vestara-accent)] ${
                  expanded ? 'bg-[var(--vestara-surface-panel-raised)]' : 'hover:bg-[var(--vestara-surface-interactive)]'
                }`}
              >
                <span className="shrink-0">
                  <StatusIndicator variant={lamp} size="xs" pulse={project.phase === 'executing'} ariaLabel={project.status} />
                </span>
                <ListItemText
                  className="min-w-0 flex-1"
                  primary={
                    <span className="flex min-w-0 items-center gap-[var(--vestara-spacing-element)]">
                      <span className="truncate">{project.name}</span>
                      {isNext && (
                        <span
                          className="shrink-0 rounded-[var(--vestara-radius-full)] border border-[var(--vestara-accent-border)] bg-[var(--vestara-accent-bg)] px-[var(--vestara-spacing-element)] py-0.5 font-mono text-[length:var(--vestara-font-size-xs)] font-semibold text-[var(--vestara-text-primary)]"
                          aria-label={`Next recommended workflow: ${project.name}`}
                        >
                          Next
                        </span>
                      )}
                    </span>
                  }
                  secondary={`${project.phase.replaceAll('-', ' ')} · ${done}/${total} tasks · ${pct}%`}
                />
                {showStuckBadge && (
                  <span
                    className="inline-flex shrink-0 items-center gap-[var(--vestara-spacing-1)] rounded-[var(--vestara-radius-full)] border border-[var(--vestara-status-error-border)] bg-[var(--vestara-status-error-bg)] px-[var(--vestara-spacing-element)] py-0.5 font-mono text-[length:var(--vestara-font-size-xs)] font-semibold text-[var(--vestara-status-error)]"
                    title={`${stuckCount} task${stuckCount === 1 ? '' : 's'} blocked or failed in ${project.name}`}
                    aria-label={`${stuckCount} blocked in ${project.name}`}
                  >
                    ⊘ {stuckCount} blocked
                  </span>
                )}
                {showApprovalBadge && (
                  <span
                    className="inline-flex shrink-0 items-center gap-[var(--vestara-spacing-1)] rounded-[var(--vestara-radius-full)] border border-[var(--vestara-status-warning-border)] bg-[var(--vestara-status-warning-bg)] px-[var(--vestara-spacing-element)] py-0.5 font-mono text-[length:var(--vestara-font-size-xs)] font-semibold text-[var(--vestara-status-warning)]"
                    title={`${approvalCount} approval${approvalCount === 1 ? '' : 's'} pending in ${project.name}`}
                    aria-label={`${approvalCount} approvals in ${project.name}`}
                  >
                    ! {approvalCount} approval{approvalCount === 1 ? '' : 's'}
                  </span>
                )}
                {action && badgeLabel && (
                  <span
                    className={`inline-flex shrink-0 items-center gap-[var(--vestara-spacing-1)] rounded-[var(--vestara-radius-full)] border px-[var(--vestara-spacing-element)] py-0.5 font-mono text-[length:var(--vestara-font-size-xs)] font-semibold ${
                      action.kind === 'task-failure'
                        ? 'border-[var(--vestara-status-error-border)] bg-[var(--vestara-status-error-bg)] text-[var(--vestara-status-error)]'
                        : action.actionable
                          ? 'border-[var(--vestara-status-warning-border)] bg-[var(--vestara-status-warning-bg)] text-[var(--vestara-status-warning)]'
                          : 'border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] text-[var(--vestara-text-secondary)]'
                    }`}
                    title={`${action.title} — ${action.detail}`}
                    aria-label={`${badgeLabel} in ${project.name}`}
                  >
                    {badgeGlyph} {badgeLabel}
                  </span>
                )}
                <span
                  aria-hidden="true"
                  className={`shrink-0 font-mono text-[var(--vestara-text-muted)] transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
                >
                  ›
                </span>
              </div>
            </li>
          );
        })}
      </List>
      {previewData &&
        createPortal(
          <div
            id={tooltipId}
            role="tooltip"
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            onFocus={cancelClose}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) scheduleClose();
            }}
            className="fixed z-[var(--vestara-z-index-tooltip)] w-80 rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel-raised)] p-[var(--vestara-spacing-4)] shadow-[var(--vestara-elevation-lg)]"
            style={{ top: preview?.top, left: preview?.left, maxHeight: 'calc(100vh - 16px)', overflowY: 'auto' }}
          >
            <div className="mb-[var(--vestara-spacing-2)] flex items-center gap-[var(--vestara-spacing-2)]">
              <div className="min-w-0 flex-1 truncate text-[length:var(--vestara-font-size-sm)] font-semibold text-[var(--vestara-text-primary)]">
                {previewData.project.name}
              </div>
              <div className="flex shrink-0 items-center gap-[var(--vestara-spacing-1)]">
                {RERUNNABLE_PHASES.has(previewData.project.phase) && (
                  <ActionIcon
                    size="sm"
                    label={
                      busy === `rerun-${previewData.project.id}`
                        ? `Re-running ${previewData.project.name}…`
                        : `Re-run ${previewData.project.name} — reset every task and run again from the executing phase`
                    }
                    icon={
                      <span aria-hidden="true" className="text-[length:var(--vestara-font-size-sm)]">
                        ↻
                      </span>
                    }
                    onClick={() => onRerun(previewData.project.id)}
                    disabled={busy === `rerun-${previewData.project.id}`}
                  />
                )}
                <ActionIcon
                  size="sm"
                  label={busy === `archive-${previewData.project.id}` ? `Archiving ${previewData.project.name}…` : `Archive ${previewData.project.name}`}
                  icon={<icons.Box size={14} />}
                  onClick={() => onArchive(previewData.project.id)}
                  disabled={busy === `archive-${previewData.project.id}`}
                />
                <ActionIcon
                  size="sm"
                  label={`Open graph for ${previewData.project.name}`}
                  icon={<icons.GitBranch size={14} />}
                  onClick={() => onOpenGraph(previewData.project.id)}
                />
                <ActionIcon
                  size="sm"
                  tone="destructive"
                  label={
                    confirmDeleteId === previewData.project.id
                      ? `Click again to confirm deleting ${previewData.project.name} — this cannot be undone`
                      : `Delete ${previewData.project.name}`
                  }
                  icon={<icons.Trash2 size={14} />}
                  onClick={() => handleDelete(previewData.project)}
                  disabled={busy === `delete-${previewData.project.id}`}
                />
              </div>
            </div>
            <WorkflowProjectCardBody project={previewData.project} metrics={previewData.metrics} />
          </div>,
          document.body,
        )}
    </>
  );
}
