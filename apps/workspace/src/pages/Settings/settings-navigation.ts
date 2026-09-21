/**
 * VES-DESIGN-007: Settings domain registry (presentation metadata only).
 *
 * Single source of truth for Settings secondary-navigation presentation:
 * grouping, icons, and search text. Mirrors the canonical workspace
 * navigation registry (layouts/workspace-navigation.tsx) at the Settings
 * scope — primary sidebar stays untouched:
 *
 *   Workspace Sidebar → Settings → Settings Domain Navigation → Surface
 *
 * Authority boundaries (do not blur):
 * - Configuration authority lives in @vestara/configuration + the owning
 *   runtimes (via settings-client.ts). This registry only DESCRIBES
 *   presentation. NAVIGATION VISIBILITY ≠ AUTHORIZATION.
 * - DISPLAYED VALUE ≠ USER OVERRIDE ≠ EFFECTIVE VALUE — rows render
 *   resolved API data; this file holds no values.
 * - Do NOT convert this to YAML/PageDefinition (VES-APP-001 is separate).
 *   Declarative pages will consume the same React primitives later.
 */

import type { WorkspaceNavIcon } from '../../layouts/workspace-navigation.js';

export type SettingsGroupId = 'workspace' | 'appearance' | 'system' | 'runtime-ai' | 'engineering' | 'operations' | 'advanced';

export interface SettingsNavGroup {
  id: SettingsGroupId;
  label: string;
}

export const SETTINGS_GROUPS: SettingsNavGroup[] = [
  { id: 'workspace', label: 'Workspace' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'system', label: 'System' },
  { id: 'runtime-ai', label: 'Runtime & AI' },
  { id: 'engineering', label: 'Engineering' },
  { id: 'operations', label: 'Operations' },
  { id: 'advanced', label: 'Advanced' },
];

export interface SettingsSectionMeta {
  id: string;
  label: string;
  description: string;
  group: SettingsGroupId;
  /** Canonical workspace icon key — rendered via navIcon() (no new icon system). */
  icon: WorkspaceNavIcon;
  /**
   * Legacy two-letter tile code. Kept for compatibility only; the premium
   * surface prefers the icon and must not let abbreviations dominate.
   */
  code: string;
}

export const SETTINGS_SECTIONS: SettingsSectionMeta[] = [
  { id: 'general', label: 'General', description: 'Workspace identity and defaults', group: 'workspace', icon: 'settings', code: 'GN' },
  { id: 'navigation', label: 'Navigation', description: 'Sidebar menus and custom entries', group: 'workspace', icon: 'routing', code: 'NV' },
  { id: 'system', label: 'System', description: 'Host, runtime and environment information', group: 'system', icon: 'diagnostics', code: 'SY' },
  { id: 'runtime', label: 'Runtime', description: 'Runtime services, CLI integration and event history', group: 'runtime-ai', icon: 'activity', code: 'RT' },
  { id: 'ai', label: 'AI & Agents', description: 'Providers, models and agent execution policy', group: 'runtime-ai', icon: 'assistant', code: 'AI' },
  { id: 'security', label: 'Security', description: 'Filesystem boundaries, verification and risk controls', group: 'engineering', icon: 'files', code: 'SC' },
  { id: 'operations', label: 'Operations', description: 'Telemetry, CI, connection and operational config', group: 'operations', icon: 'diagnostics', code: 'OP' },
  { id: 'advanced', label: 'Advanced', description: 'Experimental behavior and integrations', group: 'advanced', icon: 'generic', code: 'AD' },
];

export function settingsGroupLabel(group: SettingsGroupId): string {
  return SETTINGS_GROUPS.find((entry) => entry.id === group)?.label ?? group;
}
