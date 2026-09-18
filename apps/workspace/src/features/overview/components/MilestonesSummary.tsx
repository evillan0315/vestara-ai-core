/**
 * VES-OVERVIEW-001: Milestones Summary Component
 *
 * Milestones projection on the existing Overview page (left/main column,
 * after Today's Focus). Consumes the existing milestone authority projection
 * (`GET /api/milestones` → MilestoneService) and renders status only — never
 * status-as-priority, never fabricated progress, blockers, or rows.
 *
 * The canonical status chips ARE the filter: one consolidated control
 * (All | Active | Pending | Planned | Done | Future). Selecting a status
 * shows the full authoritative list for that status. Counts and rows derive
 * from the same dataset. Large lists scroll inside a bounded container.
 *
 * Preserved separations:
 *   Overview ≠ Milestone authority (read-only projection; no writes).
 *   UI filter ≠ milestone state mutation (filtering never touches authority).
 *   Displayed status ≠ inferred status (authority members only; Planned/Future
 *     render truthful empty states while unpopulated).
 *   Status ≠ Priority (separate dimensions; priority is HOLD — the authority
 *     exposes no priority, so none is shown or inferred).
 *   Reaction/status decoration ≠ Approval (chips decorate, never authorize).
 */

import { useMemo, useState } from 'react';
import { useMilestones, type AuthorityMilestone } from '../hooks/useMilestones';
import { SectionCard } from './SectionCard';

type StatusFilter = 'all' | 'Active' | 'Pending' | 'Planned' | 'Done' | 'Future';

const DISPLAY_STATUS: Record<AuthorityMilestone['status'], 'Active' | 'Pending' | 'Done'> = {
  in_progress: 'Active',
  pending: 'Pending',
  completed: 'Done',
};

const STATUS_DOT: Record<'Active' | 'Pending' | 'Done', string> = {
  Active: 'var(--vestara-accent)',
  Pending: 'var(--vestara-text-muted)',
  Done: 'var(--vestara-status-success)',
};

const FILTERS: readonly StatusFilter[] = ['all', 'Active', 'Pending', 'Planned', 'Done', 'Future'];

export function MilestonesSummary() {
  const { data, isLoading } = useMilestones();
  const [filter, setFilter] = useState<StatusFilter>('all');

  const counts = useMemo(() => {
    if (!data) return null;
    const by = (status: AuthorityMilestone['status']) => data.milestones.filter((m) => m.status === status).length;
    return { active: by('in_progress'), pending: by('pending'), done: by('completed'), total: data.milestones.length };
  }, [data]);

  const rows = useMemo(() => {
    if (!data) return [];
    const rank = (m: AuthorityMilestone) => (m.status === 'in_progress' ? 0 : m.status === 'pending' ? 1 : 2);
    const ordered = [...data.milestones].sort((a, b) => rank(a) - rank(b));
    if (filter === 'all') return ordered;
    if (filter === 'Planned' || filter === 'Future') return [];
    return ordered.filter((m) => DISPLAY_STATUS[m.status] === filter);
  }, [data, filter]);

  const pct = data?.progress.total ? Math.round((data.progress.completed / data.progress.total) * 100) : 0;

  if (isLoading) {
    return (
      <SectionCard title="Milestones" index={6}>
        <div className="mpg-skeleton h-32" role="status" aria-label="Loading milestones" />
      </SectionCard>
    );
  }

  if (!data || !counts) {
    return (
      <SectionCard title="Milestones" index={6}>
        <p className="py-4 text-center text-[12px] text-[var(--vestara-text-muted)]">
          Milestone data unavailable — the milestone authority did not respond.
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Milestones" badge={`${counts.active} active`} index={6}>
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter milestones by status">
        {FILTERS.map((option) => {
          const count = option === 'all' ? counts.total : option === 'Active' ? counts.active : option === 'Pending' ? counts.pending : option === 'Done' ? counts.done : 0;
          const selected = filter === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={selected}
              onClick={() => setFilter(option)}
              title={option === 'all' ? `All milestones: ${count}` : `${option}: ${count}`}
              className={`mpg-tag-pill shrink-0 tabular-nums capitalize transition-colors ${
                selected ? 'border-[var(--vestara-accent-border)] text-[var(--vestara-accent-text)]' : ''
              }`}
            >
              {option === 'Active' || option === 'Pending' || option === 'Done' ? (
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_DOT[option] }} />
              ) : null}
              {option === 'all' ? 'All' : option} · {count}
            </button>
          );
        })}
      </div>

      <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--vestara-text-muted)]">
        <span>
          {data.progress.completed} of {data.progress.total} done
        </span>
        <span className="text-[var(--vestara-text-primary)]">{pct}%</span>
      </div>
      <div
        className="mb-3 h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--vestara-text-muted)_18%,transparent)]"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Overall milestone progress"
      >
        <span
          className="block h-full rounded-[inherit] bg-gradient-to-r from-[var(--vestara-marketplace-primary)] to-[var(--vestara-accent)] transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>

      {rows.length === 0 ? (
        <p className="py-4 text-center text-[12px] text-[var(--vestara-text-muted)]">
          {filter === 'Planned' || filter === 'Future'
            ? `No milestones in ${filter} — the milestone authority exposes no corresponding state.`
            : 'No milestones match this filter.'}
        </p>
      ) : (
        <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
          {rows.map((milestone, i) => (
            <li
              key={`${milestone.version}:${milestone.name}:${i}`}
              className="mpg-enter"
              style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
            >
              <div
                className="mpg-category-row px-1"
                title={milestone.description || `${milestone.version} · ${milestone.name}`}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    title={`${DISPLAY_STATUS[milestone.status]}`}
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: STATUS_DOT[DISPLAY_STATUS[milestone.status]] }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] text-[var(--vestara-text-primary)]">
                      <span className="mr-1.5 font-mono text-[11px] text-[var(--vestara-text-muted)]">
                        {milestone.version}
                      </span>
                      {milestone.name}
                    </span>
                    <span className="block truncate text-[11px] text-[var(--vestara-text-muted)]">
                      {milestone.era}
                    </span>
                  </span>
                </span>
                <span className="mpg-tag-pill shrink-0">{DISPLAY_STATUS[milestone.status]}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <details className="mt-3 border-t border-[var(--vestara-border-subtle)] pt-2 text-[11px] leading-relaxed text-[var(--vestara-text-muted)]">
        <summary
          className="cursor-pointer hover:text-[var(--vestara-text-secondary)]"
          title="Status and priority are separate dimensions. Priority is not tracked by the milestone authority, so none is shown. Planned/Future buckets are reserved and currently unpopulated — counts reflect authority state only."
        >
          About status
        </summary>
        <p className="mt-1">
          Status and priority are separate dimensions. Priority is not tracked by the milestone authority, so none is
          shown. Planned/Future buckets are reserved and currently unpopulated — counts reflect authority state only.
        </p>
      </details>
    </SectionCard>
  );
}
