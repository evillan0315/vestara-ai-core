/**
 * Filesystem + Events tabs.
 */

import { useMemo, useState } from 'react';
import type { FsOperation } from '../../lib/execution';
import { executionApi, formatTime, tone } from '../../lib/execution';
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

export function FilesystemPanel() {
  const [ops, setOps] = useState<FsOperation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useMemo(() => {
    void executionApi.filesystem(300).then((d) => {
      setOps(d?.operations ?? []);
      setTotal(d?.total ?? 0);
      setLoading(false);
    });
  }, []);

  const refresh = () => {
    setLoading(true);
    void executionApi.filesystem(300).then((d) => {
      setOps(d?.operations ?? []);
      setTotal(d?.total ?? 0);
      setLoading(false);
    });
  };

  return (
    <div className="exec-card exec-card-body">
      <div className="flex items-center justify-between mb-2">
        <div className="exec-section-title">
          Filesystem Capability Operations <span className="text-zinc-500">{total}</span>
        </div>
        <button type="button" className="exec-btn" onClick={refresh}>
          Refresh
        </button>
      </div>
      {loading && ops.length === 0 && <p className="exec-empty animate-pulse">Loading…</p>}
      {!loading && ops.length === 0 && (
        <p className="exec-empty">
          No filesystem operations recorded yet. They appear here as agents read, write, and search files.
        </p>
      )}
      <div className="overflow-auto max-h-[60vh]">
        <table className="exec-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Agent</th>
              <th>Operation</th>
              <th>Target</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {ops.map((o) => (
              <tr key={o.id}>
                <td className="text-zinc-500">{formatTime(o.timestamp)}</td>
                <td className="font-mono text-[11px]">{o.agent}</td>
                <td className="font-mono text-[11px] text-(--vestara-accent)">{o.operation}</td>
                <td className="exec-cell-truncate font-mono text-[11px]" title={o.target}>
                  {o.target || '—'}
                </td>
                <td>
                  <span className={`exec-status-chip ${toneClass(tone(o.status))}`}>{o.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const EVENT_CATEGORY_TONES: Record<string, string> = {
  agent: 'var(--vestara-purple, #a78bfa)',
  workspace: 'var(--vestara-blue, #60a5fa)',
  planning: 'var(--vestara-amber, #f59e0b)',
  implementation: 'var(--vestara-red, #f87171)',
  verification: 'var(--vestara-green, #4ade80)',
  collaboration: 'var(--vestara-blue, #60a5fa)',
  memory: 'var(--vestara-purple, #a78bfa)',
  conversation: 'var(--vestara-blue, #60a5fa)',
  system: 'var(--color-zinc-500)',
};

export function EventsPanel() {
  const { events, eventsLoading, refreshEvents, search } = useExecution();
  const [level, setLevel] = useState('all');

  const filtered = useMemo(() => {
    let list = events;
    if (level !== 'all') {
      list = list.filter((e) => {
        const s = (e.status ?? e.type ?? '').toLowerCase();
        if (level === 'error') return s.includes('fail') || s.includes('error');
        if (level === 'warning') return s.includes('warn') || s.includes('degraded');
        if (level === 'pass') return s.includes('complete') || s.includes('pass') || s.includes('ok');
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
  }, [events, level, search]);

  return (
    <div className="exec-card exec-card-body">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="exec-section-title">
          Event Stream <span className="text-zinc-500">{filtered.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="exec-input"
            aria-label="Filter by level"
          >
            <option value="all">All levels</option>
            <option value="pass">Success</option>
            <option value="warning">Warnings</option>
            <option value="error">Errors</option>
          </select>
          <button type="button" className="exec-btn" onClick={refreshEvents}>
            Refresh
          </button>
        </div>
      </div>
      {eventsLoading && events.length === 0 && <p className="exec-empty animate-pulse">Streaming events…</p>}
      {filtered.length === 0 && !eventsLoading && <p className="exec-empty">No events yet</p>}
      <div className="exec-event-list">
        {filtered.map((e) => (
          <div
            key={e.id}
            className="exec-event-row"
            style={{ borderLeftColor: EVENT_CATEGORY_TONES[e.category] ?? 'var(--color-zinc-600)' }}
          >
            <div className="flex items-center gap-2 text-[9.5px] text-zinc-500">
              <span className="tabular-nums">{formatTime(e.timestamp)}</span>
              <span className="uppercase" style={{ color: EVENT_CATEGORY_TONES[e.category] }}>
                {e.category}
              </span>
              <span className="text-zinc-600">{e.type}</span>
              {e.status && <span className={`exec-status-chip ${toneClass(tone(e.status))}`}>{e.status}</span>}
              <span className="ml-auto text-zinc-600">{e.actor}</span>
            </div>
            <div className="text-[11px] text-zinc-300 mt-0.5">{e.message}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
