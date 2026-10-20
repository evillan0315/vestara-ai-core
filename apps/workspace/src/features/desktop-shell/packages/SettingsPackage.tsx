/**
 * VES-UI-001 T6: Settings Package
 *
 * Category rail promoted from the v2 prototype
 * (`assets/templates/html/v2/start/workspace-ui-v2/src/packages/Settings.tsx`).
 * Server facts come from `useSettingsPackage` (`GET /api/settings` → snapshot
 * fallback); appearance controls bind to the theme provider (`useTheme`),
 * which persists approved values durably to workspace settings.
 * Never hardcoded arrays in JSX — rail and chips render fixture imports.
 *
 * Visual roles bind to the scoped `--ds-*` layer, never hex literals.
 *
 * Architecture Traceability:
 *   VES-UI-001: Workspace UI v2 Desktop Shell (T6 Settings bound to config)
 *   @see docs/plans/VES-UI-001-workspace-ui-v2-desktop-shell-plan.md §6
 */

import { useState } from 'react';
import { ACCENT_PALETTES, useTheme } from '../../../lib/theme';
import { settingsPackageFixture } from './packages.fixtures';
import { useSettingsPackage } from './useSettingsPackage';
import '../desktop-shell.tokens.css';

export function SettingsPackage() {
  const { snapshot, isLoading, isLive, error, refetch } = useSettingsPackage();
  const { mode, setMode, settings, updateSetting } = useTheme();
  const [category, setCategory] = useState('shell');
  const accents = Object.keys(ACCENT_PALETTES);

  return (
    <div className="grid h-full min-h-[320px] grid-cols-1 lg:grid-cols-[180px_1fr]">
      <div className="flex flex-row gap-[var(--vestara-spacing-1)] overflow-x-auto border-b border-[var(--ds-border)] p-[var(--vestara-spacing-2)] lg:flex-col lg:overflow-visible lg:border-r lg:border-b-0">
        {settingsPackageFixture.categories.map((entry) => {
          const selected = entry.id === category;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => setCategory(entry.id)}
              aria-pressed={selected}
              className={`whitespace-nowrap rounded-[var(--vestara-radius-md)] px-[var(--vestara-spacing-2)] py-[var(--vestara-spacing-1)] text-left text-[length:var(--vestara-font-size-xs)] ${
                selected
                  ? 'border border-[var(--ds-accent)] bg-[var(--ds-accent-bg)] text-[var(--ds-accent)]'
                  : 'border border-transparent text-[var(--ds-text-secondary)] hover:bg-[var(--ds-surface-bg)]'
              }`}
            >
              {entry.label}
            </button>
          );
        })}
      </div>
      <div className="min-h-0 space-y-[var(--vestara-spacing-3)] overflow-auto p-[var(--vestara-spacing-3)]" aria-busy={isLoading}>
        <div className="rounded-[var(--vestara-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface-panel)] p-[var(--vestara-spacing-3)]">
          <div className="flex items-center justify-between gap-[var(--vestara-spacing-2)]">
            <span className="text-[length:var(--vestara-font-size-xs)] tracking-[0.12em] text-[var(--ds-text-muted)]">
              SERVER CONFIG
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
          <div className="mt-[var(--vestara-spacing-2)] text-[length:var(--vestara-font-size-sm)] font-medium text-[var(--ds-text)]">
            {snapshot.workspaceName}
          </div>
          <div className="mt-[var(--vestara-spacing-1)] text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-secondary)]">
            Revision {snapshot.revision} · {snapshot.sectionCount} sections · {snapshot.settingCount} settings
          </div>
          {error ? (
            <div className="mt-[var(--vestara-spacing-1)] text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-muted)]">
              Settings snapshot incomplete · {error}
            </div>
          ) : null}
        </div>
        <div className="rounded-[var(--vestara-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface-panel)] p-[var(--vestara-spacing-3)]">
          <div className="text-[length:var(--vestara-font-size-xs)] tracking-[0.12em] text-[var(--ds-text-muted)]">
            APPEARANCE · LIVE THEME
          </div>
          <div className="mt-[var(--vestara-spacing-2)] flex flex-wrap items-center gap-[var(--vestara-spacing-2)]">
            <div className="flex gap-[var(--vestara-spacing-1)]" role="group" aria-label="Theme mode">
              {(['dark', 'light'] as const).map((entry) => (
                <button
                  key={entry}
                  type="button"
                  onClick={() => setMode(entry)}
                  aria-pressed={mode === entry}
                  className={`rounded-full border px-[var(--vestara-spacing-2)] py-px text-[length:var(--vestara-font-size-xs)] ${
                    mode === entry
                      ? 'border-[var(--ds-accent)] bg-[var(--ds-accent-bg)] text-[var(--ds-accent)]'
                      : 'border-[var(--ds-border)] bg-[var(--ds-surface-bg)] text-[var(--ds-text-muted)]'
                  }`}
                >
                  {entry}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-[var(--vestara-spacing-1)] text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-secondary)]">
              Accent
              <select
                value={settings.colorTheme}
                onChange={(event) => updateSetting('colorTheme', event.target.value as typeof settings.colorTheme)}
                className="rounded-[var(--vestara-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface-bg)] px-[var(--vestara-spacing-1)] py-px text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text)]"
              >
                {accents.map((accent) => (
                  <option key={accent} value={accent}>
                    {accent}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-[var(--vestara-spacing-2)] flex flex-wrap gap-[var(--vestara-spacing-1)]">
            {settingsPackageFixture.topbarChips.map((chip) => (
              <span
                key={chip}
                className="rounded-full border border-[var(--ds-border)] bg-[var(--ds-surface-bg)] px-[var(--vestara-spacing-2)] py-px text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-secondary)]"
              >
                {chip}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-[var(--vestara-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface-panel)] p-[var(--vestara-spacing-3)]">
          <div className="text-[length:var(--vestara-font-size-xs)] tracking-[0.12em] text-[var(--ds-text-muted)]">
            SYSTEM MENU
          </div>
          <ul className="mt-[var(--vestara-spacing-2)] space-y-[var(--vestara-spacing-1)]">
            {settingsPackageFixture.systemMenuRows.map((row) => (
              <li key={row} className="text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-secondary)]">
                • {row}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
