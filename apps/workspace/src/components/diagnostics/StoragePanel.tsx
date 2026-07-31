/**
 * Storage tab — mounted filesystems + workspace filesystem scan
 * (directory sizes, large files, recently modified files).
 */

import { useEffect, useState } from 'react';
import { formatBytes } from '../../lib/diagnostics';
import { useDiagnostics } from './DiagnosticsContext';

function StorageBar({ capacity }: { capacity: number }) {
  const color =
    capacity > 90
      ? 'var(--vestara-red, #f87171)'
      : capacity > 75
        ? 'var(--vestara-amber, #f59e0b)'
        : 'var(--vestara-accent, #f59e0b)';
  return (
    <div className="diag-meter-track w-24">
      <div className="diag-meter-fill" style={{ width: `${Math.min(100, capacity)}%`, backgroundColor: color }} />
    </div>
  );
}

export function StoragePanel() {
  const { summary, fsScan, fsScanLoading, refreshFsScan } = useDiagnostics();
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => {
    if (fsScan === null && !fsScanLoading) {
      refreshFsScan().catch(() => setScanError('Filesystem scan failed'));
    }
  }, [fsScan, fsScanLoading, refreshFsScan]);

  const disks = summary?.disks ?? [];
  const total = disks.reduce((a, d) => a + d.size, 0);
  const used = disks.reduce((a, d) => a + d.used, 0);

  return (
    <div className="space-y-3">
      <div className="diag-card diag-card-body">
        <div className="diag-section-title">Filesystems</div>
        {disks.length === 0 && <p className="text-[11px] text-zinc-500">No filesystem data</p>}
        <div className="overflow-auto">
          <table className="diag-table">
            <thead>
              <tr>
                <th>Mount</th>
                <th>Filesystem</th>
                <th>Type</th>
                <th>Size</th>
                <th>Used</th>
                <th>Free</th>
                <th>Usage</th>
              </tr>
            </thead>
            <tbody>
              {disks.map((d) => (
                <tr key={`${d.filesystem}-${d.mount}`}>
                  <td className="font-mono">{d.mount}</td>
                  <td className="font-mono text-zinc-400">{d.filesystem}</td>
                  <td>{d.type}</td>
                  <td className="tabular-nums">{formatBytes(d.size)}</td>
                  <td className="tabular-nums">{formatBytes(d.used)}</td>
                  <td className="tabular-nums">{formatBytes(d.available)}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <StorageBar capacity={d.capacity} />
                      <span className="text-[11px] tabular-nums">{d.capacity.toFixed(0)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-[11px] text-zinc-400">
          Aggregate: {formatBytes(used)} / {formatBytes(total)}
        </div>
      </div>

      <div className="diag-card diag-card-body">
        <div className="flex items-center justify-between mb-2">
          <div className="diag-section-title">Workspace Scan</div>
          <button type="button" className="diag-btn" onClick={() => void refreshFsScan()}>
            {fsScanLoading ? 'Scanning…' : 'Rescan'}
          </button>
        </div>
        {scanError && <p className="text-[11px] text-(--vestara-red) mb-2">{scanError}</p>}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div>
            <div className="diag-sub-title">Largest directories</div>
            {fsScan?.dirSizes.length ? (
              <ul className="diag-list">
                {fsScan.dirSizes.slice(0, 12).map((d) => (
                  <li key={d.dir} className="flex justify-between gap-2">
                    <span className="diag-list-path">{d.dir || '/'}</span>
                    <span className="tabular-nums text-zinc-400">{formatBytes(d.size)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-zinc-500">No data</p>
            )}
          </div>
          <div>
            <div className="diag-sub-title">Large files (&gt; 5 MB)</div>
            {fsScan?.largeFiles.length ? (
              <ul className="diag-list">
                {fsScan.largeFiles.slice(0, 12).map((f) => (
                  <li key={f.file} className="flex justify-between gap-2">
                    <span className="diag-list-path">{f.file.split('/').pop()}</span>
                    <span className="tabular-nums text-zinc-400">{formatBytes(f.size)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-zinc-500">No large files found</p>
            )}
          </div>
          <div>
            <div className="diag-sub-title">Recently modified (24h)</div>
            {fsScan?.recentlyModified.length ? (
              <ul className="diag-list">
                {fsScan.recentlyModified.slice(0, 12).map((f) => (
                  <li key={f.file} className="flex justify-between gap-2">
                    <span className="diag-list-path">{f.file.split('/').pop()}</span>
                    <span className="tabular-nums text-zinc-500">{new Date(f.mtime).toLocaleTimeString()}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-zinc-500">No recent changes</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
