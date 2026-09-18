/**
 * Process explorer tab.
 *
 * Sortable, filterable, searchable process table with a details drawer
 * and a guarded kill action.
 */

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { DiagProcess } from '../../lib/diagnostics';
import { diagnosticsApi, formatBytes } from '../../lib/diagnostics';
import { useDiagnostics } from './DiagnosticsContext';

type SortKey = 'pid' | 'cpu' | 'mem' | 'rss' | 'threads' | 'command';
type SortDir = 'asc' | 'desc';

const COLUMNS: Array<{ key: SortKey | null; label: string }> = [
  { key: 'pid', label: 'PID' },
  { key: null, label: 'PPID' },
  { key: null, label: 'User' },
  { key: 'cpu', label: 'CPU' },
  { key: 'mem', label: 'MEM' },
  { key: 'rss', label: 'RSS' },
  { key: 'threads', label: 'Threads' },
  { key: 'command', label: 'Command' },
  { key: null, label: 'Status' },
];

const PAGE_SIZE = 100;

function statusDotClass(status: string): string {
  const s = status.charAt(0);
  if (s === 'R') return 'diag-dot diag-dot-ok';
  if (s === 'S' || s === 'I') return 'diag-dot diag-dot-info';
  if (s === 'Z') return 'diag-dot diag-dot-bad';
  return 'diag-dot diag-dot-muted';
}

export function ProcessExplorer() {
  const { processes, processesTotal, processesThreads, search, setSearch } = useDiagnostics();
  const [sortKey, setSortKey] = useState<SortKey>('cpu');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterUser, setFilterUser] = useState<string>('all');
  const [selected, setSelected] = useState<DiagProcess | null>(null);
  const [confirmKill, setConfirmKill] = useState<DiagProcess | null>(null);
  const [killResult, setKillResult] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  // Local query state keeps typing smooth: filtering runs on the deferred
  // value while the shared (persisted) search only updates debounced.
  const [query, setQuery] = useState(search);
  const deferredQuery = useDeferredValue(query);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (query !== search) setSearch(query);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [query, search, setSearch]);

  const users = useMemo(() => [...new Set(processes.map((p) => p.user))].sort(), [processes]);

  const rows = useMemo(() => {
    let list = processes;
    if (deferredQuery.trim()) {
      const q = deferredQuery.toLowerCase();
      list = list.filter(
        (p) => p.command.toLowerCase().includes(q) || p.user.toLowerCase().includes(q) || String(p.pid).includes(q),
      );
    }
    if (filterUser !== 'all') list = list.filter((p) => p.user === filterUser);
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortKey === 'command') return a.command.localeCompare(b.command) * dir;
      return (a[sortKey] - b[sortKey]) * dir;
    });
  }, [processes, deferredQuery, filterUser, sortKey, sortDir]);

  // Reset to the first page when the view definition changes — but not on
  // live data refresh, so polling never yanks the user's scroll position.
  useEffect(() => {
    setPage(0);
  }, [deferredQuery, filterUser, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visibleRows = rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'command' || key === 'pid' ? 'asc' : 'desc');
    }
  };

  const confirmAndKill = async (p: DiagProcess) => {
    const res = await diagnosticsApi.kill(p.pid);
    setKillResult(res.ok ? `Sent SIGTERM to ${p.pid} (${p.command})` : `Failed: ${res.error ?? 'unknown'}`);
    setConfirmKill(null);
    setKillResult(res.ok ? null : (res.error ?? ''));
    window.setTimeout(() => setKillResult(null), 4000);
  };

  return (
    <div className="diag-card diag-card-body">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-[11px] text-[var(--vestara-text-muted)]">
          {rows.length} shown · {processesTotal.toLocaleString()} processes · {processesThreads.toLocaleString()}{' '}
          threads
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by command, user, or PID…"
          aria-label="Filter processes"
          className="diag-input"
        />
        <select
          value={filterUser}
          onChange={(e) => setFilterUser(e.target.value)}
          className="diag-input"
          aria-label="Filter by user"
        >
          <option value="all">All users</option>
          {users.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        {killResult && <span className="text-[11px] text-[var(--vestara-status-error)]">{killResult}</span>}
      </div>

      <div className="overflow-auto diag-table-scroll">
        <table className="diag-table">
          <thead>
            <tr>
              {COLUMNS.map((col) =>
                col.key ? (
                  <th key={col.key} scope="col">
                    <button type="button" className="diag-th-btn" onClick={() => toggleSort(col.key as SortKey)}>
                      {col.label}
                      {sortKey === col.key && (
                        <span className="diag-sort-arrow">{sortDir === 'asc' ? ' ▲' : ' ▼'}</span>
                      )}
                    </button>
                  </th>
                ) : (
                  <th key={col.label} scope="col">
                    {col.label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((p) => (
              <tr key={p.pid} onClick={() => setSelected(p)} className="diag-row-click">
                <td className="font-mono">{p.pid}</td>
                <td className="font-mono">{p.ppid}</td>
                <td>{p.user}</td>
                <td className="text-right tabular-nums">{p.cpu.toFixed(1)}%</td>
                <td className="text-right tabular-nums">{p.mem.toFixed(1)}%</td>
                <td className="text-right tabular-nums">{formatBytes(p.rss)}</td>
                <td className="text-right tabular-nums">{p.threads}</td>
                <td className="diag-proc-cmd" title={p.command}>
                  {p.command}
                </td>
                <td>
                  <span className={statusDotClass(p.status)} title={p.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <nav className="mt-2 flex flex-wrap items-center gap-2" aria-label="Process pages">
          <button
            type="button"
            className="diag-btn"
            disabled={safePage === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Previous
          </button>
          <span className="text-[11px] tabular-nums text-[var(--vestara-text-muted)]" aria-live="polite">
            Showing {safePage * PAGE_SIZE + 1}–{Math.min(rows.length, (safePage + 1) * PAGE_SIZE)} of{' '}
            {rows.length.toLocaleString()}
          </span>
          <button
            type="button"
            className="diag-btn"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            Next
          </button>
        </nav>
      )}

      {selected && (
        <div className="diag-drawer" role="dialog" aria-label="Process details">
          <div className="diag-drawer-panel">
            <div className="diag-drawer-header">
              <span className="font-mono text-[13px] text-[var(--vestara-text-primary)]">
                {selected.pid} · {selected.command.split(' ')[0]}
              </span>
              <button
                type="button"
                className="diag-close-btn"
                onClick={() => setSelected(null)}
                aria-label="Close details"
              >
                ✕
              </button>
            </div>
            <div className="diag-drawer-body">
              {(
                [
                  ['PID', selected.pid],
                  ['Parent PID', selected.ppid],
                  ['User', selected.user],
                  ['Status', selected.status],
                  ['CPU', `${selected.cpu.toFixed(1)}%`],
                  ['Memory', `${selected.mem.toFixed(1)}%`],
                  ['RSS', formatBytes(selected.rss)],
                  ['Virtual', formatBytes(selected.vsz)],
                  ['Threads', selected.threads],
                  ['Elapsed', selected.etime],
                ] as Array<[string, string | number]>
              ).map(([label, value]) => (
                <div
                  key={label}
                  className="flex justify-between gap-3 py-1 border-b border-[var(--vestara-border-subtle)] last:border-0"
                >
                  <span className="text-[11px] text-[var(--vestara-text-muted)]">{label}</span>
                  <span className="text-[11.5px] text-[var(--vestara-text-secondary)] font-mono">{value}</span>
                </div>
              ))}
              <div className="mt-3">
                <div className="text-[10px] uppercase text-[var(--vestara-text-muted)] mb-1">Command</div>
                <code className="diag-code-block">{selected.command}</code>
              </div>
              <div className="flex gap-2 mt-4">
                <button type="button" className="diag-btn-danger" onClick={() => setConfirmKill(selected)}>
                  Kill process
                </button>
                <button
                  type="button"
                  className="diag-btn"
                  onClick={() => void navigator.clipboard.writeText(String(selected.pid))}
                >
                  Copy PID
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmKill && (
        <div className="diag-modal" role="alertdialog" aria-label="Confirm kill process">
          <div className="diag-modal-panel">
              <h3 className="text-[13px] font-semibold text-[var(--vestara-text-primary)] mb-2">
                Kill process {confirmKill.pid}?
              </h3>
              <p className="text-[11.5px] text-[var(--vestara-text-muted)] mb-4">
              <code className="diag-code-inline">{confirmKill.command.slice(0, 120)}</code>
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" className="diag-btn" onClick={() => setConfirmKill(null)}>
                Cancel
              </button>
              <button type="button" className="diag-btn-danger" onClick={() => void confirmAndKill(confirmKill)}>
                Send SIGTERM
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
