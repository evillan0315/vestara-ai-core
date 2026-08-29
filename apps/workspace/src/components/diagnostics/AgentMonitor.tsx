/**
 * AI runtime tab — live agent states and execution timeline.
 */

import { formatTime, statusTone } from '../../lib/diagnostics';
import { useDiagnostics } from './DiagnosticsContext';

function toneClass(tone: string): string {
  return tone === 'pass'
    ? 'diag-status-pass'
    : tone === 'fail'
      ? 'diag-status-fail'
      : tone === 'warn'
        ? 'diag-status-warn'
        : 'diag-status-unknown';
}

export function AgentMonitor() {
  const { agents, executions, agentsLoading, refreshAgents, search } = useDiagnostics();

  const filteredExecutions = executions.filter((e) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      e.task.toLowerCase().includes(q) || e.agentId.toLowerCase().includes(q) || e.status.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-3">
      <div className="diag-card diag-card-body">
        <div className="flex items-center justify-between mb-3">
          <div className="diag-section-title">Agents</div>
          <button type="button" className="diag-btn" onClick={refreshAgents}>
            Refresh
          </button>
        </div>
        {agentsLoading && agents.length === 0 && <p className="diag-empty">Loading agents…</p>}
        {agents.length === 0 && !agentsLoading && <p className="diag-empty">No agent telemetry yet</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          {agents.map((a) => {
            const tone = statusTone(a.status);
            const busy = a.status !== 'idle' && a.status !== 'completed';
            return (
              <div key={a.id} className="diag-agent-card">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-medium text-zinc-100 truncate">{a.name}</span>
                  <span className={`diag-status-chip ${toneClass(tone)}`}>{a.status}</span>
                </div>
                <div className="text-[10.5px] text-zinc-500 mt-1 truncate" title={a.currentTask}>
                  {a.currentTask || a.detail || 'idle'}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] text-zinc-500 uppercase">{a.currentOperation}</span>
                  <span className="ml-auto text-[10px] text-zinc-500 tabular-nums">
                    {(a.elapsedMs / 1000).toFixed(0)}s
                  </span>
                </div>
                <div className="diag-meter-track mt-1">
                  <div
                    className="diag-meter-fill"
                    style={{
                      width: `${Math.max(0, Math.min(100, a.progress))}%`,
                      backgroundColor: busy ? 'var(--vestara-accent)' : 'var(--color-zinc-600)',
                    }}
                  />
                </div>
                {a.activeFilePath && (
                  <div className="text-[10px] text-zinc-600 font-mono truncate mt-1">{a.activeFilePath}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="diag-card diag-card-body">
        <div className="diag-section-title">Executions</div>
        {filteredExecutions.length === 0 && <p className="diag-empty">No executions</p>}
        <div className="overflow-auto max-h-[420px]">
          <table className="diag-table">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Task</th>
                <th>Status</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {filteredExecutions.map((e) => (
                <tr key={e.id}>
                  <td className="font-mono text-[11px]">{e.agentId}</td>
                  <td className="diag-proc-cmd" title={e.task}>
                    {e.task}
                  </td>
                  <td>
                    <span className={`diag-status-chip ${toneClass(statusTone(e.status))}`}>{e.status}</span>
                  </td>
                  <td className="tabular-nums text-zinc-500">{formatTime(e.startedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
