/**
 * Projects tab — project monitor table.
 */

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

export function ProjectsPanel() {
  const { dashboard, search } = useExecution();
  const projects = dashboard?.projects ?? [];

  const filtered = projects.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.status ?? '').toLowerCase().includes(q);
  });

  return (
    <div className="exec-card exec-card-body">
      <div className="exec-section-title">Projects</div>
      {filtered.length === 0 && <p className="exec-empty">No projects yet. Create one from the Projects page.</p>}
      <div className="overflow-auto max-h-[60vh]">
        <table className="exec-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Created</th>
              <th>Updated</th>
              <th>Stats</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const s = (p.stats ?? {}) as Record<string, unknown>;
              const statSummary = Object.entries(s)
                .filter(([, v]) => typeof v === 'number')
                .map(([k, v]) => `${k}: ${v}`)
                .slice(0, 3)
                .join(' · ');
              return (
                <tr key={p.id}>
                  <td className="text-zinc-100 font-medium">{p.name}</td>
                  <td>
                    <span className={`exec-status-chip ${toneClass(tone(p.status))}`}>{p.status ?? '—'}</span>
                  </td>
                  <td className="text-zinc-500">{formatTime(p.createdAt)}</td>
                  <td className="text-zinc-500">{p.updatedAt ? formatTime(p.updatedAt) : '—'}</td>
                  <td className="text-zinc-400 text-[11px]">{statSummary || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
