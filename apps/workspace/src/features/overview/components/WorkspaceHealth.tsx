/**
 * VES-OVERVIEW-001: Workspace Health (issues at a glance)
 *
 * Surfaces the "how do I know if Vestara has issues?" signals directly on
 * the Overview: API liveness, CI connection, working-tree state, and stale
 * CI waits. API-first via useOverview with fixture fallback — never hollow.
 *
 * Visuals are token-only (var(--vestara-*) / var(--ov-*)): no hex, no
 * arbitrary utilities, no inline color literals.
 */

import { Link } from 'react-router-dom';
import type { OverviewHealthSummary } from '../overview.types';
import { SectionCard } from './SectionCard';

function dotColor(state: string): string {
  if (state === 'healthy' || state === 'connected') return 'var(--vestara-status-success)';
  if (state === 'degraded' || state === 'configured') return 'var(--vestara-status-warning)';
  if (state === 'error') return 'var(--vestara-status-error)';
  return 'var(--vestara-text-muted)';
}

function dotGlow(state: string): string {
  const color = dotColor(state);
  return color === 'var(--vestara-text-muted)' ? 'none' : `0 0 6px ${color}`;
}

export function WorkspaceHealth({ health }: { health: OverviewHealthSummary }) {
  const rows = [
    {
      label: 'API',
      value: health.api,
      note: health.api === 'healthy' ? 'live' : 'check diagnostics',
    },
    {
      label: 'CI',
      value: health.ciConnection,
      note:
        health.ciConnection === 'connected'
          ? 'reachability verified'
          : health.ciConnection === 'configured'
            ? 'credential set — probe pending'
            : 'not configured',
    },
    {
      label: 'Git tree',
      value: health.gitDirty ? 'dirty' : 'clean',
      note: health.gitDirty ? 'uncommitted changes' : 'no local changes',
    },
  ];

  const attention = health.api === 'error' || health.ciConnection === 'error' || health.staleWaits > 0;
  const accent = attention ? 'var(--vestara-status-warning)' : 'var(--vestara-status-success)';

  return (
    <SectionCard title="Workspace health" actionLabel="Diagnostics" actionHref="/diagnostics" accent={accent} index={4}>
      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.label}
            className="mpg-category-row text-[12.5px] text-[var(--vestara-text-secondary)]"
            title={`${row.label}: ${row.value} — ${row.note}`}
          >
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: dotColor(row.value), boxShadow: dotGlow(row.value) }}
              />
              {row.label}
            </span>
            <span className="flex items-center gap-2">
              <span className="text-[var(--vestara-text-muted)]">{row.note}</span>
              <span className="font-medium tabular-nums text-[var(--vestara-text-primary)]">{row.value}</span>
            </span>
          </div>
        ))}
        {health.staleWaits > 0 && (
          <p className="text-[12px] text-[var(--vestara-status-warning)]">
            {health.staleWaits} stale CI wait{health.staleWaits === 1 ? '' : 's'} need attention.
          </p>
        )}
        {health.detail && <p className="text-[12px] text-[var(--vestara-text-muted)]">{health.detail}</p>}
        <div className="flex items-center justify-between gap-2 pt-1">
          <Link to="/activity" className="mpg-link">
            Activity<span aria-hidden="true"> ›</span>
          </Link>
          <Link to="/diagnostics" className="mpg-link">
            Details<span aria-hidden="true"> ›</span>
          </Link>
        </div>
      </div>
    </SectionCard>
  );
}
