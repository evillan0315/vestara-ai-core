/**
 * AR-UI-C10: Work Tab Component
 *
 * Displays task/execution inspection for an agent in the Activity Room drawer.
 * Shows current work, execution history, and task progress.
 *
 * Architecture Traceability:
 *   AR-UI-C: Reusable Participant Drawer (phases 7-13)
 *   Phase 10: AR-UX-100..103 — Work Tab
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import { useCallback, useEffect, useState } from 'react';
import type { ParticipantProjection } from '@vestara/activity-room';

// ─── Types ─────────────────────────────────────────────────────

export interface WorkTabProps {
  /** Agent ID */
  agentId: string;

  /** Participant projection from Activity Room */
  participant: ParticipantProjection;
}

export interface ExecutionRecord {
  /** Execution ID */
  readonly id: string;

  /** Task being executed */
  readonly task: string;

  /** Execution status */
  readonly status: 'queued' | 'running' | 'completed' | 'failed';

  /** Start time (ISO-8601) */
  readonly startedAt: string;

  /** End time (ISO-8601, if completed) */
  readonly completedAt?: string;

  /** Duration in milliseconds */
  readonly durationMs?: number;

  /** Result summary (if completed) */
  readonly result?: string;

  /** Error message (if failed) */
  readonly error?: string;

  /** Progress percentage (0-100) */
  readonly progress?: number;
}

// ─── Status Styling ────────────────────────────────────────────

const STATUS_STYLES: Record<string, { dot: string; label: string; bg: string }> = {
  running: { dot: 'bg-emerald-400', label: 'Running', bg: 'bg-emerald-500/10' },
  queued: { dot: 'bg-amber-400', label: 'Queued', bg: 'bg-amber-500/10' },
  completed: { dot: 'bg-blue-400', label: 'Completed', bg: 'bg-blue-500/10' },
  failed: { dot: 'bg-red-400', label: 'Failed', bg: 'bg-red-500/10' },
};

// ─── Current Work Component ────────────────────────────────────

function CurrentWork({ participant }: { participant: ParticipantProjection }) {
  const assignment = participant.currentAssignment;
  const workState = participant.workState;

  if (!assignment && workState === 'available') {
    return (
      <div className="rounded-xl border border-(--vestara-border) bg-(--vestara-surface) p-4">
        <div className="text-[9px] uppercase tracking-widest text-(--vestara-text-dim) mb-2">
          Current Work
        </div>
        <div className="flex items-center gap-2 text-sm text-(--vestara-text-muted)">
          <span className="w-2 h-2 rounded-full bg-zinc-500" />
          <span>No active work</span>
        </div>
        <p className="mt-2 text-[10px] text-(--vestara-text-muted)">
          Agent is available for new tasks.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg) p-4">
      <div className="text-[9px] uppercase tracking-widest text-(--vestara-text-dim) mb-2">
        Current Work
      </div>

      {assignment && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${
              workState === 'working' ? 'bg-emerald-400 animate-pulse' :
              workState === 'waiting' ? 'bg-amber-400' :
              workState === 'blocked' ? 'bg-red-400' :
              'bg-zinc-500'
            }`} />
            <span className="text-sm font-medium text-(--vestara-text-1)">
              {assignment.taskTitle ?? assignment.taskId ?? 'Unnamed Task'}
            </span>
          </div>

          {assignment.taskId && (
            <div className="text-[10px] text-(--vestara-text-muted)">
              Task ID: {assignment.taskId}
            </div>
          )}

          {assignment.workflowId && (
            <div className="text-[10px] text-(--vestara-text-muted)">
              Workflow: {assignment.workflowId}
            </div>
          )}

          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-(--vestara-text-muted)">State:</span>
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
              workState === 'working' ? 'bg-emerald-500/20 text-emerald-400' :
              workState === 'waiting' ? 'bg-amber-500/20 text-amber-400' :
              workState === 'blocked' ? 'bg-red-500/20 text-red-400' :
              workState === 'attention-required' ? 'bg-purple-500/20 text-purple-400' :
              'bg-zinc-500/20 text-zinc-400'
            }`}>
              {workState}
            </span>
          </div>
        </div>
      )}

      {!assignment && workState !== 'available' && (
        <div className="flex items-center gap-2 text-sm text-(--vestara-text-1)">
          <span className={`w-2 h-2 rounded-full ${
            workState === 'working' ? 'bg-emerald-400' :
            workState === 'waiting' ? 'bg-amber-400' :
            'bg-zinc-500'
          }`} />
          <span>Work state: {workState}</span>
        </div>
      )}
    </div>
  );
}

// ─── Execution History Component ───────────────────────────────

function ExecutionHistory({ executions }: { executions: ExecutionRecord[] }) {
  if (executions.length === 0) {
    return (
      <div className="rounded-xl border border-(--vestara-border) bg-(--vestara-surface) p-4">
        <div className="text-[9px] uppercase tracking-widest text-(--vestara-text-dim) mb-2">
          Execution History
        </div>
        <p className="text-[10px] text-(--vestara-text-muted)">
          No recent executions found.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-(--vestara-border) bg-(--vestara-surface) p-4">
      <div className="text-[9px] uppercase tracking-widest text-(--vestara-text-dim) mb-3">
        Execution History ({executions.length})
      </div>

      <div className="space-y-2">
        {executions.map((exec) => {
          const style = STATUS_STYLES[exec.status] ?? STATUS_STYLES.queued;
          const duration = exec.durationMs
            ? `${Math.round(exec.durationMs / 1000)}s`
            : exec.completedAt
              ? `${Math.round((new Date(exec.completedAt).getTime() - new Date(exec.startedAt).getTime()) / 1000)}s`
              : null;

          return (
            <div
              key={exec.id}
              className={`flex items-start gap-3 p-2 rounded-lg ${style.bg}`}
            >
              <span className={`mt-1 w-2 h-2 rounded-full ${style.dot}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-(--vestara-text-1) truncate">
                    {exec.task}
                  </span>
                  <span className="text-[9px] text-(--vestara-text-muted)">{style.label}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-(--vestara-text-muted)">
                  <span>{new Date(exec.startedAt).toLocaleTimeString()}</span>
                  {duration && <span>· {duration}</span>}
                </div>
                {exec.progress !== undefined && exec.status === 'running' && (
                  <div className="mt-1 h-1 bg-zinc-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-400 rounded-full transition-all duration-300"
                      style={{ width: `${exec.progress}%` }}
                    />
                  </div>
                )}
                {exec.result && (
                  <div className="mt-1 text-[10px] text-(--vestara-text-2) line-clamp-2">
                    {exec.result}
                  </div>
                )}
                {exec.error && (
                  <div className="mt-1 text-[10px] text-red-400 line-clamp-2">
                    {exec.error}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Work Tab Component ───────────────────────────────────

export function WorkTab({ agentId, participant }: WorkTabProps) {
  const [executions, setExecutions] = useState<ExecutionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch execution history
  useEffect(() => {
    if (!agentId) return;

    let cancelled = false;

    const fetchExecutions = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/stats`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setExecutions(data.recentExecutions ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch executions');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchExecutions();

    return () => { cancelled = true; };
  }, [agentId]);

  if (loading && executions.length === 0) {
    return (
      <div className="py-8 text-center text-[10px] text-(--vestara-text-muted)">
        Loading work data…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-(--vestara-red-border) bg-(--vestara-red-bg) px-3 py-2 text-[10px] text-(--vestara-red)">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CurrentWork participant={participant} />
      <ExecutionHistory executions={executions} />
    </div>
  );
}
