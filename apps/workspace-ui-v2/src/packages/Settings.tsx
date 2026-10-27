import { useState } from 'react';
import { settingsModuleCount } from '../lib/workspace-settings-model';
import { AppearanceCard } from './AppearanceCard';
import {
  SETTINGS_ACTIVE_SECTION,
  SETTINGS_EMPTY_SECTION_NOTE,
  SETTINGS_MENU_ROWS,
  SETTINGS_SECTIONS,
  SETTINGS_TOKENS_DOC,
  SETTINGS_TOPBAR_PILLS,
} from './settings.fixtures';
import { WorkspaceUiToggle } from './WorkspaceUiToggle';

function TopbarPillsCard() {
  return (
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
  );
}

function SystemMenuCard() {
  return (
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
  );
}

function TokensCard() {
  return (
    <div className="rounded-[var(--vestara-radius-md-plus)] bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)] p-3">
      <div className="text-[length:var(--vestara-font-size-label)] tracking-[0.12em] text-[var(--vestara-text-shell-muted)] mb-1">
        TOKENS
      </div>
      <div className="text-[length:var(--vestara-font-size-caption)] font-mono text-[var(--vestara-text-shell-secondary)]">
        {SETTINGS_TOKENS_DOC}
      </div>
      <div className="mt-2 text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-text-shell-muted)]">
        {settingsModuleCount()} settings modules registered via @vestara/settings-framework.
      </div>
    </div>
  );
}

function EmptySectionCard() {
  return (
    <div className="rounded-[var(--vestara-radius-md-plus)] bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)] p-3">
      <div className="text-[length:var(--vestara-font-size-body-small)] text-[var(--vestara-text-shell-secondary)]">
        {SETTINGS_EMPTY_SECTION_NOTE}
      </div>
    </div>
  );
}

export function SettingsPkg() {
  const [active, setActive] = useState<string>(SETTINGS_ACTIVE_SECTION);
  return (
    <div className="p-4 grid grid-cols-1 lg:grid-cols-[180px_1fr] gap-4 h-full">
      <fieldset className="space-y-1">
        <legend className="sr-only">Settings sections</legend>
        {SETTINGS_SECTIONS.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={c === active}
            onClick={() => setActive(c)}
            className={`w-full text-left px-2.5 py-2 rounded-[var(--vestara-radius-lg)] text-[length:var(--vestara-font-size-label)] cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--vestara-accent-shell)] ${c === active ? 'bg-[var(--vestara-accent-shell)]/10 border border-[var(--vestara-accent-shell)]/20 text-[var(--vestara-accent-shell)]' : 'text-[var(--vestara-text-shell-secondary)] hover:bg-[var(--vestara-surface-shell-raised)] border border-transparent'}`}
          >
            {c}
          </button>
        ))}
      </fieldset>
      <div className="space-y-4">
        {active === 'Appearance' && <AppearanceCard />}
        {active === 'Workspace' && <WorkspaceUiToggle />}
        {active === 'Shell & TopBar' && (
          <>
            <TopbarPillsCard />
            <SystemMenuCard />
          </>
        )}
        {active === 'About' && <TokensCard />}
        {(active === 'Sidebar' || active === 'Network' || active === 'Runtime') && <EmptySectionCard />}
      </div>
    </div>
  );
}
