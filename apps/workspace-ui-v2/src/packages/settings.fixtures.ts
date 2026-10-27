// Settings fixture — nav sections, topbar pills, menu rows, token doc copy.
// Pattern: apps/workspace/src/features/overview/overview.fixtures.ts.

export const SETTINGS_SECTIONS = [
  'Appearance',
  'Shell & TopBar',
  'Sidebar',
  'Workspace',
  'Network',
  'Runtime',
  'About',
] as const;

export const SETTINGS_ACTIVE_SECTION = 'Shell & TopBar';

export interface TopbarPill {
  label: string;
  active: boolean;
}

export const SETTINGS_TOPBAR_PILLS: TopbarPill[] = [
  { label: 'Height 32px', active: false },
  { label: 'Icons 12px', active: false },
  { label: 'Clean hover #111e20', active: true },
];

export const SETTINGS_MENU_ROWS = [
  '• Lockscreen → login locked',
  '• Switch User → login switch',
  '• Logout → login default',
  '• Shutdown → boot shutting down',
] as const;

// Documentation copy (describes the token ramp — not a style value).
export const SETTINGS_TOKENS_DOC = 'bg #0a1214 surface #0d191b #111e20 #132528 border #1a3a3d accent #2de8c3';

export interface UiVersionOption {
  value: 'v1' | 'v2';
  label: string;
}

// Toggle options for the Workspace UI card — labels live here so the
// component never hardcodes option arrays in JSX.
export const WORKSPACE_UI_VERSION_OPTIONS: UiVersionOption[] = [
  { value: 'v1', label: 'v1 (stable)' },
  { value: 'v2', label: 'v2 (next)' },
];

/** Offline fallback: this shell is v2, so the fixture default is v2. */
export const WORKSPACE_UI_VERSION_FIXTURE = 'v2' as const;

export const WORKSPACE_UI_VERSION_HELP =
  'Which UI build the API serves. Switching persists general.workspaceUiVersion and applies immediately to API-served pages (vite dev shells are unaffected).';
export const WORKSPACE_UI_VERSION_ENV_NOTE =
  'Locked by VESTARA_WORKSPACE_UI_VERSION — clear the env var to switch from Settings.';
export const WORKSPACE_UI_VERSION_OFFLINE_NOTE = 'API unreachable — showing this shell (v2). Sign in to switch.';
export const WORKSPACE_UI_VERSION_UNAUTHORIZED_NOTE = 'Sign in with an editor account to switch the workspace UI.';
