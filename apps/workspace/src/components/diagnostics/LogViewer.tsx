/**
 * Logs tab — centralized event timeline (activity + agent telemetry) with
 * filtering, search, and CSV export.
 */

import { useMemo, useState } from 'react';
import { formatTime } from '../../lib/diagnostics';
import { useDiagnostics } from './DiagnosticsContext';

const CATEGORY_TONES: Record<string, string> = {
  agent: 'var(--vestara-purple, #a78bfa)',
  workspace: 'var(--vestara-blue, #60a5fa)',
  planning: 'var(--vestara-amber, #f59e0b)',
  implementation: 'var(--vestara-red, #f87171)',
  verification: 'var(--vestara-green, #4ade80)',
  collaboration: 'var(--vestara-blue, #60a5fa)',
  memory: 'var(--vestara-purple, #a78bfa)',
  conversation: 'var(--vestara-blue, #60a5fa)',
  profile: 'var(--vestara-green, #4ade80)',
  system: 'var(--color-zinc-500)',
};

export function LogViewer() {
  const { events, eventsLoading, refreshEvents, search } = useDiagnostics();
  const [category, setCategory] = useState('all');
  const [level, setLevel] = useState('all');

  const categories = useMemo(() => [...new Set(events.map((e) => e.category))].sort(), [events]);

  const filtered = useMemo(() => {
    let list = events;
    if (category !== 'all') list = list.filter((e) => e.category === category);
    if (level !== 'all') {
      list = list.filter((e) => {
        const s = (e.status ?? e.type ?? '').toLowerCase();
        if (level === 'error') return s.includes('fail') || s.includes('error');
        if (level === 'warning') return s.includes('warn') || s.includes('degraded');
        if (level === 'pass') return s.includes('complete') || s.includes('pass');
        return true;
      });
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.message.toLowerCase().includes(q) || e.type.toLowerCase().includes(q) || e.actor.toLowerCase().includes(q),
      );
    }
    return list;
  }, [events, category, level, search]);

  const exportCsv = () => {
    const csv = [
      'timestamp,category,type,actor,status,message',
      ...filtered.map((e) =>
        [e.timestamp, e.category, e.type, e.actor, e.status ?? '', `"${e.message.replace(/"/g, '""')}"`].join(','),
      ),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vestara-diagnostics-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="diag-card diag-card-body">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="diag-section-title">
          Event Timeline <span className="text-zinc-500">{filtered.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="diag-input"
            aria-label="Filter by category"
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="diag-input"
            aria-label="Filter by level"
          >
            <option value="all">All levels</option>
            <option value="pass">Success</option>
            <option value="warning">Warnings</option>
            <option value="error">Errors</option>
          </select>
          <button type="button" className="diag-btn" onClick={exportCsv}>
            Export CSV
          </button>
          <button type="button" className="diag-btn" onClick={refreshEvents}>
            Refresh
          </button>
        </div>
      </div>

      {eventsLoading && events.length === 0 && <p className="diag-empty">Loading events…</p>}
      {filtered.length === 0 && !eventsLoading && <p className="diag-empty">No matching events</p>}

      <div className="diag-event-list">
        {filtered.map((e) => (
          <div
            key={e.id}
            className="diag-event-row"
            style={{ borderLeftColor: CATEGORY_TONES[e.category] ?? 'var(--color-zinc-600)' }}
          >
            <div className="flex items-center gap-2 text-[9.5px] text-zinc-500">
              <span className="tabular-nums">{formatTime(e.timestamp)}</span>
              <span className="uppercase" style={{ color: CATEGORY_TONES[e.category] }}>
                {e.category}
              </span>
              <span className="text-zinc-600">{e.type}</span>
              {e.status && <span className="diag-status-chip">{e.status}</span>}
              <span className="ml-auto text-zinc-600">{e.actor}</span>
            </div>
            <div className="text-[11px] text-zinc-300 mt-0.5">{e.message}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
