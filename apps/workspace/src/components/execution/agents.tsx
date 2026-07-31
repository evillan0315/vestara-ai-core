/**
 * Agents tab — live agent states + their executions.
 */

import { formatTime, tone } from '../../lib/execution';
import { inspectEntity } from '../graph/GraphContext';
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

export function AgentsPanel() {
  const { dashboard, search } = useExecution();
  const agents = dashboard?.agents ?? [];
  const executions = dashboard?.executions ?? [];

  const filtered = agents.filter((a) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      a.name.toLowerCase().includes(q) ||
      a.id.toLowerCase().includes(q) ||
      (a.currentTask ?? '').toLowerCase().includes(q)
    );
  });

  const exFiltered = executions.filter((e) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return e.task.toLowerCase().includes(q) || e.agentId.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-3">
      <div className="exec-card exec-card-body">
        <div className="exec-section-title">Live Agents</div>
        {filtered.length === 0 && <p className="exec-empty">No agent telemetry</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          {filtered.map((a) => {
            const busy = a.status !== 'idle' && a.status !== 'completed';
            return (
              <button
                type="button"
                key={a.id}
                className="exec-agent-card"
                onClick={() => inspectEntity(`agent://${a.id}`)}
                title="Open in Engineering Graph"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-medium text-zinc-100 truncate">{a.name}</span>
                  <span className={`exec-status-chip ${toneClass(tone(a.status))}`}>{a.status}</span>
                </div>
                <div className="text-[10.5px] text-zinc-500 mt-1 truncate" title={a.currentTask}>
                  {a.currentTask || a.detail || 'idle'}
                </div>
                <div className="flex items-center justify-between mt-2 text-[10px] text-zinc-500">
                  <span className="uppercase">{a.currentOperation}</span>
                  <span className="tabular-nums">{(a.elapsedMs / 1000).toFixed(0)}s</span>
                </div>
                <div className="exec-meter-track mt-1">
                  <div
                    className="exec-meter-fill"
                    style={{
                      width: `${Math.max(0, Math.min(100, a.progress))}%`,
                      backgroundColor: busy ? 'var(--vestara-accent)' : 'var(--color-zinc-600)',
                    }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="exec-card exec-card-body">
        <div className="exec-section-title">
          Agent Executions <span className="text-zinc-500">{exFiltered.length}</span>
        </div>
        {exFiltered.length === 0 && <p className="exec-empty">No executions</p>}
        <div className="overflow-auto max-h-[420px]">
          <table className="exec-table">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Task</th>
                <th>Status</th>
                <th>Started</th>
                <th>Artifacts</th>
              </tr>
            </thead>
            <tbody>
              {exFiltered.map((e) => (
                <tr key={e.id}>
                  <td className="font-mono text-[11px]">{e.agentId}</td>
                  <td className="exec-cell-truncate" title={e.task}>
                    {e.task}
                  </td>
                  <td>
                    <span className={`exec-status-chip ${toneClass(tone(e.status))}`}>{e.status}</span>
                  </td>
                  <td className="text-zinc-500">{formatTime(e.startedAt)}</td>
                  <td className="text-zinc-500 text-[11px]">{e.outputArtifacts?.length ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
