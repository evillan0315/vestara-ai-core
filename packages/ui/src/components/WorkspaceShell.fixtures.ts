/**
 * WorkspaceShell fixtures — default navigation vocabulary extracted from
 * `assets/templates/html/Vestara-Shell-Tsx.html` (`LeftRail` + `SecondaryNav`).
 *
 * String-only: icons are host-supplied `ReactNode` slots so `@vestara/ui`
 * keeps zero icon dependencies. Import these defaults instead of inlining
 * navigation arrays in JSX (UI-UX Governance §6).
 */

import type { WorkspaceNavSection } from './WorkspaceShell.js';

// ─── Rail defaults ─────────────────────────────────────────────

export const WORKSPACE_RAIL_PRIMARY_IDS = ['Discover', 'Categories', 'Capabilities', 'Installed', 'Updates'] as const;

export const WORKSPACE_RAIL_SECONDARY_IDS = ['My Collections', 'Publish', 'Registries'] as const;

// ─── Secondary navigation defaults ─────────────────────────────

export const WORKSPACE_NAV_SECTIONS: WorkspaceNavSection[] = [
  { label: 'Explore', items: ['Discover', 'Categories', 'Capabilities'] },
  { label: 'Workspace', items: ['Installed', 'Updates', 'My Collections'] },
  { label: 'Registry', items: ['Publish', 'Registries'] },
];
