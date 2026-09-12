/**
 * VES-DESIGN-006: Canonical workspace navigation registry.
 *
 * One descriptive registry for sidebar items, command palette entries,
 * and future breadcrumbs/hero metadata. Replaces the hand-built
 * NAV_CATEGORIES (layouts/navigation.tsx, deleted).
 *
 * Authority boundaries (do not blur):
 * - ROUTES (routes.ts) own routing. Every entry id MUST equal an
 *   AppRoute.id (enforced by workspace-navigation.test.ts); an entry
 *   without a live route renders nothing.
 * - PERMISSIONS / module installation / capability activation own
 *   availability. This registry only DESCRIBES presentation.
 *   NAVIGATION VISIBILITY ≠ AUTHORIZATION — hiding is not security.
 * - Capability gating keeps today's narrow semantics: an entry with a
 *   capabilityId is dropped only when that capability is parked.
 *
 * The curated VISIBLE set matches assets/vestara-agents-screen.png:
 * Home, Global Assistant, Activity Room, Executions, Agents, Workflows,
 * Projects, Files, Terminal, Marketplace — divider — Tools, Settings.
 * Everything else is registered but hidden (discovery tier), so the
 * command palette can still find it.
 */

import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import ApiRoundedIcon from '@mui/icons-material/ApiRounded';
import ChatRoundedIcon from '@mui/icons-material/ChatRounded';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import DnsRoundedIcon from '@mui/icons-material/DnsRounded';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import ForumRoundedIcon from '@mui/icons-material/ForumRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import HubRoundedIcon from '@mui/icons-material/HubRounded';
import ImportContactsRoundedIcon from '@mui/icons-material/ImportContactsRounded';
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded';
import LightbulbRoundedIcon from '@mui/icons-material/LightbulbRounded';
import MemoryRoundedIcon from '@mui/icons-material/MemoryRounded';
import PublicRoundedIcon from '@mui/icons-material/PublicRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import RouteRoundedIcon from '@mui/icons-material/RouteRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import StorefrontRoundedIcon from '@mui/icons-material/StorefrontRounded';
import TerminalRoundedIcon from '@mui/icons-material/TerminalRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import VideoCallRoundedIcon from '@mui/icons-material/VideoCallRounded';
import ViewTimelineRoundedIcon from '@mui/icons-material/ViewTimelineRounded';
import type { ReactNode } from 'react';

// ─── Contract ────────────────────────────────────────────────────

export type WorkspaceNavGroupId =
  | 'workspace'
  | 'build'
  | 'automation'
  | 'runtime'
  | 'operations'
  | 'extend'
  | 'system';

/** Primary = sidebar. Secondary = reachable from parents. Discovery = search/command only. */
export type WorkspaceNavTier = 'primary' | 'secondary' | 'discovery';

export type WorkspaceNavIcon =
  | 'home'
  | 'assistant'
  | 'activity'
  | 'executions'
  | 'agents'
  | 'workflows'
  | 'projects'
  | 'files'
  | 'terminal'
  | 'marketplace'
  | 'tools'
  | 'settings'
  | 'dashboard'
  | 'diagnostics'
  | 'graph'
  | 'routing'
  | 'workforce'
  | 'sessions'
  | 'artifacts'
  | 'generic';

/** Route-less behavior for entries without a page (e.g. Global Assistant). */
export type WorkspaceNavAction = 'open-assistant';

export interface WorkspaceNavEntry {
  /** Join key — MUST equal an AppRoute.id. Action entries use a virtual id. */
  id: string;
  label: string;
  /** Undefined for action entries (no route). */
  path?: string;
  icon: WorkspaceNavIcon;
  group: WorkspaceNavGroupId;
  order: number;
  description?: string;
  keywords?: string[];
  badge?: string;
  /** Capability ID from the activation plan. Dropped when parked. */
  capabilityId?: string;
  /** Static hero copy (descriptive half of §12). Runtime stats stay in pages. */
  hero?: { eyebrow: string; subtitle: string };
  tier: WorkspaceNavTier;
  dividerBefore?: boolean;
  action?: WorkspaceNavAction;
}

/** VES-DESIGN-006 §6 extension boundary — unpopulated until module
 *  install/enable authority is ready for navigation contributions. */
export interface ModuleNavContribution {
  group: WorkspaceNavGroupId;
  label: string;
  icon: WorkspaceNavIcon;
  routeId: string;
  order: number;
}

// ─── Icon map (single place, was 25 ad-hoc imports) ──────────────

const ICONS: Record<WorkspaceNavIcon, ReactNode> = {
  home: <HomeRoundedIcon fontSize="small" />,
  assistant: <SmartToyRoundedIcon fontSize="small" />,
  activity: <ForumRoundedIcon fontSize="small" />,
  executions: <HubRoundedIcon fontSize="small" />,
  agents: <MemoryRoundedIcon fontSize="small" />,
  workflows: <AccountTreeRoundedIcon fontSize="small" />,
  projects: <FolderRoundedIcon fontSize="small" />,
  files: <DescriptionRoundedIcon fontSize="small" />,
  terminal: <TerminalRoundedIcon fontSize="small" />,
  marketplace: <StorefrontRoundedIcon fontSize="small" />,
  tools: <TuneRoundedIcon fontSize="small" />,
  settings: <SettingsRoundedIcon fontSize="small" />,
  dashboard: <DashboardRoundedIcon fontSize="small" />,
  diagnostics: <InsightsRoundedIcon fontSize="small" />,
  graph: <AccountTreeRoundedIcon fontSize="small" />,
  routing: <RouteRoundedIcon fontSize="small" />,
  workforce: <GroupsRoundedIcon fontSize="small" />,
  sessions: <ViewTimelineRoundedIcon fontSize="small" />,
  artifacts: <DescriptionRoundedIcon fontSize="small" />,
  generic: <ImportContactsRoundedIcon fontSize="small" />,
};

export const NAV_ICON_KEYS = Object.keys(ICONS) as WorkspaceNavIcon[];

export function navIcon(key: WorkspaceNavIcon): ReactNode {
  return ICONS[key] ?? ICONS.generic;
}

// Keep tree-shaken per-icon imports available for non-registry uses.
export { ApiRoundedIcon, ChatRoundedIcon, DnsRoundedIcon, LightbulbRoundedIcon, PublicRoundedIcon, ReceiptLongRoundedIcon, TuneRoundedIcon, VideoCallRoundedIcon };

// ─── Registry ────────────────────────────────────────────────────
// Curated visible order follows assets/vestara-agents-screen.png.
// Label/path remaps (ADAPT, not fabrication):
//   Home → /overview (workspace landing template)
//   Executions → /execution · Workflows → /orchestration (the flows surface)
//   Files → /files (thin reuse of the execution FilesystemPanel; fixes the
//     dead /files link QuickActions already points at)
//   Tools → /api-builder (the existing tools surface)

export const WORKSPACE_NAVIGATION: readonly WorkspaceNavEntry[] = [
  // ── Primary (sidebar, mock order) ──
  { id: 'overview', label: 'Home', path: '/overview', icon: 'home', group: 'workspace', order: 10, tier: 'primary', description: 'Workspace landing', keywords: ['home', 'overview', 'landing', 'start'], hero: { eyebrow: 'Welcome to Vestara', subtitle: 'Agents. Workflows. Tools. A more capable you.' } },
  { id: 'global-assistant', label: 'Global Assistant', icon: 'assistant', group: 'workspace', order: 20, tier: 'primary', description: 'Open the floating AI assistant', keywords: ['assistant', 'ai', 'chat', 'help'], action: 'open-assistant' },
  { id: 'activity', label: 'Activity Room', path: '/activity', icon: 'activity', group: 'workspace', order: 30, tier: 'primary', description: 'Live agent and workflow activity', keywords: ['activity', 'room', 'live', 'feed'] },
  { id: 'execution', label: 'Executions', path: '/execution', icon: 'executions', group: 'build', order: 40, tier: 'primary', description: 'Plans, agents, and runs', keywords: ['executions', 'execution', 'runs', 'plans', 'ops'], hero: { eyebrow: 'Live operations', subtitle: 'Plans, agents, and runs — live operational command.' } },
  { id: 'agents', label: 'Agents', path: '/agents', icon: 'agents', group: 'automation', order: 50, tier: 'primary', description: 'Deploy and manage AI agents', keywords: ['agents', 'control', 'manage', 'deploy'], hero: { eyebrow: 'Workforce', subtitle: 'Deploy, manage, and orchestrate AI agents for every part of your workflow.' } },
  { id: 'orchestration', label: 'Workflows', path: '/orchestration', icon: 'workflows', group: 'build', order: 60, tier: 'primary', description: 'Automated workflows and orchestration', keywords: ['workflows', 'orchestration', 'flows', 'automate'] },
  { id: 'projects', label: 'Projects', path: '/projects', icon: 'projects', group: 'build', order: 70, tier: 'primary', description: 'Browse engineering projects', keywords: ['projects', 'repos', 'repositories'] },
  { id: 'files', label: 'Files', path: '/files', icon: 'files', group: 'build', order: 80, tier: 'primary', description: 'Filesystem capability operations', keywords: ['files', 'filesystem', 'browse', 'operations'] },
  { id: 'terminal', label: 'Terminal', path: '/terminal', icon: 'terminal', group: 'runtime', order: 90, tier: 'primary', description: 'Integrated terminal', keywords: ['terminal', 'shell', 'console'] },
  { id: 'marketplace', label: 'Marketplace', path: '/marketplace', icon: 'marketplace', group: 'extend', order: 100, tier: 'primary', description: 'Discover and install engineering assets', keywords: ['marketplace', 'install', 'modules', 'assets', 'exchange'] },
  { id: 'api-builder', label: 'Tools', path: '/api-builder', icon: 'tools', group: 'system', order: 110, tier: 'primary', dividerBefore: true, description: 'Developer tools and API testing', keywords: ['tools', 'api', 'builder', 'rest', 'test'] },
  { id: 'settings', label: 'Settings', path: '/settings', icon: 'settings', group: 'system', order: 120, tier: 'primary', description: 'Workspace configuration', keywords: ['settings', 'configuration', 'preferences', 'theme'] },

  // ── Secondary (reachable from parents, searchable) ──
  { id: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: 'dashboard', group: 'workspace', order: 200, tier: 'secondary', description: 'Workspace dashboard', keywords: ['dashboard', 'health', 'stats'] },
  { id: 'diagnostics', label: 'Diagnostics', path: '/diagnostics', icon: 'diagnostics', group: 'operations', order: 210, tier: 'secondary', description: 'System health, processes, and signals', keywords: ['diagnostics', 'health', 'processes', 'system'], hero: { eyebrow: 'Live telemetry', subtitle: 'System health, processes, and signals — instrument-grade, at a glance.' } },
  { id: 'graph', label: 'Engineering Graph', path: '/graph', icon: 'graph', group: 'build', order: 220, tier: 'secondary', description: 'Entities and relationships map', keywords: ['graph', 'engineering', 'map', 'relationships'], hero: { eyebrow: 'Navigation layer', subtitle: 'Entities, relationships, and health — the canonical map of the workspace.' } },
  { id: 'routing', label: 'Routing', path: '/routing', icon: 'routing', group: 'automation', order: 230, tier: 'secondary', description: 'Provider routing assignments', keywords: ['routing', 'providers', 'models', 'assignments'], hero: { eyebrow: 'AI OS', subtitle: 'Select routing intent; the runtime validates and records the effective assignment.' } },
  { id: 'sessions', label: 'Sessions', path: '/sessions', icon: 'sessions', group: 'operations', order: 240, tier: 'secondary', description: 'Engineering sessions', keywords: ['sessions'] },
  { id: 'artifacts', label: 'Artifacts', path: '/artifacts', icon: 'artifacts', group: 'operations', order: 250, tier: 'secondary', description: 'Generated artifacts', keywords: ['artifacts'] },
  { id: 'ops', label: 'Operations', path: '/ops', icon: 'tools', group: 'operations', order: 260, tier: 'secondary', description: 'Workspace operations center', keywords: ['operations', 'ops', 'center'] },
  { id: 'activities', label: 'Activities', path: '/activities', icon: 'activity', group: 'operations', order: 270, tier: 'secondary', description: 'Notifications and logs', keywords: ['activities', 'notifications', 'logs'] },
  { id: 'workforce', label: 'Workforce', path: '/workforce', icon: 'workforce', group: 'automation', order: 280, tier: 'secondary', description: 'Engineering workforce', keywords: ['workforce', 'team'] },
  { id: 'memory', label: 'Knowledge', path: '/memory', icon: 'agents', group: 'automation', order: 290, tier: 'secondary', description: 'Knowledge graph', keywords: ['knowledge', 'memory', 'graph'] },
  { id: 'evidence', label: 'Evidence', path: '/evidence', icon: 'files', group: 'operations', order: 300, tier: 'secondary', description: 'Verification evidence', keywords: ['evidence', 'verification'] },
  { id: 'opencode-sessions', label: 'OpenCode Sessions', path: '/opencode/sessions', icon: 'terminal', group: 'runtime', order: 310, tier: 'secondary', description: 'OpenCode agent sessions', keywords: ['opencode', 'sessions'] },

  // ── Discovery (search/command only) ──
  { id: 'live-browser', label: 'Live Browser', path: '/live-browser', icon: 'generic', group: 'runtime', order: 400, tier: 'discovery', description: 'Browser runtime', keywords: ['browser', 'live'], capabilityId: 'browser-runtime' },
  { id: 'workers', label: 'Workers', path: '/workers', icon: 'generic', group: 'runtime', order: 410, tier: 'discovery', description: 'Worker cluster', keywords: ['workers', 'cluster'], capabilityId: 'worker-cluster' },
  { id: 'requests', label: 'Requests', path: '/requests', icon: 'generic', group: 'operations', order: 420, tier: 'discovery', description: 'Feature requests', keywords: ['requests', 'features'] },
  { id: 'meet', label: 'Vestara Meet', path: '/meet', icon: 'generic', group: 'workspace', order: 430, tier: 'discovery', description: 'Video meeting', keywords: ['meet', 'video', 'call'] },
  { id: 'chat', label: 'Chat', path: '/chat', icon: 'assistant', group: 'workspace', order: 440, tier: 'discovery', description: 'AI chat', keywords: ['chat'] },
  { id: 'docs', label: 'Docs', path: '/docs', icon: 'generic', group: 'operations', order: 450, tier: 'discovery', description: 'Documentation', keywords: ['docs', 'documentation', 'help'] },
  { id: 'external-runtimes', label: 'External Runtimes', path: '/external-runtimes', icon: 'generic', group: 'runtime', order: 460, tier: 'discovery', description: 'External runtime surfaces', keywords: ['runtimes', 'external'] },
  { id: 'opencode', label: 'OpenCode', path: '/opencode', icon: 'terminal', group: 'runtime', order: 470, tier: 'discovery', description: 'OpenCode overview', keywords: ['opencode'] },
  { id: 'opencode-permissions', label: 'OpenCode Permissions', path: '/opencode/permissions', icon: 'generic', group: 'runtime', order: 480, tier: 'discovery', description: 'OpenCode permission policy', keywords: ['opencode', 'permissions', 'policy'] },
  { id: 'qualification', label: 'Engineering Qualification', path: '/qualification', icon: 'generic', group: 'operations', order: 490, tier: 'discovery', description: 'Provider qualification trials', keywords: ['qualification', 'trials', 'benchmark'] },
  { id: 'verifier', label: 'Verifier', path: '/verifier', icon: 'generic', group: 'operations', order: 500, tier: 'discovery', description: 'Verification surface', keywords: ['verifier', 'verify'] },
];

// ─── Dogfood profile (moved from navigation.tsx, semantics unchanged) ─

/**
 * Capabilities parked in the dogfood profile.
 * Navigation entries tagged with these IDs are hidden.
 */
export const PARKED_CAPABILITIES: ReadonlySet<string> = new Set([
  'boot-runtime',
  'host-runtime',
  'browser-runtime',
  'telegram',
  'opencode-go-provider',
  'openai-provider',
  'worker-cluster',
  'dashboard-runtime',
]);

// ─── Projection (data → rendered sidebar shape) ──────────────────

export interface ProjectedNavItem {
  navId: string;
  to?: string;
  title: string;
  icon: ReactNode;
  description?: string;
  badge?: string | number;
  capabilityId?: string;
  dividerBefore?: boolean;
  action?: WorkspaceNavAction;
}

export interface ProjectedNavSection {
  title: string;
  items: ProjectedNavItem[];
}

export interface CustomNavEntry {
  id: string;
  label: string;
  path: string;
  icon: WorkspaceNavIcon;
  order: number;
  visible: boolean;
}

export interface NavigationProjectionInput {
  /** Per-id visibility overrides (user CRUD). Defaults: primary visible, rest hidden. */
  visibility?: Record<string, boolean>;
  /** Parked capability ids (dogfood profile). Entries gated on these are dropped. */
  parkedCapabilities?: ReadonlySet<string>;
  /** User-created entries (CRUD). Always eligible unless explicitly hidden. */
  custom?: CustomNavEntry[];
}

function isVisible(entry: WorkspaceNavEntry, visibility?: Record<string, boolean>): boolean {
  const override = visibility?.[entry.id];
  if (override !== undefined) return override;
  return entry.tier === 'primary';
}

/**
 * Project the registry into renderable sidebar sections.
 * Single unlabeled section (title '') — the curated mock renders as one
 * flat list with a divider; groups stay in the data model for search,
 * CRUD organization, and future headers.
 */
export function buildWorkspaceNavigation(input: NavigationProjectionInput = {}): ProjectedNavSection[] {
  const { visibility, parkedCapabilities, custom } = input;
  const items: ProjectedNavItem[] = [];

  for (const entry of WORKSPACE_NAVIGATION) {
    if (!isVisible(entry, visibility)) continue;
    if (entry.capabilityId && parkedCapabilities?.has(entry.capabilityId)) continue;
    if (!entry.path && !entry.action) continue;
    items.push({
      navId: entry.id,
      to: entry.path,
      title: entry.label,
      icon: navIcon(entry.icon),
      description: entry.description,
      badge: entry.badge,
      capabilityId: entry.capabilityId,
      dividerBefore: entry.dividerBefore,
      action: entry.action,
    });
  }

  for (const c of custom ?? []) {
    if (c.visible === false) continue;
    if (!c.label.trim() || !c.path.trim()) continue;
    items.push({
      navId: c.id,
      to: c.path,
      title: c.label.trim(),
      icon: navIcon(c.icon),
    });
  }

  const orderOf = (item: ProjectedNavItem): number => {
    const reg = WORKSPACE_NAVIGATION.find((e) => e.id === item.navId);
    if (reg) return reg.order;
    const cust = (custom ?? []).find((c) => c.id === item.navId);
    return cust?.order ?? 105;
  };
  items.sort((a, b) => orderOf(a) - orderOf(b));

  return [{ title: '', items }];
}

/** Flat search index over the whole registry (visible + hidden) + customs. */
export interface NavSearchEntry {
  id: string;
  label: string;
  path?: string;
  description?: string;
  keywords?: string[];
  action?: WorkspaceNavAction;
}

export function buildNavSearchIndex(custom: CustomNavEntry[] = []): NavSearchEntry[] {
  const index: NavSearchEntry[] = WORKSPACE_NAVIGATION.filter((e) => e.path || e.action).map((e) => ({
    id: e.id,
    label: e.label,
    path: e.path,
    description: e.description,
    keywords: e.keywords,
    action: e.action,
  }));
  for (const c of custom) {
    if (!c.label.trim() || !c.path.trim()) continue;
    index.push({ id: c.id, label: c.label.trim(), path: c.path.trim(), description: 'Custom menu' });
  }
  return index;
}
