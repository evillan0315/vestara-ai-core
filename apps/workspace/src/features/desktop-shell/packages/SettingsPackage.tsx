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

import { useMemo, useState } from 'react';
import { ACCENT_PALETTES, useTheme } from '../../../lib/theme';
import { PackageGhostButton, PackageLiveBadge, PackageSearchInput } from './PackageChrome';
import { settingsPackageFixture } from './packages.fixtures';
import { useSettingsPackage } from './useSettingsPackage';

/** Panels visible per category — the rail filters instead of always showing all. */
function visiblePanels(category: string): { readonly server: boolean; readonly appearance: boolean; readonly system: boolean } {
  switch (category) {
    case 'appearance':
      return { server: false, appearance: true, system: false };
    case 'shell':
    case 'sidebar':
    case 'workspace':
    case 'network':
    case 'runtime':
      return { server: true, appearance: false, system: false };
    case 'about':
      return { server: true, appearance: false, system: true };
    default:
      return { server: true, appearance: true, system: true };
  }
}

export function SettingsPackage() {
  const { snapshot, isLoading, isLive, error, refetch } = useSettingsPackage();
  const { mode, setMode, settings, updateSetting } = useTheme();
  const [category, setCategory] = useState('appearance');
  const [railQuery, setRailQuery] = useState('');
  const accents = Object.keys(ACCENT_PALETTES);
  const panels = visiblePanels(category);

  const normalizedRailQuery = railQuery.trim().toLowerCase();
  const visibleCategories = useMemo(
    () =>
      normalizedRailQuery
        ? settingsPackageFixture.categories.filter((entry) => entry.label.toLowerCase().includes(normalizedRailQuery))
        : settingsPackageFixture.categories,
    [normalizedRailQuery],
  );

  return (
    <div className="ds-split-2col ds-split-2col-rail-narrow grid h-full min-h-[320px] grid-cols-1">
      <div className="ds-rail-left ds-rail-stack flex gap-[var(--vestara-spacing-1)] p-[var(--vestara-spacing-2)]">
        <div className="shrink-0 px-[var(--vestara-spacing-1)] pb-[var(--vestara-spacing-1)]">
          <PackageSearchInput
            id="ds-settings-rail-filter"
            value={railQuery}
            onChange={setRailQuery}
            label="Filter settings categories"
            placeholder="Filter…"
          />
        </div>
        {visibleCategories.map((entry) => {
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
        {visibleCategories.length === 0 ? (
          <div className="px-[var(--vestara-spacing-2)] py-[var(--vestara-spacing-1)] text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-muted)]">
            No matching categories
          </div>
        ) : null}
      </div>
      <div className="min-h-0 space-y-[var(--vestara-spacing-3)] overflow-auto p-[var(--vestara-spacing-3)]" aria-busy={isLoading}>
        {panels.server ? (
        <div className="rounded-[var(--vestara-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface-panel)] p-[var(--vestara-spacing-3)]">
          <div className="flex items-center justify-between gap-[var(--vestara-spacing-2)]">
            <span className="text-[length:var(--vestara-font-size-xs)] tracking-[0.12em] text-[var(--ds-text-muted)]">
              SERVER CONFIG
            </span>
            <span className="flex items-center gap-[var(--vestara-spacing-1)]">
              <PackageLiveBadge isLive={isLive} />
              <PackageGhostButton label="Reload server configuration" onClick={() => void refetch()}>
                Reload
              </PackageGhostButton>
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
        ) : null}
        {panels.appearance ? (
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
                  className={`min-h-[28px] rounded-full border px-[var(--vestara-spacing-2)] py-px text-[length:var(--vestara-font-size-xs)] ${
                    mode === entry
                      ? 'border-[var(--ds-accent)] bg-[var(--ds-accent-bg)] text-[var(--ds-accent)]'
                      : 'border-[var(--ds-border)] bg-[var(--ds-surface-bg)] text-[var(--ds-text-muted)]'
                  }`}
                >
                  {entry}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-[var(--vestara-spacing-2)] flex flex-wrap gap-[var(--vestara-spacing-1)]" role="group" aria-label="Accent color">
            {accents.map((accent) => {
              const selected = settings.colorTheme === accent;
              const palette = ACCENT_PALETTES[accent as keyof typeof ACCENT_PALETTES];
              return (
                <button
                  key={accent}
                  type="button"
                  onClick={() => updateSetting('colorTheme', accent as typeof settings.colorTheme)}
                  aria-pressed={selected}
                  title={palette?.label ?? accent}
                  className={`flex min-h-[28px] items-center gap-[var(--vestara-spacing-1)] rounded-full border px-[var(--vestara-spacing-2)] py-px text-[length:var(--vestara-font-size-xs)] ${
                    selected
                      ? 'border-[var(--ds-accent)] bg-[var(--ds-accent-bg)] text-[var(--ds-accent)]'
                      : 'border-[var(--ds-border)] bg-[var(--ds-surface-bg)] text-[var(--ds-text-muted)] hover:text-[var(--ds-text)]'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 rounded-full border border-[var(--ds-border)]"
                    /* Token data, not a literal: preview dot resolves the
                     * canonical accent hex from ACCENT_PALETTES (ui-tokens). */
                    style={{ backgroundColor: palette?.hex ?? 'transparent' }}
                  />
                  {palette?.label ?? accent}
                </button>
              );
            })}
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
        ) : null}
        {panels.system ? (
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
        ) : null}
      </div>
    </div>
  );
}
