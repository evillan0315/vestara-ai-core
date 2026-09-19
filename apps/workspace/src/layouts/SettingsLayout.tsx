/**
 * VES-DESIGN-007L: SettingsLayout — canonical Settings page composition.
 *
 * Owned by: Settings page (consumer)
 * Substrate: WorkspacePanelLayout (page width/gutters)
 * Composition: SettingsHeader + SettingsNavigation + SettingsContent
 *
 * Authority boundaries (do not blur):
 * - Navigation derives from the SETTINGS_SECTIONS registry — only sections with
 *   defined routes are exposed. Displayed ≠ authorized.
 * - Values project authoritative API/runtime state — never fabricated.
 * - Save state flows through the General form draft, not through the layout.
 * - Do NOT convert this to a full page layout (ShellLayout owns that). This
 *   component owns the Settings composition only.
 *
 * Responsive contract:
 *   Desktop:  navigation beside content.
 *   Tablet:   navigation may narrow/reflow without compromising content width.
 *   Mobile:   navigation becomes a compact surface — Settings-owned, not
 *             an application sidebar. Content column becomes single-column.
 */

import { useLocation, NavLink } from 'react-router-dom';
import { SETTINGS_SECTIONS } from '../pages/Settings/settings-navigation';
import { navIcon } from './workspace-navigation';
import {
  Button,
  SettingsSection,
  Status,
  Toggle,
} from '../pages/Settings/settings-ui.js';

// Card components from the Settings page
import { WorkspaceInformationCard } from '../pages/Settings/WorkspaceInformationCard';
import { RegionalSettingsCard } from '../pages/Settings/RegionalSettingsCard';
import { PreferencesCard } from '../pages/Settings/PreferencesCard';
import { WorkspaceStatusCard } from '../pages/Settings/WorkspaceStatusCard';
import { SettingsQuickActions } from '../pages/Settings/SettingsQuickActions';

export interface SettingsLayoutProps {
  /** Authoritative configuration from the resolved store. */
  configuration: import('@vestara/configuration').ResolvedConfiguration;
  /** Runtime status from the API. */
  runtime: import('../pages/Settings/settings-client').RuntimeStatusDto;
  /** Callback when a setting field changes. */
  onFieldChange: (key: string, value: unknown) => void;
  /** Selected section from route navigation. */
  selectedSection?: { id: string };
  /** Callback when the save button state changes. */
  onSaveClick?: () => void;
}

/**
 * SettingsHeader — top-level header showing "Settings" with summary chips.
 *
 * Content hierarchy:
 *   "Settings" label + domain description
 *   Summary values (Workspace, Environment, Last updated) projected from
 *   authoritative API/runtime state — never fabricated.
 */
function SettingsHeader({
  configuration,
  runtime,
  onFieldChange,
  selectedSection,
}: {
  configuration: import('@vestara/configuration').ResolvedConfiguration;
  runtime: import('../pages/Settings/settings-client').RuntimeStatusDto;
  onFieldChange: (key: string, value: unknown) => void;
  selectedSection?: { id: string };
}) {
  const workspaceName = configuration.settings.find(
    (s) => s.key === 'general.workspaceName',
  )?.value;

  const lastUpdated = configuration.generatedAt
    ? // Use relativeTime helper logic inline
      (() => {
        const ms = Date.now() - new Date(configuration.generatedAt).getTime();
        if (Number.isNaN(ms)) return null;
        const minutes = Math.max(0, Math.round(ms / 60000));
        if (minutes < 1) return 'just now';
        if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
        const hours = Math.round(minutes / 60);
        if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
        const days = Math.round(hours / 24);
        return `${days} day${days === 1 ? '' : 's'} ago`;
      })()
    : undefined;

  return (
    <header className="st-panel border-b border-[var(--vestara-color-border-subtle)] pb-6">
      <div className="flex min-w-0 flex-col lg:flex-row gap-6 lg:gap-8 items-start lg:items-center">
        <div className="min-w-0">
          <h2 className="text-[var(--vestara-font-size-xl)] font-semibold text-[var(--vestara-color-text-primary)]">
            Settings
          </h2>
          <p className="mt-1 text-[var(--vestara-font-size-sm)] text-[var(--vestara-color-text-muted)]">
            Configure your workspace, preferences, integrations, and system behavior.
          </p>
        </div>

        {/* Summary chips — only show values with authoritative backing. */}
        {workspaceName && lastUpdated && (
          <div className="mt-4 flex flex-col lg:flex-row gap-4 lg:gap-2 lg:mt-0">
            <div className="st-hero-chip lg:col-span-1">
              <span className="st-hero-chip-label">Workspace</span>
              <span className="st-hero-chip-value">{workspaceName}</span>
            </div>
            <div className="st-hero-chip lg:col-span-1">
              <span className="st-hero-chip-label">Last updated</span>
              <span className="st-hero-chip-value">{lastUpdated}</span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

/**
 * SettingsNavigation — secondary navigation for the Settings screen.
 *
 * Data-driven from the canonical SETTINGS_SECTIONS registry. Only sections
 * with defined routes are exposed. The mapping between display names and
 * section IDs is intentional — we do not fabricate empty configuration
 * surfaces to match a generated image.
 *
 * Responsive behavior:
 *   Desktop:  horizontal nav bar beside content.
 *   Tablet:   may narrow/reflow.
 *   Mobile:   compact select dropdown (handled by caller via lg:hidden).
 */
function SettingsNavigation() {
  const location = useLocation();

  // Map approved visual-direction section names to registry IDs.
  const NAV_MAP: Record<string, string> = {
    General: 'general',
    Appearance: 'appearance',
    'AI & Models': 'providers',
    Workspace: 'overview',
    Security: 'filesystem',
    Notifications: 'notifications',
    Advanced: 'advanced',
  };

  const navItems = SETTINGS_SECTIONS
    .filter((section) => NAV_MAP[section.label])
    .map((section) => {
      const navId = NAV_MAP[section.label]!;
      const isActive = location.pathname === `/settings/${navId}`;
      return {
        id: section.id,
        label: section.label,
        description: section.description,
        group: section.group,
        isActive,
        // Use the canonical icon key from the registry; navIcon will render it.
        icon: section.icon,
      };
    });

  return (
    <nav aria-label="Settings sections" className="space-y-5">
      {navItems.length ? (
        <div className="flex flex-col lg:flex-row gap-2">
          {navItems.map((item) => (
            <NavLink
              key={item.id}
              to={`/settings/${item.id}`}
              className={
                item.isActive
                  ? 'group flex w-full items-center gap-2.5 rounded-[var(--vestara-radius)] border px-2 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-border-focus)] focus-visible:ring-inset border-[var(--vestara-accent-border)] bg-[var(--vestara-accent-bg)] shadow-[inset_3px_0_0_var(--vestara-accent)]'
                  : 'group flex w-full items-center gap-2.5 rounded-[var(--vestara-radius)] border px-2 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-border-focus)] border-transparent hover:border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] hover:bg-[var(--vestara-color-surface-interactive-hover,var(--vestara-accent-bg))]'
              }
            >
              <span
                aria-hidden="true"
                className="grid size-7 shrink-0 place-items-center rounded-md border [&_svg]:size-4"
                style={{
                  color: item.isActive ? 'var(--vestara-accent-text)' : 'var(--vestara-text-muted)',
                  background: item.isActive ? 'var(--vestara-accent-bg)' : `color-mix(in srgb, var(--vestara-text-muted) 10%, transparent)`,
                  borderColor: item.isActive ? 'var(--vestara-accent-border)' : `color-mix(in srgb, var(--vestara-text-muted) 28%, transparent)`,
                }}
              >
                {navIcon(item.icon)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-[var(--vestara-color-text-primary,var(--vestara-text))]">
                  {item.label}
                </span>
                <span className="block text-[11px] leading-snug text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
                  {item.description}
                </span>
              </span>
            </NavLink>
          ))}
        </div>
      ) : (
        <div className="py-8 text-center">
          <p className="text-sm text-[var(--vestara-color-text-secondary)]">No settings found</p>
          <p className="mt-1 text-xs text-[var(--vestara-color-text-muted)]">
            Try a category, configuration, or capability.
          </p>
        </div>
      )}
    </nav>
  );
}

/**
 * SettingsContent — main content area with card composition.
 *
 * Renders the card composition (WorkspaceInformationCard,
 * RegionalSettingsCard, PreferencesCard, WorkspaceStatusCard,
 * SettingsQuickActions) in a responsive grid. On desktop, displays a
 * two-column layout (main + context). On mobile, single column.
 */
function SettingsContent({
  configuration,
  runtime,
  onFieldChange,
  selectedSection,
  onSaveClick,
}: {
  configuration: import('@vestara/configuration').ResolvedConfiguration;
  runtime: import('../pages/Settings/settings-client').RuntimeStatusDto;
  onFieldChange: (key: string, value: unknown) => void;
  selectedSection?: { id: string };
  onSaveClick?: () => void;
}) {
  // When a specific section is selected via navigation, render its policy content.
  if (selectedSection && selectedSection.id !== 'overview') {
    const meta = SETTINGS_SECTIONS.find((s) => s.id === selectedSection.id);
    if (!meta) return null;

    return (
      <SettingsSection
         title={meta.label}
        description="Resolved runtime policy. Editing requires an atomic apply operation from the owning runtime."
      >
        <div className="p-8 text-center">
          <p className="text-sm text-[var(--vestara-color-text-secondary)]">
            {selectedSection.id === 'advanced'
              ? 'Experimental behavior settings.'
              : selectedSection.id === 'notifications'
                ? 'Notification configuration.'
                : 'No registered settings are exposed by the owning runtime.'}
          </p>
        </div>
      </SettingsSection>
    );
  }

  // Default: render the card composition for the overview/general surface.
  return (
    <div className="grid min-w-0 w-full gap-6 sm:gap-8 lg:grid-cols-2 lg:gap-8">
      {/* Main configuration column (primary) — takes 2 columns on desktop. */}
      <div className="lg:col-span-2 space-y-6">
        <WorkspaceInformationCard
          configuration={configuration}
          onFieldChange={onFieldChange}
        />
        <RegionalSettingsCard configuration={configuration} onFieldChange={onFieldChange} />
        <PreferencesCard configuration={configuration} onFieldChange={onFieldChange} />
      </div>

      {/* Context/aside column (secondary) — takes 1 column on desktop. */}
      <aside className="space-y-6">
        <WorkspaceStatusCard
          runtime={runtime}
          configuration={configuration}
        />
        {onSaveClick && (
          <SettingsQuickActions
            onExport={() => {/* TODO: export implementation */}}
            onImport={() => {/* TODO: import implementation */}}
            onReset={() => onSaveClick()}
            onClearAll={() => {/* TODO: clear all — only if supported */}}
            canClearAll={false}
          />
        )}
      </aside>
    </div>
  );
}

export function SettingsLayout({ configuration, runtime, onFieldChange, selectedSection, onSaveClick }: SettingsLayoutProps) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <SettingsHeader
        configuration={configuration}
        runtime={runtime}
        onFieldChange={onFieldChange}
        selectedSection={selectedSection}
      />
      <SettingsNavigation />
      <SettingsContent
        configuration={configuration}
        runtime={runtime}
        onFieldChange={onFieldChange}
        selectedSection={selectedSection}
        onSaveClick={onSaveClick}
      />
    </div>
  );
}

export { SettingsHeader, SettingsNavigation, SettingsContent };
