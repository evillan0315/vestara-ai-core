/**
 * VES-UI-001 T0: Desktop Shell Fixture Dataset
 *
 * Deterministic fallback data promoted from the v2 prototype
 * (`assets/templates/html/v2/start/workspace-ui-v2/src/`). Never inline
 * this data in JSX — import the fixture.
 *
 * Sanitized on promotion (plan G7/G10/G11):
 * - No `Math.random` window placement (fixed cascade coordinates).
 * - No version strings (`v7.15.112`, `112 FINAL` dropped).
 * - No hardcoded operator identity — `LoginScreen` must resolve the real
 *   actor from `useAuth`; this fixture is a shape placeholder only.
 *
 * Architecture Traceability:
 *   VES-UI-001: Workspace UI v2 Desktop Shell (Phase 0 scaffold)
 *   @see docs/plans/VES-UI-001-workspace-ui-v2-desktop-shell-plan.md §2–§3
 */

import type { PackageDef, WinData, WinType } from './types';

export interface DesktopShellUser {
  readonly id: string;
  readonly displayName: string;
  readonly initials: string;
}

/**
 * Placeholder operator identity for fixture-first rendering only.
 * Production login resolves the actor from `useAuth` (T2.2).
 */
export const desktopShellUserFixture: DesktopShellUser = {
  id: 'local-operator',
  displayName: 'Workspace Operator',
  initials: 'WO',
};

/** Boot log stream — version-free (G11), deterministic (G7). */
export const desktopShellBootLogsFixture: readonly string[] = [
  '[ OK ] Mounted vestara-corefs',
  '[ OK ] Teal surface driver initialized',
  '[ OK ] Wired package registry sync',
  '[ OK ] Agent mesh nodes ready',
  '[ OK ] Draggable workspace compositor',
  '[ OK ] Shell header compact mode',
  '[ OK ] V logo accent gradient bound',
  '[ OK ] Desktop vignette loaded',
];

/** Default workspace identifier (mirrors the prototype `WORKSPACE`). */
export const desktopShellWorkspaceFixture = 'vestara-platform';

/** Canonical package titles for every `WinType`. */
export const desktopShellPackageTitles: Record<WinType, string> = {
  overview: 'Overview',
  terminal: 'Terminal',
  activity: 'Activity Room',
  marketplace: 'Marketplace',
  files: 'Files',
  settings: 'Settings',
  agent: 'Agent Workforce',
  diagnostic: 'Diagnostic Center',
  workspace: 'Workspace',
};

/**
 * Package registry — MUI icon names (`@mui/icons-material`, matching the
 * repo's v6.4.0 imports; never `lucide-react`). Components resolve these
 * to icon components in T1–T3; fixtures carry names only.
 */
export const desktopShellPackagesFixture: readonly PackageDef[] = [
  {
    id: 'overview',
    title: 'Overview',
    subtitle: 'Workspace at a glance',
    icon: 'DashboardRounded',
    defaultSize: { w: 560, h: 380 },
  },
  {
    id: 'terminal',
    title: 'Terminal',
    subtitle: 'Shell session',
    icon: 'TerminalOutlined',
    defaultSize: { w: 640, h: 360 },
  },
  {
    id: 'activity',
    title: 'Activity Room',
    subtitle: 'Live operations',
    icon: 'ForumRounded',
    defaultSize: { w: 720, h: 480 },
  },
  {
    id: 'marketplace',
    title: 'Marketplace',
    subtitle: 'Capabilities',
    icon: 'StorefrontRounded',
    defaultSize: { w: 520, h: 340 },
  },
  {
    id: 'files',
    title: 'Files',
    subtitle: 'Workspace files',
    icon: 'FolderOpenOutlined',
    defaultSize: { w: 640, h: 400 },
  },
  {
    id: 'settings',
    title: 'Settings',
    subtitle: 'Shell and appearance',
    icon: 'SettingsOutlined',
    defaultSize: { w: 640, h: 400 },
  },
  {
    id: 'agent',
    title: 'Agent Workforce',
    subtitle: 'Agent fleet',
    icon: 'SmartToyRounded',
    defaultSize: { w: 640, h: 400 },
  },
  {
    id: 'diagnostic',
    title: 'Diagnostic Center',
    subtitle: 'Telemetry',
    icon: 'ScienceOutlined',
    defaultSize: { w: 640, h: 400 },
  },
  {
    id: 'workspace',
    title: 'Workspace',
    subtitle: 'Desktop workspace',
    icon: 'DesktopWindowsOutlined',
    defaultSize: { w: 560, h: 380 },
  },
];

/** Default window stack — fixed cascade (no `Math.random`, G7). */
export const desktopShellWindowsFixture: readonly WinData[] = [  {
    id: 'win-overview',
    title: 'Overview',
    subtitle: 'Workspace at a glance',
    x: 120,
    y: 60,
    w: 560,
    h: 380,
    z: 1,
    minimized: false,
    maximized: false,
    type: 'overview',
  },
  {
    id: 'win-terminal',
    title: 'Terminal',
    subtitle: 'Shell session',
    x: 160,
    y: 120,
    w: 640,
    h: 360,
    z: 2,
    minimized: false,
    maximized: false,
    type: 'terminal',
  },
  {
    id: 'win-activity',
    title: 'Activity Room',
    subtitle: 'Live operations',
    x: 200,
    y: 80,
    w: 720,
    h: 480,
    z: 3,
    minimized: false,
    maximized: false,
    type: 'activity',
  },
  {
    id: 'win-marketplace',
    title: 'Marketplace',
    subtitle: 'Capabilities',
    x: 100,
    y: 200,
    w: 520,
    h: 340,
    z: 4,
    minimized: true,
    maximized: false,
    type: 'marketplace',
  },
];

/**
 * VES-UI-001 T2: Dock order — the 8 package slots rendered by `Dock`
 * (prototype `Dock.tsx` order; `workspace` has no dock slot).
 * Components map each entry to its MUI icon via `desktopShellIconFor`.
 */
export const desktopShellDockOrderFixture: readonly WinType[] = [
  'overview',
  'terminal',
  'activity',
  'marketplace',
  'agent',
  'diagnostic',
  'settings',
  'files',
];

/**
 * VES-UI-001 T4: Login brand-panel highlights — the 3 package summaries
 * rendered by `LoginScreen` (prototype `LoginScreen.tsx` order).
 * Imported from the package registry (never hardcoded arrays in JSX);
 * `LoginScreen` resolves titles/subtitles from `desktopShellPackagesFixture`.
 */
export const desktopShellLoginHighlightsFixture: readonly WinType[] = [
  'terminal',
  'activity',
  'marketplace',
];

export interface DesktopShellDesktopIcon {
  readonly type: WinType;
  readonly label: string;
}

/**
 * VES-UI-001 T2: Desktop icon set — the 5 launcher icons rendered by
 * `DesktopIcons` (prototype `DesktopIcons.tsx`; double-click / Enter to open).
 */
export const desktopShellDesktopIconsFixture: readonly DesktopShellDesktopIcon[] = [
  { type: 'overview', label: 'My Workspace' },
  { type: 'activity', label: 'Activity Room' },
  { type: 'marketplace', label: 'Marketplace' },
  { type: 'terminal', label: 'Terminal' },
  { type: 'files', label: 'Files' },
];
