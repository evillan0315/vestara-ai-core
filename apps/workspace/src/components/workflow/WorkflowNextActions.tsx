/**
 * WorkflowNextActions — Action needed / Suggested queue panels.
 *
 * Presentation only over the resolver output (getNextActions): ranking,
 * titles, and details come from the lib. Selection hands the project + kind
 * back to the page router. No fetching, no dismissal state — the page owns
 * filtering and navigation.
 */

import { Button } from '@vestara/ui';
import { getNextActions } from '../../lib/orchestration-next-action';
import { NEXT_ACTION_PRECEDENCE } from './workflow-next-action-meta';

export interface WorkflowNextActionButtonProps {
  kind: string;
  projectId: string;
  actionable: boolean;
  onSelect: (projectId: string, kind: string) => void;
}

export function WorkflowNextActionButton({ kind, projectId, actionable, onSelect }: WorkflowNextActionButtonProps) {
  const label =
    kind === 'task-approval'
      ? 'Review approvals'
      : kind === 'task-failure'
        ? 'Open tasks'
        : kind === 'architecture-review'
          ? 'Review gate'
          : kind === 'plan-approval'
            ? 'Review approval'
            : kind === 'resume'
              ? 'Resume'
              : kind === 'progress'
                ? 'Open graph'
                : 'View project';
  return (
    <Button variant={actionable ? 'primary' : 'secondary'} size="sm" onClick={() => onSelect(projectId, kind)}>
      {label}
    </Button>
  );
}

export interface WorkflowNextActionsPanelProps {
  actions: ReturnType<typeof getNextActions>;
  onSelect: (projectId: string, kind: string) => void;
}

export function WorkflowNextActionsPanel({ actions, onSelect }: WorkflowNextActionsPanelProps) {
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
  // Rank is the position in the priority-sorted queue (actions order),
  // not within the Action needed / Suggested subgroup, so #1 outranks #2.
  const rankByKey = new Map(actions.map((action, index) => [`${action.projectId}-${action.kind}`, index + 1]));
  const whyLabel = (action: (typeof actions)[number]): string => {
    const rank = rankByKey.get(`${action.projectId}-${action.kind}`) ?? 1;
    return `#${rank} of ${actions.length} · ${NEXT_ACTION_PRECEDENCE[action.kind]}`;
  };
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
                  <p className="mt-0.5 text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">{action.detail}</p>
                  <p
                    className="mt-0.5 font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]"
                    title={`Queue order: ${whyLabel(action)}`}
                  >
                    {whyLabel(action)}
                  </p>
                </div>
                <WorkflowNextActionButton
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
                <p className="truncate text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-secondary)]">{action.title}</p>
                <p
                  className="truncate font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]"
                  title={`Queue order: ${whyLabel(action)} — ${action.detail}`}
                >
                  {whyLabel(action)}
                </p>
              </div>
              <WorkflowNextActionButton
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
