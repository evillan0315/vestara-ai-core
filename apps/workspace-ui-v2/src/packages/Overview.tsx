import { OVERVIEW_GREETING, OVERVIEW_HEALTH, OVERVIEW_STATS, OVERVIEW_SUBTITLE } from './overview.fixtures';

export function OverviewPkg() {
  return (
    <div className="p-4 space-y-3">
      <div className="rounded-[var(--vestara-radius-xl)] bg-[var(--vestara-surface-shell-panel)] border border-[var(--vestara-border-shell)] p-4">
        <div className="flex items-center gap-2">
          <span className="text-[length:var(--vestara-font-size-caption)] tracking-[0.2em] text-[var(--vestara-text-shell-muted)]">
            WORKSPACE OVERVIEW
          </span>
          <span className="text-[length:var(--vestara-font-size-caption)] px-1.5 py-0.5 rounded bg-[var(--vestara-status-shell-success)]/10 border border-[var(--vestara-status-shell-success)]/20 text-[var(--vestara-status-shell-success)]">
            {OVERVIEW_HEALTH}
          </span>
        </div>
        <div className="mt-1 text-[length:var(--vestara-font-size-title-large)] leading-[0.9] tracking-[-0.02em] text-[var(--vestara-text-shell-primary)] font-[family-name:var(--vestara-font-family-display)]">
          {OVERVIEW_GREETING}
        </div>
        <div className="mt-1 text-[length:var(--vestara-font-size-body-small)] text-[var(--vestara-text-shell-secondary)]">
          {OVERVIEW_SUBTITLE}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {OVERVIEW_STATS.map((c) => (
          <div
            key={c.key}
            className="bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)] rounded-[var(--vestara-radius-md-plus)] px-3 py-2"
          >
            <div className="text-[length:var(--vestara-font-size-micro)] tracking-[0.15em] text-[var(--vestara-text-shell-muted)]">
              {c.key}
            </div>
            <div className="text-[length:var(--vestara-font-size-body-small)] font-medium text-[var(--vestara-text-shell-primary)]">
              {c.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
