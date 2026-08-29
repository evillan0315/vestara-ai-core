/**
 * Process explorer tab.
 *
 * Sortable, filterable, searchable process table with a details drawer
 * and a guarded kill action.
 */

import { useMemo, useState } from 'react';
import type { DiagProcess } from '../../lib/diagnostics';
import { diagnosticsApi, formatBytes } from '../../lib/diagnostics';
import { useDiagnostics } from './DiagnosticsContext';

type SortKey = 'pid' | 'cpu' | 'mem' | 'rss' | 'threads' | 'command';
type SortDir = 'asc' | 'desc';

const SORTABLE: SortKey[] = ['pid', 'cpu', 'mem', 'rss', 'threads', 'command'];

function statusTone(status: string): string {
  const s = status.charAt(0);
  if (s === 'R') return 'var(--vestara-green, #4ade80)';
  if (s === 'S' || s === 'I') return 'var(--vestara-blue, #60a5fa)';
  if (s === 'Z') return 'var(--vestara-red, #f87171)';
  return 'var(--color-zinc-500)';
}

export function ProcessExplorer() {
  const { processes, processesTotal, processesThreads, search } = useDiagnostics();
  const [sortKey, setSortKey] = useState<SortKey>('cpu');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterUser, setFilterUser] = useState<string>('all');
  const [selected, setSelected] = useState<DiagProcess | null>(null);
  const [confirmKill, setConfirmKill] = useState<DiagProcess | null>(null);
  const [killResult, setKillResult] = useState<string | null>(null);

  const users = useMemo(() => [...new Set(processes.map((p) => p.user))].sort(), [processes]);

  const rows = useMemo(() => {
    let list = processes;
    if (search.trim()) {
      const q = search.toLowerCase();
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
  }, [processes, search, filterUser, sortKey, sortDir]);

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
        <span className="text-[11px] text-zinc-400">
          {rows.length} shown · {processesTotal.toLocaleString()} processes · {processesThreads.toLocaleString()}{' '}
          threads
        </span>
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
        {killResult && <span className="text-[11px] text-(--vestara-red)">{killResult}</span>}
      </div>

      <div className="overflow-auto diag-table-scroll">
        <table className="diag-table">
          <thead>
            <tr>
              {SORTABLE.map((key) => (
                <th key={key}>
                  <button type="button" className="diag-th-btn" onClick={() => toggleSort(key)}>
                    {key === 'rss' ? 'memory' : key}
                    {sortKey === key && <span className="diag-sort-arrow">{sortDir === 'asc' ? ' ▲' : ' ▼'}</span>}
                  </button>
                </th>
              ))}
              <th>status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
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
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ backgroundColor: statusTone(p.status) }}
                    title={p.status}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="diag-drawer" role="dialog" aria-label="Process details">
          <div className="diag-drawer-panel">
            <div className="diag-drawer-header">
              <span className="font-mono text-[13px] text-zinc-100">
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
                <div key={label} className="flex justify-between gap-3 py-1 border-b border-zinc-800/60 last:border-0">
                  <span className="text-[11px] text-zinc-500">{label}</span>
                  <span className="text-[11.5px] text-zinc-200 font-mono">{value}</span>
                </div>
              ))}
              <div className="mt-3">
                <div className="text-[10px] uppercase text-zinc-500 mb-1">Command</div>
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
            <h3 className="text-[13px] font-semibold text-zinc-100 mb-2">Kill process {confirmKill.pid}?</h3>
            <p className="text-[11.5px] text-zinc-400 mb-4">
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
