/**
 * VES-UI-001 T0: Desktop Shell Scaffold Guards
 *
 * Locks the Phase 0 acceptance boundary:
 * - No hex literals in the token map (governance NO-HARDCODE).
 * - No version strings in boot logs (G11).
 * - Deterministic window stack (G7 — no `Math.random` placement).
 * - Every `WinType` has a title + a MUI icon name (T0.3 — no lucide).
 */

import { describe, expect, it } from 'vitest';
import {
  DESKTOP_SHELL_ACCENT,
  DESKTOP_SHELL_TOKENS,
} from './tokens';
import {
  desktopShellBootLogsFixture,
  desktopShellPackageTitles,
  desktopShellPackagesFixture,
  desktopShellUserFixture,
  desktopShellWindowsFixture,
  desktopShellWorkspaceFixture,
} from './desktop-shell.fixtures';
import type { WinType } from './types';

const WIN_TYPES: readonly WinType[] = [
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

describe('desktop-shell token map', () => {
  it('references scoped vars only — no hex literals', () => {
    for (const value of Object.values(DESKTOP_SHELL_TOKENS)) {
      expect(value).toMatch(/^var\(--ds-[a-z-]+\)$/);
      expect(value).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    }
  });

  it('binds the shell accent palette (prototype #2de8c3)', () => {
    expect(DESKTOP_SHELL_ACCENT.hex).toBe('#2de8c3');
    expect(DESKTOP_SHELL_ACCENT.label).toBe('Vestara Shell');
  });
});

describe('desktop-shell fixtures', () => {
  it('covers every WinType with a title and a package entry', () => {
    for (const type of WIN_TYPES) {
      expect(desktopShellPackageTitles[type]).toBeTruthy();
    }
    expect(desktopShellPackagesFixture.map((p) => p.id).sort()).toEqual([...WIN_TYPES].sort());
  });

  it('uses MUI icon names only — no lucide references', () => {
    for (const pkg of desktopShellPackagesFixture) {
      expect(pkg.icon).toBeTruthy();
      expect(pkg.icon.toLowerCase()).not.toContain('lucide');
      expect(pkg.defaultSize.w).toBeGreaterThan(0);
      expect(pkg.defaultSize.h).toBeGreaterThan(0);
    }
  });

  it('ships a deterministic window stack with unique ids and z-order', () => {
    const ids = desktopShellWindowsFixture.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    const z = desktopShellWindowsFixture.map((w) => w.z);
    expect([...z].sort((a, b) => a - b)).toEqual(z);
    for (const win of desktopShellWindowsFixture) {
      expect(Number.isFinite(win.x)).toBe(true);
      expect(Number.isFinite(win.y)).toBe(true);
    }
  });

  it('keeps boot logs version-free (G11) and deterministic (G7)', () => {
    expect(desktopShellBootLogsFixture.length).toBeGreaterThan(0);
    for (const line of desktopShellBootLogsFixture) {
      expect(line).not.toMatch(/v?\d+\.\d+\.\d+/);
      expect(line).not.toMatch(/FINAL/i);
    }
  });

  it('exposes a workspace id and a placeholder operator (no real identity)', () => {
    expect(desktopShellWorkspaceFixture).toBe('vestara-platform');
    expect(desktopShellUserFixture.id).toBeTruthy();
    expect(desktopShellUserFixture.displayName).toBeTruthy();
    expect(desktopShellUserFixture.initials).toBeTruthy();
  });
});
