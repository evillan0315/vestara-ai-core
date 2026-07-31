/**
 * Docker tab — containers, images, and live resource stats.
 */

import { formatBytes, statusTone } from '../../lib/diagnostics';
import { useDiagnostics } from './DiagnosticsContext';

export function DockerPanel() {
  const { docker, refreshDocker } = useDiagnostics();

  if (!docker) return <p className="diag-empty">Loading docker…</p>;

  return (
    <div className="space-y-3">
      <div className="diag-card diag-card-body">
        <div className="flex items-center justify-between">
          <div className="diag-section-title">
            Docker {docker.version ? <span className="font-mono text-zinc-500">v{docker.version}</span> : null}
          </div>
          <button type="button" className="diag-btn" onClick={refreshDocker}>
            Refresh
          </button>
        </div>
        {docker.error && (
          <p className="diag-empty mt-2">
            {docker.error}. Containers will appear here when the Docker daemon is reachable.
          </p>
        )}
        {docker.available && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
            <div className="diag-stat">
              <span className="diag-stat-value">{docker.containers.length}</span>
              <span className="diag-stat-label">Containers</span>
            </div>
            <div className="diag-stat">
              <span className="diag-stat-value">{docker.imageCount}</span>
              <span className="diag-stat-label">Images</span>
            </div>
            <div className="diag-stat">
              <span className="diag-stat-value">{docker.containers.filter((c) => c.state === 'running').length}</span>
              <span className="diag-stat-label">Running</span>
            </div>
          </div>
        )}
      </div>

      {docker.available && docker.containers.length > 0 && (
        <div className="diag-card diag-card-body">
          <div className="diag-section-title">Containers</div>
          <div className="overflow-auto">
            <table className="diag-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Image</th>
                  <th>State</th>
                  <th>Status</th>
                  <th>Ports</th>
                </tr>
              </thead>
              <tbody>
                {docker.containers.map((c) => (
                  <tr key={c.id}>
                    <td className="font-mono">{c.names}</td>
                    <td className="text-zinc-400">{c.image}</td>
                    <td>
                      <span className={`diag-status-dot diag-status-${statusTone(c.state)}`}>{c.state}</span>
                    </td>
                    <td className="text-zinc-400">{c.status}</td>
                    <td className="font-mono text-zinc-500">{c.ports || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {docker.available && docker.stats.length > 0 && (
        <div className="diag-card diag-card-body">
          <div className="diag-section-title">Live Resource Usage</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {docker.stats.map((s) => (
              <div key={s.name} className="diag-stat diag-stat-wide">
                <div className="flex justify-between items-center">
                  <span className="font-mono text-[11.5px] text-zinc-200">{s.name}</span>
                  <span className="text-[11px] tabular-nums text-zinc-400">
                    CPU {s.cpuPerc.toFixed(1)}% · Mem {s.memPerc.toFixed(1)}%
                  </span>
                </div>
                <div className="text-[10.5px] text-zinc-500 mt-1">
                  {formatBytes(s.memUsed)} / {formatBytes(s.memLimit)} · ⬇ {formatBytes(s.netIn)} ⬆{' '}
                  {formatBytes(s.netOut)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
