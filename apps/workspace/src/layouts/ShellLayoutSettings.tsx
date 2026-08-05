import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { PROFILES, useTheme } from '../lib/theme.js';
import { Button, focus, input, SearchIcon, surface } from '../pages/Settings/settings-ui.js';

export interface SettingsNavigationItem {
  id: string;
  label: string;
  description: string;
  code: string;
}

interface ShellLayoutSettingsProps {
  children: ReactNode;
  navigation: SettingsNavigationItem[];
  totalNavigationItems: number;
  query: string;
  onQueryChange: (query: string) => void;
}

function SettingsNavigation({
  navigation,
  totalNavigationItems,
  query,
  onQueryChange,
}: Omit<ShellLayoutSettingsProps, 'children'>) {
  const links = (
    <nav aria-label="Settings sections" className="space-y-1">
      {navigation.map((section) => (
        <NavLink
          key={section.id}
          to={`/settings/${section.id}`}
          className={({ isActive }) =>
            `group grid grid-cols-[2rem_minmax(0,1fr)] gap-2 rounded-[var(--vestara-radius)] border px-2 py-2 ${focus} ${isActive ? 'border-[var(--vestara-accent-border)] bg-[var(--vestara-accent-bg)] shadow-[inset_3px_0_0_var(--vestara-accent)]' : 'border-transparent hover:border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] hover:bg-[var(--vestara-color-surface-interactive-hover,var(--vestara-accent-bg))]'}`
          }
        >
          <span className="grid size-7 place-items-center font-mono text-[10px] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] group-[.active]:text-[var(--vestara-accent-text)]">
            {section.code}
          </span>
          <span>
            <span className="block text-sm font-medium text-[var(--vestara-color-text-primary,var(--vestara-text))]">
              {section.label}
            </span>
            <span className="block truncate text-[10px] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
              {section.description}
            </span>
          </span>
        </NavLink>
      ))}
    </nav>
  );

  const content = (
    <>
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
      <div className="mt-0">
        {navigation.length ? (
          links
        ) : (
          <div className="py-8 text-center">
            <p className="text-sm text-(--vestara-color-text-secondary,var(--vestara-text-2))">
              No settings found
            </p>
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
        )}
      </div>
    </>
  );

  return (
    <>
      <aside className="hidden w-65 shrink-0 border-r border-(--vestara-color-border-subtle,var(--color-zinc-800)) bg-[var(--vestara-color-bg-workspace,var(--color-zinc-950))] lg:block">
        <div className="sticky top-0 max-h-[calc(100vh-4rem)] overflow-y-auto p-(--vestara-spacing-page)">
          {content}
        </div>
      </aside>
      <details
        className={`mx-(--vestara-spacing-page) mt-(--vestara-spacing-page) rounded-(--vestara-radius-lg) p-3 lg:hidden ${surface}`}
      >
        <summary
          className={`cursor-pointer text-sm font-medium text-(--vestara-color-text-primary,var(--vestara-text)) ${focus}`}
        >
          Settings navigation
        </summary>
        <div className="mt-3">{content}</div>
      </details>
    </>
  );
}

export default function ShellLayoutSettings({
  children,
  navigation,
  totalNavigationItems,
  query,
  onQueryChange,
}: ShellLayoutSettingsProps) {
  const { activeProfile, resetSettings } = useTheme();

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-(--vestara-color-bg-app,var(--color-zinc-950)) font-(--vestara-font-family) text-(--vestara-color-text-primary,var(--vestara-text))">
      <header className="border-b border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] px-[var(--vestara-spacing-page)] py-0">
        <div className="max-w-[var(--vestara-page-max-width)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--vestara-accent-text)]">
                Workspace
              </p>
              <h1 className="mt-1 text-[clamp(1.4rem,2vw,1.75rem)] font-semibold tracking-tight">Settings</h1>
              <p className="mt-1 text-[var(--vestara-font-size-sm)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
                Configure the visual, operational, and runtime behavior of Vestara.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-[var(--vestara-radius-full)] border border-[var(--vestara-accent-border)] bg-[var(--vestara-accent-bg)] px-2.5 py-1 text-xs text-[var(--vestara-accent-text)]">
                {activeProfile
                  ? `${PROFILES.find((profile) => profile.id === activeProfile)?.label ?? activeProfile} profile`
                  : 'Custom display'}
              </span>
              {!activeProfile && <Button onClick={resetSettings}>Reset display</Button>}
            </div>
          </div>
        </div>
      </header>
      <div className="lg:flex">
        <SettingsNavigation
          navigation={navigation}
          totalNavigationItems={totalNavigationItems}
          query={query}
          onQueryChange={onQueryChange}
        />
        <main className="min-w-0 flex-1 px-[var(--vestara-spacing-page)] py-[var(--vestara-spacing-page)]">
          <div className="max-w-[1080px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
