/**
 * VES-DESIGN-007: Settings shell — canonical workspace page composition.
 *
 *   <WorkspacePage>
 *     <WorkspaceHero />            (shared PageHero — same grammar as Overview)
 *     <SettingsNavigation />       (secondary nav: grouped, icon-led, searchable)
 *     <SettingsContent />          (selected Settings surface)
 *   </WorkspacePage>
 *
 * Settings owns no page-level visual system: gutters and max-width belong to
 * ShellLayout's PageContainer, panels belong to the gallery card grammar
 * (mpg-card via settings-ui), lamps belong to StatusIndicator. Only
 * Settings-specific behavior (domain grouping, search, hero stats wiring)
 * lives here.
 *
 * Authority: none — pure presentation over authoritative configuration.
 */

import { useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { PROFILES, useTheme } from '../lib/theme.js';
import { navIcon } from './workspace-navigation.js';
import { RouteHero } from '../components/layout/PageHero/RouteHero';
import { SETTINGS_GROUPS, type SettingsGroupId, type SettingsSectionMeta } from '../pages/Settings/settings-navigation.js';
import { focus, input, SearchIcon } from '../pages/Settings/settings-ui.js';

export interface SettingsNavigationItem extends SettingsSectionMeta {}

interface ShellLayoutSettingsProps {
  children: ReactNode;
  navigation: SettingsNavigationItem[];
  totalNavigationItems: number;
  query: string;
  onQueryChange: (query: string) => void;
  /**
   * Live configuration summary chips (label-first hierarchy, built by the
   * page from authoritative API/runtime state). Omitted while loading —
   * never fabricated.
   */
  heroSummary?: ReactNode;
}

/** Group-tinted icon wash (canonical hues). Active selection stays purple brand. */
const GROUP_TILE_FG: Record<SettingsGroupId, string> = {
  workspace: 'var(--st-tile-workspace-fg)',
  appearance: 'var(--st-tile-workspace-fg)',
  system: 'var(--st-tile-operations-fg)',
  'runtime-ai': 'var(--st-tile-runtime-fg)',
  engineering: 'var(--st-tile-engineering-fg)',
  operations: 'var(--st-tile-operations-fg)',
};

function SettingsNavLinks({ navigation }: { navigation: SettingsNavigationItem[] }) {
  // Secondary navigation: deliberately lighter than the primary sidebar —
  // compact type, wrapping (never fragmented) descriptions, group-tinted
  // icon tiles, purple reserved for the active selection.
  return (
    <nav aria-label="Settings sections" className="space-y-5">
      {SETTINGS_GROUPS.map((group) => {
        const items = navigation.filter((section) => section.group === group.id);
        if (!items.length) return null;
        const tileFg = GROUP_TILE_FG[group.id];
        return (
          <div key={group.id}>
            <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {items.map((section) => (
                <NavLink
                  key={section.id}
                  to={`/settings/${section.id}`}
                  className={({ isActive }) =>
                    `group flex w-full items-center gap-2.5 rounded-[var(--vestara-radius)] border px-2 py-1.5 ${focus} ${isActive ? 'border-[var(--vestara-accent-border)] bg-[var(--vestara-accent-bg)] shadow-[inset_3px_0_0_var(--vestara-accent)]' : 'border-transparent hover:border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] hover:bg-[var(--vestara-color-surface-interactive-hover,var(--vestara-accent-bg))]'}`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        aria-hidden="true"
                        className="grid size-7 shrink-0 place-items-center rounded-md border [&_svg]:size-4"
                        style={
                          isActive
                            ? {
                                color: 'var(--vestara-accent-text)',
                                background: 'var(--vestara-accent-bg)',
                                borderColor: 'var(--vestara-accent-border)',
                              }
                            : {
                                color: tileFg,
                                background: `color-mix(in srgb, ${tileFg} 10%, transparent)`,
                                borderColor: `color-mix(in srgb, ${tileFg} 28%, transparent)`,
                              }
                        }
                      >
                        {navIcon(section.icon)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-[var(--vestara-color-text-primary,var(--vestara-text))]">
                          {section.label}
                        </span>
                        <span className="block text-[11px] leading-snug text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
                          {section.description}
                        </span>
                      </span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function SettingsNavigation({
  navigation,
  totalNavigationItems,
  query,
  onQueryChange,
}: Omit<ShellLayoutSettingsProps, 'children' | 'heroStats'>) {
  const location = useLocation();
  const navigate = useNavigate();
  const active = navigation.find((section) => location.pathname === `/settings/${section.id}`);
  const mobileOptions = SETTINGS_GROUPS.flatMap((group) =>
    navigation.filter((section) => section.group === group.id).map((section) => ({ ...section, groupLabel: group.label })),
  );

  const search = (
    <div>
      <label className="relative block">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
          <SearchIcon />
        </span>
        <input
          aria-label="Search settings"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search settings…"
          className={`${input} w-full pl-9 pr-9`}
        />
        {query && (
          <button
            type="button"
            aria-label="Clear settings search"
            onClick={() => onQueryChange('')}
            className={`absolute inset-y-0 right-2 px-2 text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] hover:text-[var(--vestara-color-text-primary,var(--vestara-text))] ${focus}`}
          >
            ×
          </button>
        )}
      </label>
      <p className="mt-2 text-[10px] text-(--vestara-color-text-dim,var(--vestara-text-dim))">
        {query
          ? `${navigation.length} result${navigation.length === 1 ? '' : 's'}`
          : `${totalNavigationItems} control domains`}
      </p>
    </div>
  );

  const empty = (
    <div className="py-8 text-center">
      <p className="text-sm text-(--vestara-color-text-secondary,var(--vestara-text-2))">No settings found</p>
      <p className="mt-1 text-xs text-(--vestara-color-text-muted,var(--vestara-text-muted))">
        Try a category, configuration, or capability.
      </p>
      <button
        type="button"
        onClick={() => onQueryChange('')}
        className={`mt-3 text-xs text-[var(--vestara-accent-text)] ${focus}`}
      >
        Clear search
      </button>
    </div>
  );

  const links = navigation.length ? <SettingsNavLinks navigation={navigation} /> : empty;

  return (
    <>
      {/* Desktop secondary nav — participates in page scroll. No nested
          rail: no max-height, no overflow container (VES-DESIGN-007B). */}
      <aside className="hidden w-60 shrink-0 lg:block">
        <div className="space-y-4 py-1 pr-1">
          {search}
          {links}
        </div>
      </aside>
      {/* Mobile / compact: domain selector owns no permanent width */}
      <div className="space-y-3 lg:hidden">
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
            Settings domain
          </span>
          <select
            aria-label="Settings domain"
            value={active?.id ?? ''}
            onChange={(event) => navigate(`/settings/${event.target.value}`)}
            className={`${input} w-full`}
          >
            {mobileOptions.map((section) => (
              <option key={section.id} value={section.id}>
                {section.groupLabel} — {section.label}
              </option>
            ))}
          </select>
        </label>
        <details className="st-panel p-3">
          <summary
            className={`cursor-pointer text-sm font-medium text-(--vestara-color-text-primary,var(--vestara-text)) ${focus}`}
          >
            {active ? `${active.label} — browse all domains` : 'Browse all settings domains'}
          </summary>
          <div className="mt-3 space-y-4">
            {search}
            {links}
          </div>
        </details>
      </div>
    </>
  );
}

export default function ShellLayoutSettings({
  children,
  navigation,
  totalNavigationItems,
  query,
  onQueryChange,
  heroSummary,
}: ShellLayoutSettingsProps) {
  const { activeProfile, resetSettings } = useTheme();
  const [showResetConfirmation, setShowResetConfirmation] = useState(false);
  const profileLabel = activeProfile
    ? (PROFILES.find((profile) => profile.id === activeProfile)?.label ?? activeProfile)
    : 'Custom display';

  return (
    // Same page rhythm as OverviewScreen: unwrapped, gutter ownership stays
    // with ShellLayout's PageContainer — no independent Settings page chrome.
    <div className="w-full min-w-0 space-y-4 sm:space-y-6">
      <h1 className="sr-only">Settings</h1>
      <RouteHero
        actions={[
          { label: 'Appearance', to: '/settings/profiles', primary: true, glyph: '✦' },
          {
            label: 'Reset display',
            onClick: () => setShowResetConfirmation(true),
            title: 'Reset display preferences',
            glyph: '↺',
          },
        ]}
        meta={
          <>
            <span className="mpg-tag-pill">{profileLabel} profile</span>
            {heroSummary}
          </>
        }
      />
      <div className="flex min-w-0 flex-col gap-6 lg:flex-row lg:gap-8">
        <SettingsNavigation
          navigation={navigation}
          totalNavigationItems={totalNavigationItems}
          query={query}
          onQueryChange={onQueryChange}
        />
        {/* Content consumes the remaining workspace width. Page-level
            max-width belongs to ShellLayout's PageContainer (canonical
            template) — no Settings-specific narrow constraint (007B). */}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
      {showResetConfirmation && (
        <div
          className="fixed inset-0 z-[var(--st-modal-z-index)] grid place-items-center bg-[var(--vestara-surface-overlay)] p-[var(--vestara-spacing-4)]"
          role="presentation"
          onClick={() => setShowResetConfirmation(false)}
        >
          <div
            className="w-full max-w-md rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-default)] bg-[var(--vestara-surface-panel)] p-[var(--vestara-spacing-5)] shadow-[var(--st-panel-shadow)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-display-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="reset-display-title" className="text-[var(--vestara-font-size-lg)] font-semibold text-[var(--vestara-text-primary)]">
              Reset display preferences?
            </h2>
            <p className="mt-[var(--vestara-spacing-2)] text-[var(--vestara-font-size-sm)] text-[var(--vestara-text-secondary)]">
              This restores theme, density, accent, and other display preferences to their defaults. Workspace and runtime settings are not changed.
            </p>
            <div className="mt-[var(--vestara-spacing-5)] flex justify-end gap-[var(--vestara-spacing-2)]">
              <button
                type="button"
                className="min-h-9 rounded-[var(--vestara-radius)] border border-[var(--vestara-border-default)] px-[var(--vestara-spacing-3)] text-[var(--vestara-font-size-sm)] text-[var(--vestara-text-secondary)] hover:border-[var(--vestara-accent-border-hover)] hover:text-[var(--vestara-text-primary)]"
                onClick={() => setShowResetConfirmation(false)}
              >
                Keep preferences
              </button>
              <button
                type="button"
                className="min-h-9 rounded-[var(--vestara-radius)] border border-[var(--vestara-status-warning-border)] bg-[var(--vestara-status-warning-bg)] px-[var(--vestara-spacing-3)] text-[var(--vestara-font-size-sm)] font-medium text-[var(--vestara-status-warning)] hover:border-[var(--vestara-status-warning)]"
                onClick={() => {
                  resetSettings();
                  setShowResetConfirmation(false);
                }}
              >
                Reset display
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
