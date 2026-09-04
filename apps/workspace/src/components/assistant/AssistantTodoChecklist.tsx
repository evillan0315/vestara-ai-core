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

  return (
    <div
      data-testid="assistant-todo-checklist"
      role="group"
      aria-label={`Tasks — ${completedCount} of ${todos.length} completed`}
      className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/60"
    >
      <div className="flex items-center justify-between px-2.5 pt-1.5">
        <span className="text-[11px] font-medium text-zinc-400" aria-hidden="true">
          Tasks
        </span>
        <span className="text-[10px] text-zinc-600 tabular-nums">
          {completedCount} of {todos.length} completed
        </span>
      </div>
      <ul className="min-w-0 px-2.5 py-1.5 space-y-0.5">
        {todos.map((todo, index) => {
          const state = todoVisualState(todo.status);
          const stateLabel = todoStateLabel(state);
          const marker = state === 'completed' ? '✓' : state === 'in_progress' ? '●' : state === 'pending' ? '○' : '•';
          return (
            <li
              key={index}
              data-testid="todo-item"
              data-status={todo.status}
              data-visual-state={state}
              className="flex min-w-0 items-baseline gap-1.5 text-[12px] leading-snug"
            >
              {/* Accessible state text accompanies the glyph — never icon-only. */}
              <span
                aria-label={`${stateLabel}: ${todo.title}`}
                className={`w-3 shrink-0 select-none text-center ${
                  state === 'completed'
                    ? 'text-emerald-500/80'
                    : state === 'in_progress'
                      ? 'text-amber-500/90'
                      : state === 'pending'
                        ? 'text-zinc-600'
                        : 'text-zinc-700'
                }`}
              >
                {marker}
              </span>
              <span
                className={`min-w-0 break-words ${
                  state === 'completed'
                    ? 'text-zinc-500'
                    : state === 'in_progress'
                      ? 'text-zinc-200'
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