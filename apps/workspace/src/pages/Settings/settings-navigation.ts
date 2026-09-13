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

export type SettingsGroupId = 'workspace' | 'runtime-ai' | 'engineering' | 'operations' | 'advanced';

export interface SettingsNavGroup {
  id: SettingsGroupId;
  label: string;
}

export const SETTINGS_GROUPS: SettingsNavGroup[] = [
  { id: 'workspace', label: 'Workspace' },
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
  { id: 'overview', label: 'Overview', description: 'Configuration and system health', group: 'workspace', icon: 'dashboard', code: 'OV' },
  { id: 'hero', label: 'Hero & Briefing', description: 'Overview hero topic, rotation and morning briefing', group: 'workspace', icon: 'dashboard', code: 'HR' },
  { id: 'general', label: 'General', description: 'Workspace identity and interface', group: 'workspace', icon: 'settings', code: 'GN' },
  { id: 'navigation', label: 'Navigation', description: 'Sidebar menus and custom entries', group: 'workspace', icon: 'routing', code: 'NV' },
  { id: 'runtime', label: 'Runtime', description: 'Runtime services and operations', group: 'runtime-ai', icon: 'activity', code: 'RT' },
  { id: 'providers', label: 'AI Providers', description: 'Providers and models', group: 'runtime-ai', icon: 'assistant', code: 'AI' },
  { id: 'agents', label: 'Agents', description: 'Agent execution policy', group: 'runtime-ai', icon: 'agents', code: 'AG' },
  { id: 'assistant-execution', label: 'Assistant Execution', description: 'Turn budgets, timeouts and tool visibility', group: 'runtime-ai', icon: 'assistant', code: 'AX' },
  { id: 'filesystem', label: 'Filesystem & Safety', description: 'Boundaries and risk controls', group: 'engineering', icon: 'files', code: 'FS' },
  { id: 'verification', label: 'Verification', description: 'Checks and evidence policy', group: 'engineering', icon: 'workflows', code: 'VR' },
  { id: 'cli', label: 'CLI Integration', description: 'CLI compatibility and transport', group: 'engineering', icon: 'terminal', code: 'CL' },
  { id: 'history', label: 'Engineering History', description: 'Temporal event store', group: 'engineering', icon: 'sessions', code: 'EH' },
  { id: 'notifications', label: 'Notifications', description: 'Operational notifications', group: 'operations', icon: 'executions', code: 'NT' },
  { id: 'telemetry', label: 'Telemetry', description: 'Observability detail', group: 'operations', icon: 'diagnostics', code: 'TM' },
  { id: 'connection', label: 'Connection', description: 'Client API endpoint for standalone clients', group: 'operations', icon: 'tools', code: 'CN' },
  { id: 'advanced', label: 'Advanced', description: 'Experimental behavior', group: 'advanced', icon: 'generic', code: 'AD' },
  { id: 'telegram', label: 'Telegram', description: 'Telegram integration simulator', group: 'advanced', icon: 'marketplace', code: 'TG' },
];

export function settingsGroupLabel(group: SettingsGroupId): string {
  return SETTINGS_GROUPS.find((entry) => entry.id === group)?.label ?? group;
}
