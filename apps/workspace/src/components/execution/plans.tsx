/**
 * Plans + Tasks tabs.
 */

import { useMemo } from 'react';
import { formatTime, tone } from '../../lib/execution';
import { useExecution } from './ExecutionContext';

function toneClass(t: string): string {
  return t === 'pass'
    ? 'exec-status-pass'
    : t === 'fail'
      ? 'exec-status-fail'
      : t === 'warn'
        ? 'exec-status-warn'
        : 'exec-status-unknown';
}

interface PlanRow {
  id: string;
  title: string;
  goal: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  tasks: Array<{ id: string; summary: string; status: string; dependencies: string[]; effort?: string }>;
}

function planRows(dashboard: { plans?: Array<Record<string, unknown>> } | null): PlanRow[] {
  return ((dashboard?.plans ?? []) as unknown as PlanRow[]).map((p) => ({
    id: p.id,
    title: p.title || p.goal || p.id,
    goal: p.goal ?? '',
    status: p.status ?? 'draft',
    createdAt: p.createdAt ?? '',
    updatedAt: p.updatedAt ?? p.createdAt ?? '',
    tasks: p.tasks ?? [],
  }));
}

export function PlansPanel() {
  const { dashboard, search } = useExecution();
  const plans = planRows(dashboard);

  const filtered = plans.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return p.title.toLowerCase().includes(q) || p.goal.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-2">
      {filtered.length === 0 && <p className="exec-empty">No plans yet. Generate a plan from the Planning flow.</p>}
      {filtered.map((p) => {
        const done = p.tasks.filter((t) => t.status === 'completed').length;
        const progress =
          p.tasks.length > 0 ? Math.round((done / p.tasks.length) * 100) : p.status === 'completed' ? 100 : 0;
        return (
          <div key={p.id} className="exec-card exec-card-body">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-zinc-100 truncate">{p.title}</div>
                <div className="text-[10.5px] text-zinc-500 truncate">{p.goal}</div>
              </div>
              <span className={`exec-status-chip ${toneClass(tone(p.status))}`}>{p.status}</span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <div className="exec-meter-track flex-1">
                <div className="exec-meter-fill" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-[11px] tabular-nums text-zinc-400">
                {done}/{p.tasks.length} tasks · {progress}%
              </span>
            </div>
            <div className="text-[10px] text-zinc-600 mt-1">
              created {formatTime(p.createdAt)} · updated {formatTime(p.updatedAt)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function TasksPanel() {
  const { dashboard, search } = useExecution();
  const plans = planRows(dashboard);

  const tasks = useMemo(() => {
    const all = plans.flatMap((p) => p.tasks.map((t) => ({ ...t, planId: p.id, planTitle: p.title })));
    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter(
      (t) =>
        t.summary.toLowerCase().includes(q) ||
        t.status.toLowerCase().includes(q) ||
        t.planTitle.toLowerCase().includes(q),
    );
  }, [plans, search]);

  return (
    <div className="exec-card exec-card-body">
      <div className="exec-section-title">
        Tasks <span className="text-zinc-500">{tasks.length}</span>
      </div>
      {tasks.length === 0 && <p className="exec-empty">No tasks across plans yet.</p>}
      <div className="overflow-auto max-h-[60vh]">
        <table className="exec-table">
          <thead>
            <tr>
              <th>Task</th>
              <th>Plan</th>
              <th>Status</th>
              <th>Dependencies</th>
              <th>Effort</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={`${t.planId}:${t.id}`}>
                <td className="text-zinc-200">{t.summary || t.id}</td>
                <td className="text-zinc-500 text-[11px]">{t.planTitle}</td>
                <td>
                  <span className={`exec-status-chip ${toneClass(tone(t.status))}`}>{t.status}</span>
                </td>
                <td className="text-zinc-500 text-[11px]">
                  {t.dependencies && t.dependencies.length > 0 ? t.dependencies.join(', ') : '—'}
                </td>
                <td className="text-zinc-500">{t.effort ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
