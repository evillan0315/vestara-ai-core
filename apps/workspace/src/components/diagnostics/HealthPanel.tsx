/**
 * Health tab — health check engine results, readiness score, and alerts.
 */

import { inspectEntity } from '../graph/GraphContext';
import { useDiagnostics } from './DiagnosticsContext';

const TONE_CLASS: Record<string, string> = {
  pass: 'diag-status-pass',
  warn: 'diag-status-warn',
  fail: 'diag-status-fail',
  unknown: 'diag-status-unknown',
};

export function HealthPanel() {
  const { summary, refreshAll } = useDiagnostics();
  const checks = summary?.health ?? [];
  const alerts = summary?.alerts ?? [];
  const readiness = summary?.readiness ?? 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="diag-stat">
          <span className="diag-stat-value">{Math.round(readiness)}%</span>
          <span className="diag-stat-label">Readiness score</span>
        </div>
        <div className="diag-stat">
          <span className="diag-stat-value">{checks.filter((c) => c.status === 'pass').length}</span>
          <span className="diag-stat-label">Passing</span>
        </div>
        <div className="diag-stat">
          <span className="diag-stat-value">{checks.filter((c) => c.status === 'warn').length}</span>
          <span className="diag-stat-label">Warnings</span>
        </div>
        <div className="diag-stat">
          <span
            className="diag-stat-value"
            style={{ color: checks.filter((c) => c.status === 'fail').length ? 'var(--vestara-red)' : undefined }}
          >
            {checks.filter((c) => c.status === 'fail').length}
          </span>
          <span className="diag-stat-label">Failed</span>
        </div>
      </div>

      <div className="diag-card diag-card-body">
        <div className="flex items-center justify-between mb-2">
          <div className="diag-section-title">Health Checks</div>
          <button type="button" className="diag-btn" onClick={refreshAll}>
            Run checks
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
          {checks.map((c) => (
            <button
              key={c.id}
              type="button"
              className="diag-check"
              onClick={() => inspectEntity(`diagnostic://health/${c.id}`)}
              title="Open in Engineering Graph"
            >
              <span className={`diag-status-dot ${TONE_CLASS[c.status] ?? 'diag-status-unknown'}`}>{c.status}</span>
              <span className="text-[12px] text-zinc-200 font-medium">{c.name}</span>
              <span className="text-[10.5px] text-zinc-500 ml-auto text-right">{c.detail}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="diag-card diag-card-body">
        <div className="diag-section-title">
          Alerts <span className="text-zinc-500">{alerts.length}</span>
        </div>
        {alerts.length === 0 && <p className="diag-empty">No active alerts. Everything looks healthy.</p>}
        <div className="space-y-1">
          {alerts.map((a) => (
            <div key={`${a.source}-${a.message}`} className={`diag-alert diag-alert-${a.severity}`}>
              <span className="diag-alert-tag">{a.severity}</span>
              <span className="diag-alert-msg">{a.message}</span>
              <span className="diag-alert-src">{a.source}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
