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
}

interface WorkflowUnit {
  readonly workflowId: string;
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
function deriveWorkflowUnits(stream: readonly M11CStreamItem[]): readonly WorkflowUnit[] {
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
    if (item.kind === 'error') {
      entry.hasErrors = true;
    }
  }

  const units: WorkflowUnit[] = [];
  for (const [workflowId, entry] of workflowMap) {
    const sorted = [...entry.events].sort((a, b) => b.sequence - a.sequence);
    const latest = sorted[0];
    const completed = entry.events.filter(
      (e) => e.kind === 'activity' && e.content.includes('completed'),
    ).length;

    units.push({
      workflowId,
      status: latest?.kind ?? 'unknown',
      taskCount: entry.events.filter((e) => e.taskId).length,
      completedTasks: completed,
      eventCount: entry.events.length,
      lastActivity: latest?.timestamp ?? '',
      agentNames: [...entry.agents],
      hasErrors: entry.hasErrors,
      isActive: !entry.hasErrors && entry.events.some((e) => e.kind === 'activity' || e.kind === 'progress'),
    });
  }

  // Sort by most recent activity
  return units.sort(
    (a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime(),
  );
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
}: WorkflowBrowserProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const units = useMemo(() => deriveWorkflowUnits(stream), [stream]);

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

      {/* Unit list */}
      <div className="ar-workflow-browser__list ar-scroll" role="list">
        {units.length === 0 ? (
          <div className="ar-workflow-browser__empty">
            No active workflows
          </div>
        ) : (
          units.map((unit) => {
            const isExpanded = expandedId === unit.workflowId;
            return (
              <div
                key={unit.workflowId}
                className={`ar-workflow-unit ${isExpanded ? 'ar-workflow-unit--expanded' : ''}`}
                role="listitem"
              >
                <button
                  type="button"
                  className="ar-workflow-unit__header"
                  onClick={() => {
                    setExpandedId(isExpanded ? null : unit.workflowId);
                    onSelectWorkflow?.(isExpanded ? null : unit.workflowId);
                  }}
                  aria-expanded={isExpanded}
                >
                  <StatusIndicator
                    variant={unit.hasErrors ? 'error' : 'live'}
                    size="xs"
                    pulse={!unit.hasErrors}
                    ariaLabel={`Workflow ${unit.workflowId}: ${unit.status}`}
                  />
                  <div className="ar-workflow-unit__info">
                    <span className="ar-workflow-unit__id">
                      {unit.workflowId.length > 12
                        ? `${unit.workflowId.slice(0, 12)}…`
                        : unit.workflowId}
                    </span>
                    <span className="ar-workflow-unit__meta">
                      {unit.eventCount} events · {formatTimeAgo(unit.lastActivity)} ago
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="ar-workflow-unit__detail">
                    {/* Progress bar */}
                    {unit.taskCount > 0 && (
                      <div className="ar-workflow-unit__progress">
                        <div className="ar-workflow-unit__progress-bar">
                          <div
                            className={`ar-workflow-unit__progress-fill ${unit.hasErrors ? 'ar-workflow-unit__progress-fill--error' : ''}`}
                            style={{ width: `${Math.round((unit.completedTasks / unit.taskCount) * 100)}%` }}
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
