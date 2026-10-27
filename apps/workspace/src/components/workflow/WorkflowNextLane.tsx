/**
 * WorkflowNextLane — persistent recommended-action pager.
 *
 * Owns its pager index (co-located state): clamping + reset live here so the
 * page never manages lane position. Queue data, project lookup, busy flag,
 * and selection routing stay props from the page. Role=status + aria-live
 * polite (never alert) — pager changes never steal focus.
 */

import { useEffect, useState } from 'react';
import { Button } from '@vestara/ui';
import { getNextActions } from '../../lib/orchestration-next-action';
import type { OrchestrationProjectSummary } from './orchestration-project-types';
import { NEXT_ACTION_GLYPHS, NEXT_ACTION_PRECEDENCE } from './workflow-next-action-meta';

export interface WorkflowNextLaneProps {
  actions: ReturnType<typeof getNextActions>;
  projectsById: Record<string, OrchestrationProjectSummary>;
  busyProjectId: string | null;
  onSelect: (projectId: string, kind: string) => void;
}

export function WorkflowNextLane({ actions, projectsById, busyProjectId, onSelect }: WorkflowNextLaneProps) {
  const [laneIndex, setLaneIndex] = useState(0);
  const clampedIndex = actions.length === 0 ? 0 : Math.min(laneIndex, actions.length - 1);
  // Keep the pager in bounds when the queue shrinks (filter change, resolution).
  useEffect(() => {
    if (laneIndex >= actions.length && actions.length > 0) setLaneIndex(0);
  }, [actions.length, laneIndex]);
  if (actions.length === 0) return null;
  const current = actions[clampedIndex];
  const projectPhase = current.projectId ? (projectsById[current.projectId]?.phase ?? '') : '';
  const goPrev = () => setLaneIndex((i) => (i - 1 + actions.length) % actions.length);
  const goNext = () => setLaneIndex((i) => (i + 1) % actions.length);
  const busy = busyProjectId === `resume-${current.projectId}` && current.kind === 'resume';
  return (
    <div
      className={`mpg-enter flex flex-wrap items-center gap-[var(--vestara-spacing-3)] rounded-[var(--vestara-radius-lg)] border p-[var(--vestara-spacing-3)] ${
        current.actionable
          ? 'border-[var(--vestara-status-warning-border)] bg-[var(--vestara-status-warning-bg)]'
          : 'border-[var(--vestara-status-info-border)] bg-[var(--vestara-status-info-bg)]'
      }`}
      role="status"
      aria-live="polite"
      aria-label={`Next recommended action ${clampedIndex + 1} of ${actions.length}: ${current.title}`}
    >
      <span
        aria-hidden="true"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-[var(--vestara-radius-full)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] font-mono text-[length:var(--vestara-font-size-sm)] font-bold text-[var(--vestara-text-primary)]"
      >
        {NEXT_ACTION_GLYPHS[current.kind]}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-[var(--vestara-spacing-element)]">
          <span className="truncate text-[length:var(--vestara-font-size-xs)] font-semibold text-[var(--vestara-text-secondary)]">
            {current.projectName || 'Workflows'}
          </span>
          {projectPhase && <span className="workflow-status-chip" data-status={projectPhase}>{projectPhase.replaceAll('-', ' ')}</span>}
        </div>
        <p className="truncate text-[length:var(--vestara-font-size-sm)] font-semibold text-[var(--vestara-text-primary)]">{current.title}</p>
        <p className="truncate text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]" title={current.detail}>
          {current.detail}
        </p>
        <p
          className="truncate font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]"
          title={`Queue order: #${clampedIndex + 1} of ${actions.length} · ${NEXT_ACTION_PRECEDENCE[current.kind]}`}
        >
          #{clampedIndex + 1} of {actions.length} · {NEXT_ACTION_PRECEDENCE[current.kind]}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-[var(--vestara-spacing-2)]">
        <Button variant={current.actionable ? 'primary' : 'secondary'} size="sm" onClick={() => onSelect(current.projectId, current.kind)} disabled={busy}>
          {current.ctaLabel}
        </Button>
        {actions.length > 1 && (
          <div className="flex items-center gap-[var(--vestara-spacing-1)]" role="group" aria-label="Recommended action queue">
            <button
              type="button"
              onClick={goPrev}
              aria-label="Previous recommended action"
              className="grid h-7 w-7 cursor-pointer place-items-center rounded-[var(--vestara-radius)] text-[var(--vestara-text-muted)] hover:text-[var(--vestara-text-primary)]"
            >
              ‹
            </button>
            <span
              className="font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]"
              title={`${clampedIndex + 1} of ${actions.length} recommended actions`}
            >
              {clampedIndex + 1} of {actions.length}
            </span>
            <button
              type="button"
              onClick={goNext}
              aria-label="Next recommended action"
              className="grid h-7 w-7 cursor-pointer place-items-center rounded-[var(--vestara-radius)] text-[var(--vestara-text-muted)] hover:text-[var(--vestara-text-primary)]"
            >
              ›
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
