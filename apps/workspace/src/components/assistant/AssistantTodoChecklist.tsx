/**
 * GA-UX-PREMIUM M5A — AssistantTodoChecklist.
 *
 * Presents the runtime OpenCode todo snapshot (assistant.execution.v1
 * task-snapshot) as a single evolving checklist. Truthful to the audited
 * contract:
 * - todo.updated events are COMPLETE replacement snapshots — the latest
 *   snapshot replaces the previous (no append, no per-item event sourcing,
 *   no content-diff lifecycle inference, no fabricated todo IDs).
 * - Status is an arbitrary OpenCode string; only known values are given
 *   visuals; unknown values render neutrally and stay safe.
 * - The summary count is presentation-derived from the snapshot (not runtime
 *   progress). No %, ETA, duration, owner, workflow, milestone, dependency,
 *   verification, or completion timestamps are fabricated.
 *   (OpenCode Todo carries `priority`, but the frozen M3 projection exposes
 *   only title+status — priority is intentionally not rendered.)
 * - Empty snapshots render nothing (no stale todos).
 * Transient: never persisted; the checklist is not reconstructed on reload.
 */

import type { AssistantExecutionDetail } from '@vestara/shared';

export type TodoVisualState = 'completed' | 'in_progress' | 'pending' | 'unknown';

/** Known OpenCode todo status strings → visual state; anything else → unknown. */
export function todoVisualState(status: string): TodoVisualState {
  if (status === 'completed') return 'completed';
  if (status === 'in_progress') return 'in_progress';
  if (status === 'pending') return 'pending';
  return 'unknown';
}

/** Accessible textual label for a visual state. */
export function todoStateLabel(state: TodoVisualState): string {
  switch (state) {
    case 'completed':
      return 'Completed';
    case 'in_progress':
      return 'In progress';
    case 'pending':
      return 'Pending';
    default:
      return 'Unknown status';
  }
}

export interface AssistantTodoChecklistProps {
  detail: AssistantExecutionDetail;
}

export function AssistantTodoChecklist({ detail }: AssistantTodoChecklistProps) {
  if (detail.kind !== 'task-snapshot') return null;
  const todos = detail.todos ?? [];
  if (todos.length === 0) return null;

  const completedCount = todos.filter((todo) => todoVisualState(todo.status) === 'completed').length;
  const progress = todos.length > 0 ? (completedCount / todos.length) * 100 : 0;

  return (
    <div
      data-testid="assistant-todo-checklist"
      role="group"
      aria-label={`Tasks — ${completedCount} of ${todos.length} completed`}
      className="min-w-0 rounded-xl border border-(--vestara-border-default)/70 bg-gradient-to-b from-(--vestara-surface-shell)/80 to-(--vestara-surface-shell)/40 overflow-hidden"
    >
      {/* Progress bar */}
      <div className="h-0.5 w-full bg-(--vestara-surface-interactive)/60">
        <div
          className="h-full bg-gradient-to-r from-(--vestara-accent-light) to-(--vestara-accent) transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
          role="progressbar"
          aria-valuenow={completedCount}
          aria-valuemin={0}
          aria-valuemax={todos.length}
        />
      </div>
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <span className="text-(--vestara-font-size-label) font-semibold tracking-tight text-(--vestara-text-primary)" aria-hidden="true">
          Tasks
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-(--vestara-surface-interactive)/70 px-2 py-0.5 text-(--vestara-font-size-caption) font-medium text-(--vestara-text-secondary) tabular-nums">
          <span className="text-(--vestara-accent-text)/90">{completedCount}</span>
          <span className="text-(--vestara-text-disabled)">/</span>
          <span>{todos.length}</span>
        </span>
      </div>
      <ul className="min-w-0 px-3 pb-2.5 space-y-1">
        {todos.map((todo, index) => {
          const state = todoVisualState(todo.status);
          const stateLabel = todoStateLabel(state);
          const isCompleted = state === 'completed';
          const isActive = state === 'in_progress';
          return (
            <li
              key={index}
              data-testid="todo-item"
              data-status={todo.status}
              data-visual-state={state}
              className="flex min-w-0 items-center gap-2 text-(--vestara-font-size-body-small) leading-snug"
            >
              {/* Status indicator */}
              <span
                aria-label={`${stateLabel}: ${todo.title}`}
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-md ${
                  isCompleted
                    ? 'bg-(--vestara-status-success-bg) text-(--vestara-status-success)'
                    : isActive
                      ? 'bg-(--vestara-accent-bg) text-(--vestara-accent-text)'
                      : 'bg-(--vestara-surface-interactive)/60 text-(--vestara-text-disabled)'
                }`}
              >
                {isCompleted ? (
                  <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : isActive ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-(--vestara-accent) motion-reduce:animate-none animate-pulse" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-(--vestara-surface-interactive-hover)" />
                )}
              </span>
              <span
                className={`min-w-0 break-words ${
                  isCompleted
                    ? 'text-(--vestara-text-muted) line-through decoration-(--vestara-text-disabled)'
                    : isActive
                      ? 'text-(--vestara-text-primary) font-medium'
                      : 'text-(--vestara-text-secondary)'
                }`}
              >
                {todo.title}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}