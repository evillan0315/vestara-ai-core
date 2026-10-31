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

import { PackageGhostButton, PackageSubHeader } from './PackageChrome';
import { useDiagnosticPackage } from './useDiagnosticPackage';

function toneClass(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized.includes('fail') || normalized.includes('error') || normalized.includes('critical')) return 'text-[var(--ds-error)]';
  if (normalized.includes('warn') || normalized.includes('degrad')) return 'text-[var(--ds-warning)]';
  return 'text-[var(--ds-success)]';
}

function toneBadge(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized.includes('fail') || normalized.includes('error') || normalized.includes('critical'))
    return 'border-[var(--ds-error)] bg-[var(--ds-error-bg)] text-[var(--ds-error)]';
  if (normalized.includes('warn') || normalized.includes('degrad'))
    return 'border-[var(--ds-warning)] bg-[var(--ds-warning-bg)] text-[var(--ds-warning)]';
  return 'border-[var(--ds-success)] bg-[var(--ds-success-bg)] text-[var(--ds-success)]';
}

/** Threshold tone for a 0–100 gauge value. */
function gaugeTone(value: number): string {
  if (value >= 90) return 'text-[var(--ds-error)]';
  if (value >= 70) return 'text-[var(--ds-warning)]';
  return 'text-[var(--ds-text)]';
}

export function DiagnosticPackage() {
  const { summary, bars, isLoading, isLive, error, refetch } = useDiagnosticPackage();
  const memoryPct = summary.memoryTotalGB > 0 ? Math.round((summary.memoryUsedGB / summary.memoryTotalGB) * 100) : 0;
  const stats = [
    { id: 'cpu', label: 'CPU', value: `${summary.cpuUsage}%`, tone: gaugeTone(summary.cpuUsage), progress: summary.cpuUsage },
    { id: 'memory', label: 'MEMORY', value: `${summary.memoryUsedGB}/${summary.memoryTotalGB} GB`, tone: gaugeTone(memoryPct), progress: memoryPct },
    { id: 'readiness', label: 'READINESS', value: `${summary.readiness}%`, tone: gaugeTone(100 - summary.readiness), progress: summary.readiness },
  ];

  return (
    <div className="flex h-full min-h-[320px] flex-col">
      <PackageSubHeader
        eyebrow="LIVE TELEMETRY · Diagnostic Center"
        isLive={isLive}
        action={
          <PackageGhostButton label="Reload diagnostic telemetry" onClick={() => void refetch()} disabled={isLoading}>
            {isLoading ? 'Loading…' : 'Reload'}
          </PackageGhostButton>
        }
      />
      <div className="min-h-0 flex-1 space-y-[var(--vestara-spacing-3)] overflow-auto p-[var(--vestara-spacing-4)]">
      <div className="ds-cards grid gap-[var(--vestara-spacing-2)]" aria-busy={isLoading}>
        {stats.map((stat) => (
          <div
            key={stat.id}
            className="rounded-[var(--vestara-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface-panel)] px-[var(--vestara-spacing-3)] py-[var(--vestara-spacing-2)]"
          >
            <div className="text-[length:var(--vestara-font-size-xs)] tracking-[0.15em] text-[var(--ds-text-muted)]">
              {stat.label}
            </div>
            <div className={`text-[length:var(--vestara-font-size-sm)] font-medium tabular-nums ${stat.tone}`}>
              {stat.value}
            </div>
            <div
              role="progressbar"
              aria-label={`${stat.label} ${stat.value}`}
              aria-valuenow={Math.max(0, Math.min(100, Math.round(stat.progress)))}
              aria-valuemin={0}
              aria-valuemax={100}
              className="mt-[var(--vestara-spacing-1)] h-1 overflow-hidden rounded-full bg-[var(--ds-surface-bg)]"
            >
              <div
                className="h-full rounded-full bg-[var(--ds-accent)]"
                /* Dynamic geometry (percent), not a visual literal. */
                style={{ width: `${Math.max(0, Math.min(100, stat.progress))}%` }}
              />
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
            className="flex items-center justify-between gap-[var(--vestara-spacing-2)] rounded-[var(--vestara-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface-panel)] px-[var(--vestara-spacing-3)] py-[var(--vestara-spacing-1)] text-[length:var(--vestara-font-size-xs)]"
          >
            <span className="text-[var(--ds-text-secondary)]">{check.name}</span>
            <span className={`rounded-full border px-[var(--vestara-spacing-2)] py-px ${toneBadge(check.status)}`}>
              <span className={toneClass(check.status)}>{check.status}</span>
            </span>
          </li>
        ))}
      </ul>
      {error ? (
        <div className="text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-muted)]">
          Telemetry snapshot incomplete · {error}
        </div>
      ) : null}
      </div>
    </div>
  );
}
