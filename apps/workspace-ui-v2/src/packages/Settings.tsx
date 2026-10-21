import {
  SETTINGS_ACTIVE_SECTION,
  SETTINGS_MENU_ROWS,
  SETTINGS_SECTIONS,
  SETTINGS_TOKENS_DOC,
  SETTINGS_TOPBAR_PILLS,
} from './settings.fixtures';

export function SettingsPkg() {
  return (
    <div className="p-4 grid grid-cols-1 lg:grid-cols-[180px_1fr] gap-4 h-full">
      <div className="space-y-1">
        {SETTINGS_SECTIONS.map((c) => (
          <div
            key={c}
            className={`px-2.5 py-2 rounded-[var(--vestara-radius-lg)] text-[length:var(--vestara-font-size-label)] cursor-pointer ${c === SETTINGS_ACTIVE_SECTION ? 'bg-[var(--vestara-accent-shell)]/10 border border-[var(--vestara-accent-shell)]/20 text-[var(--vestara-accent-shell)]' : 'text-[var(--vestara-text-shell-secondary)] hover:bg-[var(--vestara-surface-shell-raised)] border border-transparent'}`}
          >
            {c}
          </div>
        ))}
      </div>
      <div className="space-y-4">
        <div className="rounded-[var(--vestara-radius-md-plus)] bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)] p-3">
          <div className="text-[length:var(--vestara-font-size-label)] tracking-[0.12em] text-[var(--vestara-text-shell-muted)] mb-2">
            TOPBAR • 32PX SMALL CLEAN
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {SETTINGS_TOPBAR_PILLS.map((p) => (
              <span
                key={p.label}
                className={`text-[length:var(--vestara-font-size-caption)] px-2 py-1 rounded-full border ${p.active ? 'bg-[var(--vestara-accent-shell)]/10 border-[var(--vestara-accent-shell)]/20 text-[var(--vestara-accent-shell)]' : 'bg-[var(--vestara-surface-shell-panel)] border-[var(--vestara-border-shell)] text-[var(--vestara-text-shell-secondary)]'}`}
              >
                {p.label}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-[var(--vestara-radius-md-plus)] bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)] p-3">
          <div className="text-[length:var(--vestara-font-size-label)] tracking-[0.12em] text-[var(--vestara-text-shell-muted)] mb-2">
            SYSTEM MENU
          </div>
          <div className="text-[length:var(--vestara-font-size-label)] text-[var(--vestara-text-shell-primary)] space-y-1">
            {SETTINGS_MENU_ROWS.map((r) => (
              <div key={r}>{r}</div>
            ))}
          </div>
        </div>
        <div className="rounded-[var(--vestara-radius-md-plus)] bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)] p-3">
          <div className="text-[length:var(--vestara-font-size-label)] tracking-[0.12em] text-[var(--vestara-text-shell-muted)] mb-1">
            TOKENS
          </div>
          <div className="text-[length:var(--vestara-font-size-caption)] font-mono text-[var(--vestara-text-shell-secondary)]">
            {SETTINGS_TOKENS_DOC}
          </div>
        </div>
      </div>
    </div>
  );
}
