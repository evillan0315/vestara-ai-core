/**
 * GA-EXEC-001: ExecutionTray
 *
 * Composer-attached execution surface shown above the composer during an
 * active turn. Shows compact runtime info with expand/collapse for full
 * task list.
 *
 * Collapsed:  ● Working · Task 2/7 · 3 operations · 2m 14s
 * Expanded:   Full task list with completed/active/pending states
 *
 * When idle with custom config: Custom limits active
 * When idle without custom config: not rendered
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssistantExecutionDetail } from '@vestara/shared';
import { AssistantTodoChecklist, todoVisualState } from './AssistantTodoChecklist';

// ─── Types ───────────────────────────────────────────────────

export interface ExecutionTrayProps {
  /** Whether a turn is currently executing. */
  active: boolean;
  /** Current operation/tool call count. */
  operationCount?: number;
  /** Whether custom execution limits are configured. */
  isCustom?: boolean;
  /** Turn start timestamp (ms since epoch). */
  turnStartedAt?: number;
  /** Latest runtime todo snapshot (task checklist). */
  taskSnapshot?: AssistantExecutionDetail | null;
  /** Whether execution has been cancelled by the user. */
  cancelled?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

function getTaskProgress(taskSnapshot: AssistantExecutionDetail | null | undefined): {
  completed: number;
  total: number;
  activeTitle: string | null;
} {
  if (!taskSnapshot || taskSnapshot.kind !== 'task-snapshot' || !taskSnapshot.todos) {
    return { completed: 0, total: 0, activeTitle: null };
  }
  const todos = taskSnapshot.todos;
  const completed = todos.filter((t) => todoVisualState(t.status) === 'completed').length;
  const active = todos.find((t) => todoVisualState(t.status) === 'in_progress');
  return { completed, total: todos.length, activeTitle: active?.title ?? null };
}

// ─── Component ───────────────────────────────────────────────

export function ExecutionTray({
  active,
  operationCount = 0,
  isCustom,
  turnStartedAt,
  taskSnapshot,
  cancelled,
}: ExecutionTrayProps) {
  const [elapsed, setElapsed] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active || !turnStartedAt) {
      setElapsed(0);
      setExpanded(false);
      return;
    }
    const tick = () => setElapsed(Date.now() - turnStartedAt);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [active, turnStartedAt]);

  // Close on Escape when expanded
  useEffect(() => {
    if (!expanded) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setExpanded(false);
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [expanded]);

  const toggleExpanded = useCallback(() => setExpanded((v) => !v), []);

  // Don't render when idle and no custom config
  if (!active && !isCustom) return null;

  // Active turn — show compact status with expand/collapse
  if (active) {
    const { completed, total, activeTitle } = getTaskProgress(taskSnapshot);
    const hasTasks = total > 0;

    return (
      <div ref={containerRef} className="relative" data-testid="execution-tray">
        {/* Compact status line */}
        <div className="flex items-center gap-2 px-3 py-1 text-[10px] text-zinc-500">
          {/* Pulsing dot */}
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />
          </span>

          {/* Status text */}
          <span className="shrink-0">
            {cancelled ? 'Cancelled' : 'Working'}
          </span>

          {/* Task progress */}
          {hasTasks && (
            <>
              <span className="text-zinc-700">·</span>
              <button
                type="button"
                onClick={toggleExpanded}
                aria-expanded={expanded}
                aria-label={expanded ? 'Collapse task list' : 'Expand task list'}
                className="flex items-center gap-1 cursor-pointer hover:text-zinc-300 transition-colors"
              >
                <span className="text-amber-400/80">
                  {completed}/{total}
                </span>
                <span>task{total !== 1 ? 's' : ''}</span>
                <svg
                  className={`h-2.5 w-2.5 shrink-0 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </>
          )}

          {/* Active task name */}
          {activeTitle && (
            <>
              <span className="text-zinc-700">·</span>
              <span className="truncate text-zinc-400 max-w-[160px]" title={activeTitle}>
                {activeTitle}
              </span>
            </>
          )}

          {/* Operation count */}
          {operationCount > 0 && (
            <>
              <span className="text-zinc-700">·</span>
              <span>{operationCount} op{operationCount !== 1 ? 's' : ''}</span>
            </>
          )}

          {/* Elapsed time */}
          <span className="text-zinc-700">·</span>
          <span className="tabular-nums">{formatElapsed(elapsed)}</span>
        </div>

        {/* Expanded task list — floats above composer */}
        {expanded && hasTasks && (
          <div className="absolute bottom-full mb-1 left-3 right-3 z-50 max-h-[240px] overflow-y-auto rounded-xl border border-zinc-800/60 bg-zinc-950/95 shadow-[0_-8px_32px_-8px_rgba(0,0,0,0.6)] backdrop-blur-xl">
            <div className="p-2">
              <AssistantTodoChecklist detail={taskSnapshot!} />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Idle with custom config
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 text-[10px] text-zinc-600" data-testid="execution-tray-idle">
      <svg className="h-2.5 w-2.5 text-amber-500/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      <span>Custom limits active</span>
    </div>
  );
}
