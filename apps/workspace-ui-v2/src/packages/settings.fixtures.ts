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
