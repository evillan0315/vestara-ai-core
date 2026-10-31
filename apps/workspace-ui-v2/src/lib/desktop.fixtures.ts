// Desktop chrome fixtures — icons, dock order, seed windows, titles, user.
// Pattern: apps/workspace/src/features/overview/overview.fixtures.ts.

import type { WinData, WinType } from '../lib/types';

export interface DesktopIconDef {
  type: WinType;
  label: string;
}

export const DESKTOP_ICONS: DesktopIconDef[] = [
  { type: 'overview', label: 'My Workspace' },
  { type: 'activity', label: 'Activity Room' },
  { type: 'marketplace', label: 'Marketplace' },
  { type: 'terminal', label: 'Terminal' },
  { type: 'files', label: 'Files' },
  { type: 'voice', label: 'Voice Streaming' },
];

export const DOCK_TYPES: WinType[] = [
  'overview',
  'terminal',
  'activity',
  'marketplace',
  'agent',
  'diagnostic',
  'settings',
  'files',
  'voice',
];

// Desktop opens on the Overview package — the live mission view is the
// default window. Users launch more apps via icons, dock, or assistant.
export const DEFAULT_WINDOWS: WinData[] = [
  {
    id: 'win-overview',
    title: 'Overview',
    subtitle: 'Good afternoon Director',
    x: 120,
    y: 60,
    w: 560,
    h: 380,
    z: 1,
    minimized: false,
    maximized: false,
    type: 'overview',
  },
];

export const WINDOW_TITLES: Record<WinType, string> = {
  overview: 'Overview',
  terminal: 'Terminal',
  activity: 'Activity Room',
  marketplace: 'Marketplace',
  files: 'Files',
  settings: 'Settings',
  agent: 'Agent Workforce',
  diagnostic: 'Diagnostic Center',
  workspace: 'Workspace',
  voice: 'Voice Streaming',
};

export const SHELL_USER = {
  initial: 'E',
  name: 'Eddie R Villanueva',
  statusLong: 'Online • 10 agents • 1 workflow',
  statusShort: 'Online • 10 agents',
} as const;

export type SystemMenuIcon = 'lock' | 'users' | 'settings' | 'logout' | 'power';

export interface SystemMenuItem {
  id: string;
  label: string;
  icon: SystemMenuIcon;
  danger?: boolean;
}

export const SYSTEM_MENU_MAIN: SystemMenuItem[] = [
  { id: 'lockscreen', label: 'Lockscreen', icon: 'lock' },
  { id: 'switch', label: 'Switch User', icon: 'users' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

export const SYSTEM_MENU_SESSION: SystemMenuItem[] = [
  { id: 'logout', label: 'Logout', icon: 'logout' },
  { id: 'shutdown', label: 'Shutdown', icon: 'power', danger: true },
];

// Window chrome geometry config (resize handle compass set).
export const RESIZE_HANDLES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const;
