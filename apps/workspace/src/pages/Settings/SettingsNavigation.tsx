/**
 * VES-DESIGN-007C: SettingsNavigation — secondary navigation for the Settings screen.
 *
 * Renders navigation items drawn from the canonical SETTINGS_SECTIONS registry.
 * Only sections with defined routes are exposed. The mapping between display
 * names and section IDs is intentional — we do not fabricate surfaces for
 * sections that have no route or content authority.
 *
 * Architecture traceability:
 *   UI-SETTINGS-001 §C: Settings navigation composition.
 *   Authority: SETTINGS_SECTIONS registry is the single source of truth.
 *   Do NOT fabricate routes or content for absent sections.
 */

import { useLocation, useNavigate } from 'react-router-dom';
import { SETTINGS_SECTIONS } from './settings-navigation';
import { navIcon } from '../../layouts/workspace-navigation.js';
import { WorkspaceNavIcon } from '../../layouts/workspace-navigation.js';
import { NavLink } from 'react-router-dom';
import type { SettingsSectionMeta } from './settings-navigation';

export type SettingsNavSection = {
  id: string;
  label: string;
  description: string;
  group: string;
  icon: WorkspaceNavIcon;
  hasRoute: boolean;
};

/**
 * Map the approved visual-direction section names to existing registry IDs.
 * Only entries that resolve to a section in SETTINGS_SECTIONS are included.
 */
const NAV_MAP: Record<string, string> = {
  General: 'general',
  Appearance: 'appearance',
  'AI & Models': 'providers',
  Workspace: 'overview',
  Security: 'filesystem',
  Notifications: 'notifications',
  Advanced: 'advanced',
};

function useSettingsNavSections(): SettingsNavSection[] {
  const location = useLocation();
  const navigate = useNavigate();

  return SETTINGS_SECTIONS.map((section) => {
    const navId = NAV_MAP[section.label];
    const hasRoute = navId ? location.pathname === `/settings/${navId}` : false;

    return {
      id: section.id,
      label: section.label,
      description: section.description,
      group: section.group,
      icon: section.icon,
      hasRoute,
    };
  }).filter((section) => section.hasRoute);
}

function getActiveClass(isActive: boolean): string {
  if (isActive) {
    return 'group flex w-full items-center gap-2.5 rounded-[var(--vestara-radius)] border px-2 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-border-focus)] focus-visible:ring-inset border-[var(--vestara-accent-border)] bg-[var(--vestara-accent-bg)] shadow-[inset_3px_0_0_var(--vestara-accent)]';
  }
  return 'group flex w-full items-center gap-2.5 rounded-[var(--vestara-radius)] border px-2 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-border-focus)] border-transparent hover:border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] hover:bg-[var(--vestara-color-surface-interactive-hover,var(--vestara-accent-bg))]';
}

function SettingsNavLink({
  section,
}: {
  section: SettingsNavSection;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const isActive = section.id === location.pathname.replace('/settings/', '') || false;

  return (
    <NavLink
      key={section.id}
      to={`/settings/${section.id}`}
      className={getActiveClass(isActive)}
    >
      <span
        aria-hidden="true"
        className="grid size-7 shrink-0 place-items-center rounded-md border [&_svg]:size-4"
        style={{
          color: isActive ? 'var(--vestara-accent-text)' : 'var(--vestara-text-muted)',
          background: isActive
            ? 'var(--vestara-accent-bg)'
            : `color-mix(in srgb, var(--vestara-text-muted) 10%, transparent)`,
          borderColor: isActive ? 'var(--vestara-accent-border)' : `color-mix(in srgb, var(--vestara-text-muted) 28%, transparent)`,
        }}
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
    </NavLink>
  );
}

export function SettingsNavigation() {
  const sections = useSettingsNavSections();

  return (
    <nav aria-label="Settings sections" className="space-y-5">
      {sections.length ? (
        sections.map((section) => <SettingsNavLink key={section.id} section={section} />)
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