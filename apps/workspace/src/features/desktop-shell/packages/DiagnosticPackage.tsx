/**
 * VES-UI-001 T6: Diagnostic Package
 *
 * Live telemetry promoted from the v2 prototype
 * (`assets/templates/html/v2/start/workspace-ui-v2/src/packages/Diagnostic.tsx`).
 * Bars are seeded (`seededTelemetryBars`, plan G7 determinism);
 * summary values come from `/api/diagnostics/summary` via
 * `useDiagnosticPackage` with a deterministic fixture fallback.
 * Never hardcoded arrays in JSX.
 *
 * Visual roles bind to the scoped `--ds-*` layer, never hex literals.
 * Bar heights stay dynamic inline geometry (percent), not visual literals.
 *
 * Architecture Traceability:
 *   VES-UI-001: Workspace UI v2 Desktop Shell (T6 deterministic telemetry)
 *   @see docs/plans/VES-UI-001-workspace-ui-v2-desktop-shell-plan.md §6
 */

import { useDiagnosticPackage } from './useDiagnosticPackage';
import '../desktop-shell.tokens.css';

function toneClass(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized.includes('fail') || normalized.includes('error') || normalized.includes('critical')) return 'text-[var(--ds-error)]';
  if (normalized.includes('warn') || normalized.includes('degrad')) return 'text-[var(--ds-warning)]';
  return 'text-[var(--ds-success)]';
}

export function DiagnosticPackage() {
  const { summary, bars, isLoading, isLive, error, refetch } = useDiagnosticPackage();
  const stats = [
    { id: 'cpu', label: 'CPU', value: `${summary.cpuUsage}%` },
    { id: 'memory', label: 'MEMORY', value: `${summary.memoryUsedGB}/${summary.memoryTotalGB} GB` },
    { id: 'readiness', label: 'READINESS', value: `${summary.readiness}%` },
  ];

  return (
    <div className="space-y-[var(--vestara-spacing-3)] p-[var(--vestara-spacing-4)]">
      <div className="flex items-center justify-between gap-[var(--vestara-spacing-2)]">
        <span className="text-[length:var(--vestara-font-size-xs)] tracking-[0.12em] text-[var(--ds-accent)]">
          LIVE TELEMETRY · Diagnostic Center
        </span>
        <span className="flex items-center gap-[var(--vestara-spacing-1)]">
          <span className="rounded-full border border-[var(--ds-border)] bg-[var(--ds-surface-bg)] px-[var(--vestara-spacing-2)] py-px text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-secondary)]">
            {isLive ? 'LIVE' : 'SNAPSHOT'}
          </span>
          <button
            type="button"
            onClick={() => void refetch()}
            className="rounded-[var(--vestara-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface-bg)] px-[var(--vestara-spacing-2)] py-px text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-secondary)] hover:border-[var(--ds-border-strong)] hover:text-[var(--ds-text)]"
          >
            Reload
          </button>
        </span>
      </div>
      <div className="grid grid-cols-3 gap-[var(--vestara-spacing-2)]" aria-busy={isLoading}>
        {stats.map((stat) => (
          <div
            key={stat.id}
            className="rounded-[var(--vestara-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface-panel)] px-[var(--vestara-spacing-3)] py-[var(--vestara-spacing-2)]"
          >
            <div className="text-[length:var(--vestara-font-size-xs)] tracking-[0.15em] text-[var(--ds-text-muted)]">
              {stat.label}
            </div>
            <div className="text-[length:var(--vestara-font-size-sm)] font-medium tabular-nums text-[var(--ds-text)]">
              {stat.value}
            </div>
          </div>
        ))}
      </div>
      <div
        className="flex h-[100px] items-end gap-[2px] rounded-[var(--vestara-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface-panel)] p-[var(--vestara-spacing-2)]"
        role="img"
        aria-label={`Deterministic telemetry over ${bars.length} intervals`}
      >
        {bars.map((height, index) => (
          <div
            key={`telemetry-bar-${index}`}
            className="flex-1 rounded-t-[2px] bg-[var(--ds-accent)] opacity-40"
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
      <ul className="space-y-[var(--vestara-spacing-1)]">
        {summary.checks.map((check) => (
          <li
            key={check.id}
            className="flex items-center justify-between rounded-[var(--vestara-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface-panel)] px-[var(--vestara-spacing-3)] py-[var(--vestara-spacing-1)] text-[length:var(--vestara-font-size-xs)]"
          >
            <span className="text-[var(--ds-text-secondary)]">{check.name}</span>
            <span className={toneClass(check.status)}>{check.status}</span>
          </li>
        ))}
      </ul>
      {error ? (
        <div className="text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-muted)]">
          Telemetry snapshot incomplete · {error}
        </div>
      ) : null}
    </div>
  );
}
