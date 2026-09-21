/**
 * M11C Workflow Browser Column
 *
 * A center-left column (~280px) showing active workflows/sessions with their
 * latest disposition, event counts, and last activity. The navigation plane
 * for scope and at-a-glance health of every workstream.
 *
 * Design spec: activity-room-visual-design-spec.md §2.3
 *   - Target width: ~280px (±16px)
 *   - Content: unit list, scope selector, execution pulse
 *   - At <768px becomes a bottom sheet
 *
 * Authority: derives from M11C stream items and workflow summary projection.
 * No state mutation — pure projection.
 */

import { useMemo, useState } from 'react';
import type { M11CStreamItem } from '../../hooks/useM11CActivityRoom';
import type { WorkflowSummary } from '@vestara/activity-room';
import { StatusIndicator, type StatusVariant } from '@vestara/ui';
import { WORKFLOW_STATUS_CONFIG } from './status-config';

// ─── Types ───────────────────────────────────────────────────

interface WorkflowBrowserProps {
  /** Stream items to derive workflow data from. */
  readonly stream: readonly M11CStreamItem[];
  /** Workflow summary projection (if available). */
  readonly workflowSummary: WorkflowSummary | null;
  /** Currently selected participant (for filtering). */
  readonly selectedParticipantId?: string;
  /** Callback when a workflow context is selected. */
  readonly onSelectWorkflow?: (workflowId: string | null) => void;
  /** Active workflow scope (highlights the selected unit). */
  readonly selectedWorkflowId?: string | null;
}

export interface WorkflowUnit {
  readonly workflowId: string;
  /** Scan-first status: failed | running | completed — never a raw kind. */
  readonly status: string;
  readonly taskCount: number;
  readonly completedTasks: number;
  readonly eventCount: number;
  readonly lastActivity: string;
  readonly agentNames: readonly string[];
  readonly hasErrors: boolean;
  readonly isActive: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────

/** Derive workflow units from stream items. */
export function deriveWorkflowUnits(stream: readonly M11CStreamItem[]): readonly WorkflowUnit[] {
  const workflowMap = new Map<string, {
    events: M11CStreamItem[];
    agents: Set<string>;
    hasErrors: boolean;
  }>();

  for (const item of stream) {
    const wfId = item.workflowRunId;
    if (!wfId) continue;

    let entry = workflowMap.get(wfId);
    if (!entry) {
      entry = { events: [], agents: new Set(), hasErrors: false };
      workflowMap.set(wfId, entry);
    }

    entry.events.push(item);
    if (item.actor.type !== 'human') {
      entry.agents.add(item.actor.displayName);
    }
    // Authoritative failure class is 'diagnostic' (M10 classifyKind);
    // accept legacy 'error' so older projections still surface.
    if (item.kind === 'diagnostic' || item.kind === 'error') {
      entry.hasErrors = true;
    }
  }

  const units: WorkflowUnit[] = [];
  for (const [workflowId, entry] of workflowMap) {
    const sorted = [...entry.events].sort((a, b) => b.sequence - a.sequence);
    const latest = sorted[0];
    // Unique tasks (events repeat taskId across lifecycle transitions).
    const taskIds = new Set<string>();
    const completedTaskIds = new Set<string>();
    for (const e of entry.events) {
      if (!e.taskId) continue;
      taskIds.add(e.taskId);
      if (e.kind === 'activity' && e.content.includes('completed')) {
        completedTaskIds.add(e.taskId);
      }
    }
    const hasLifecycle = entry.events.some((e) => e.kind === 'activity' || e.kind === 'progress');
    const isActive = !entry.hasErrors && hasLifecycle;
    // Scan-first status: failures pin, active work runs, otherwise done.
    // Never a raw stream kind (previous code showed "activity" as status).
    const status = entry.hasErrors ? 'failed' : isActive ? 'running' : 'completed';

    units.push({
      workflowId,
      status,
      taskCount: taskIds.size,
      completedTasks: completedTaskIds.size,
      eventCount: entry.events.length,
      lastActivity: latest?.timestamp ?? '',
      agentNames: [...entry.agents],
      hasErrors: entry.hasErrors,
      isActive,
    });
  }

  // Failed first, then active, then most recent activity
  return units.sort((a, b) => {
    if (a.hasErrors !== b.hasErrors) return a.hasErrors ? -1 : 1;
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime();
  });
}

/**
 * Authoritative "active work exists" signal for adaptive composition (008F).
 * Single derivation home shared with the browser below: a unit counts as
 * active exactly as the browser defines it, or the latest projected summary
 * is running. No inference beyond these authorities.
 */
export function hasActiveWork(
  units: readonly WorkflowUnit[],
  workflowSummary: WorkflowSummary | null,
): boolean {
  return units.some((u) => u.isActive) || workflowSummary?.status === 'running';
}

function formatTimeAgo(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  return `${Math.floor(diffHr / 24)}d`;
}

// ─── Component ───────────────────────────────────────────────

export default function M11CWorkflowBrowser({
  stream,
  workflowSummary,
  onSelectWorkflow,
  selectedWorkflowId,
}: WorkflowBrowserProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const units = useMemo(() => deriveWorkflowUnits(stream), [stream]);

  // Prefer the authoritative summary status when this browser row is the
  // summarized workflow — stream-derived heuristics stay as fallback for
  // every other unit (multi-workflow rooms).
  const unitsWithSummary = useMemo(() => units.map((unit) => {
    if (workflowSummary && unit.workflowId === workflowSummary.workflowRunId) {
      const status = workflowSummary.status === 'failed' ? 'failed'
        : workflowSummary.status === 'running' ? 'running'
        : workflowSummary.status === 'completed' ? 'completed'
        : unit.status;
      return { ...unit, status, isActive: workflowSummary.status === 'running' || unit.isActive, hasErrors: workflowSummary.status === 'failed' || unit.hasErrors };
    }
    return unit;
  }), [units, workflowSummary]);

  // Derive status variant from workflow summary
  const summaryStatus = workflowSummary?.status ?? 'idle';
  const summaryConfig = WORKFLOW_STATUS_CONFIG[summaryStatus];
  const summaryVariant: StatusVariant = summaryConfig?.variant ?? 'idle';
  const summaryPulse = summaryConfig?.pulse ?? false;

  return (
    <div className="ar-workflow-browser" role="region" aria-label="Workflow browser">
      {/* Header */}
      <div className="ar-workflow-browser__header">
        <div className="ar-kicker">Workflows</div>
        <div className="ar-workflow-browser__summary">
          <StatusIndicator
            variant={summaryVariant}
            size="xs"
            pulse={summaryPulse}
            ariaLabel={`Workflow: ${summaryStatus}`}
          />
          <span className="ar-workflow-browser__summary-text">
            {workflowSummary
              ? `${workflowSummary.completedTasks}/${workflowSummary.taskCount} tasks`
              : `${units.length} workflow${units.length !== 1 ? 's' : ''}`}
          </span>
        </div>
      </div>

      {/* Unit list — single presentation home for workflow scope (the page
          chooses inline vs disclosure, never both). */}
      <div className="ar-workflow-browser__list ar-scroll" role="list">
        {unitsWithSummary.length === 0 ? (
          <div className="ar-workflow-browser__empty">
            No active workflows
          </div>
        ) : (
          unitsWithSummary.map((unit) => {
            const isExpanded = expandedId === unit.workflowId;
            const isSelected = selectedWorkflowId === unit.workflowId;
            return (
              <div
                key={unit.workflowId}
                className={`ar-workflow-unit ${isExpanded ? 'ar-workflow-unit--expanded' : ''}`}
                role="listitem"
              >
                <button
                  type="button"
                  className={`ar-workflow-unit__header ${isSelected ? 'ar-workflow-unit__header--selected' : ''}`}
                  onClick={() => {
                    if (isExpanded) {
                      setExpandedId(null);
                      // Collapse clears scope only when this row owns it;
                      // scope set from a stream badge survives.
                      if (isSelected) onSelectWorkflow?.(null);
                    } else {
                      setExpandedId(unit.workflowId);
                      onSelectWorkflow?.(unit.workflowId);
                    }
                  }}
                  aria-expanded={isExpanded}
                  aria-pressed={isSelected}
                >
                  <StatusIndicator
                    variant={unit.hasErrors ? 'error' : unit.isActive ? 'live' : 'idle'}
                    size="xs"
                    pulse={unit.isActive}
                    ariaLabel={`Workflow ${unit.workflowId}: ${unit.status}`}
                  />
                  <div className="ar-workflow-unit__info">
                    <span className="ar-workflow-unit__id" title={`Workflow ${unit.workflowId}`}>
                      wf:{unit.workflowId.length > 12 ? `${unit.workflowId.slice(0, 12)}…` : unit.workflowId}
                    </span>
                    <span className="ar-workflow-unit__meta">
                      <span
                        className={`mr-1 inline-block rounded-[var(--vestara-radius-full)] border px-1.5 text-[10px] font-semibold capitalize ${
                          unit.hasErrors
                            ? 'border-[var(--vestara-status-error-border)] bg-[var(--vestara-status-error-bg)] text-[var(--vestara-status-error)]'
                            : unit.isActive
                              ? 'border-[var(--vestara-status-success-border)] bg-[var(--vestara-status-success-bg)] text-[var(--vestara-status-success)]'
                              : 'border-[var(--vestara-border-subtle)] text-[var(--vestara-text-muted)]'
                        }`}
                      >
                        {unit.status}
                      </span>
                      {unit.eventCount} events · {formatTimeAgo(unit.lastActivity)} ago
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="ar-workflow-unit__detail">
                    {workflowSummary && unit.workflowId === workflowSummary.workflowRunId && workflowSummary.currentTask && (
                      <div className="ar-workflow-unit__current truncate text-[11px] text-[var(--vestara-text-secondary)]" title={workflowSummary.currentTask}>
                        Current: {workflowSummary.currentTask}
                      </div>
                    )}
                    {/* Progress bar */}
                    {unit.taskCount > 0 && (
                      <div className="ar-workflow-unit__progress">
                        <div
                          className="ar-workflow-unit__progress-bar"
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={unit.taskCount}
                          aria-valuenow={unit.completedTasks}
                          aria-label={`${unit.completedTasks} of ${unit.taskCount} tasks complete`}
                        >
                          <div
                            className={`ar-workflow-unit__progress-fill ${unit.hasErrors ? 'ar-workflow-unit__progress-fill--error' : ''}`}
                            style={{ width: `${unit.taskCount > 0 ? Math.round((unit.completedTasks / unit.taskCount) * 100) : 0}%` }}
                          />
                        </div>
                        <span className="ar-workflow-unit__progress-text">
                          {unit.completedTasks}/{unit.taskCount} tasks
                        </span>
                      </div>
                    )}
                    {unit.agentNames.length > 0 && (
                      <div className="ar-workflow-unit__agents">
                        <span className="ar-workflow-unit__detail-label">Agents:</span>
                        {unit.agentNames.map((name) => (
                          <span key={name} className="ar-workflow-unit__agent-badge">
                            {name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
