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
      className="min-w-0 rounded-xl border border-zinc-800/70 bg-gradient-to-b from-zinc-900/80 to-zinc-900/40 overflow-hidden"
    >
      {/* Progress bar */}
      <div className="h-0.5 w-full bg-zinc-800/60">
        <div
          className="h-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
          role="progressbar"
          aria-valuenow={completedCount}
          aria-valuemin={0}
          aria-valuemax={todos.length}
        />
      </div>
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <span className="text-[11px] font-semibold tracking-tight text-zinc-300" aria-hidden="true">
          Tasks
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800/70 px-2 py-0.5 text-[10px] font-medium text-zinc-400 tabular-nums">
          <span className="text-amber-400/90">{completedCount}</span>
          <span className="text-zinc-600">/</span>
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
              className="flex min-w-0 items-center gap-2 text-[12px] leading-snug"
            >
              {/* Status indicator */}
              <span
                aria-label={`${stateLabel}: ${todo.title}`}
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-md ${
                  isCompleted
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : isActive
                      ? 'bg-amber-500/15 text-amber-400'
                      : 'bg-zinc-800/60 text-zinc-600'
                }`}
              >
                {isCompleted ? (
                  <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : isActive ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400 motion-reduce:animate-none animate-pulse" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
                )}
              </span>
              <span
                className={`min-w-0 break-words ${
                  isCompleted
                    ? 'text-zinc-500 line-through decoration-zinc-700'
                    : isActive
                      ? 'text-zinc-100 font-medium'
                      : 'text-zinc-400'
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