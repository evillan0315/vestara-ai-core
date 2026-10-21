import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WINDOWS,
  DESKTOP_ICONS,
  DOCK_TYPES,
  RESIZE_HANDLES,
  SHELL_USER,
  SYSTEM_MENU_MAIN,
  SYSTEM_MENU_SESSION,
  WINDOW_TITLES,
} from './desktop.fixtures';
import type { WinType } from './types';

const ALL_TYPES: WinType[] = [
  'workspace',
  'terminal',
  'marketplace',
  'files',
  'overview',
  'settings',
  'agent',
  'diagnostic',
  'activity',
];

describe('desktop fixtures', () => {
  it('seed windows carry unique ids', () => {
    const ids = DEFAULT_WINDOWS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('titles cover every window type', () => {
    for (const t of ALL_TYPES) expect(WINDOW_TITLES[t]).toBeTruthy();
  });

  it('dock order holds 8 known types', () => {
    expect(DOCK_TYPES).toHaveLength(8);
    for (const t of DOCK_TYPES) expect(ALL_TYPES).toContain(t);
  });

  it('desktop icons reference docked types', () => {
    expect(DESKTOP_ICONS.length).toBeGreaterThan(0);
    for (const icon of DESKTOP_ICONS) expect(DOCK_TYPES).toContain(icon.type);
  });

  it('resize compass holds 8 handles', () => {
    expect(RESIZE_HANDLES).toHaveLength(8);
  });

  it('shell user card is complete', () => {
    expect(SHELL_USER.initial).toBeTruthy();
    expect(SHELL_USER.name).toBeTruthy();
    expect(SHELL_USER.statusLong).toBeTruthy();
    expect(SHELL_USER.statusShort).toBeTruthy();
  });

  it('system menu groups expose stable action ids', () => {
    expect(SYSTEM_MENU_MAIN.map((i) => i.id)).toEqual(['lockscreen', 'switch', 'settings']);
    expect(SYSTEM_MENU_SESSION.map((i) => i.id)).toEqual(['logout', 'shutdown']);
    expect(SYSTEM_MENU_SESSION.find((i) => i.id === 'shutdown')?.danger).toBe(true);
  });
});
