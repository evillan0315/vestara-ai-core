/**
 * U1 — Tauri bundle config regression guard.
 *
 * Pins the validated-shell alignment of `src-tauri/tauri.conf.json`:
 * window geometry (fits the default window stack), icon set (every entry
 * resolves to a real file), bundle targets, CSP, and version handling.
 *
 * Scope notes (plan G11 + U1 turn instruction):
 * - CSP is a hardened allowlist (see EXPECTED_CSP below). The webview serves
 *   fully local content (bundled `frontendDist`, dev on localhost:5173,
 *   API/WS on loopback 127.0.0.1:3001). `style-src` keeps `'unsafe-inline'`
 *   because the shell positions windows through inline style attributes
 *   (`VestaraWindow` sets left/top/width/height via style props) and React
 *   sets inline styles pervasively; `connect-src` covers the API/WS bridge,
 *   Vite HMR, and Tauri IPC (`ipc:`, `http://ipc.localhost`). Any CSP change
 *   must update EXPECTED_CSP here plus boot verification (window placement,
 *   API/WS bridge, dev HMR, prod bundle, zero CSP violations).
 * - Bundle version is an independent literal kept in exactly two places
 *   (`tauri.conf.json` + `Cargo.toml`, asserted equal here). It is
 *   deliberately NOT synced from `@vestara/workspace-ui` nor the v2
 *   prototype: no version strings are imported anywhere — `DesktopTopBar`
 *   renders its pill only from an explicit opt-in `version` prop and all
 *   shell fixtures/boot logs are version-free (see `DesktopTopBar.test.tsx`,
 *   `desktop-shell.fixtures.test.ts`).
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { desktopShellWindowsFixture } from '../src/features/desktop-shell/desktop-shell.fixtures';

const here = dirname(fileURLToPath(import.meta.url));
const tauriDir = resolve(here, '../src-tauri');

interface TauriWindowConfig {
  readonly label?: string;
  readonly title?: string;
  readonly width?: number;
  readonly height?: number;
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly center?: boolean;
  readonly resizable?: boolean;
  readonly fullscreen?: boolean;
}

interface TauriConfig {
  readonly productName?: string;
  readonly version?: string;
  readonly identifier?: string;
  readonly build?: { readonly devUrl?: string; readonly frontendDist?: string };
  readonly app?: { readonly security?: { readonly csp?: string | null }; readonly windows?: readonly TauriWindowConfig[] };
  readonly bundle?: { readonly targets?: string | readonly string[]; readonly icon?: readonly string[] };
}

function readTauriConfig(): TauriConfig {
  return JSON.parse(readFileSync(resolve(tauriDir, 'tauri.conf.json'), 'utf8')) as TauriConfig;
}

function readCargoVersion(): string {
  const cargo = readFileSync(resolve(tauriDir, 'Cargo.toml'), 'utf8');
  const match = /^version\s*=\s*"([^"]+)"/m.exec(cargo);
  if (!match) throw new Error('src-tauri/Cargo.toml declares no package version');
  return match[1];
}

const EXPECTED_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' asset: data: blob:; font-src 'self' asset: data:; worker-src 'self' blob:; media-src 'self' blob: data:; connect-src 'self' ipc: http://ipc.localhost http://127.0.0.1:3001 ws://127.0.0.1:3001 http://localhost:5173 ws://localhost:5173; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";

describe('Tauri bundle config (U1 validated-shell alignment)', () => {
  it('opens a single labelled main window with the validated shell geometry', () => {
    const conf = readTauriConfig();
    const windows = conf.app?.windows ?? [];
    expect(windows).toHaveLength(1);
    const main = windows[0];
    expect(main.label).toBe('main');
    expect(main.title).toBe('Vestara Workspace');
    expect(main.width).toBe(1280);
    expect(main.height).toBe(800);
    expect(main.minWidth).toBe(960);
    expect(main.minHeight).toBe(600);
    expect(main.center).toBe(true);
    expect(main.resizable).toBe(true);
    expect(main.fullscreen).toBe(false);
  });

  it('fits the default validated window stack inside the outer window', () => {
    const main = readTauriConfig().app?.windows?.[0];
    expect(main?.width).toBe(1280);
    expect(main?.height).toBe(800);
    expect(desktopShellWindowsFixture.length).toBeGreaterThan(0);
    for (const win of desktopShellWindowsFixture) {
      expect(win.x + win.w).toBeLessThanOrEqual(1280);
      expect(win.y + win.h).toBeLessThanOrEqual(800);
      expect(win.w).toBeGreaterThanOrEqual(320);
      expect(win.h).toBeGreaterThanOrEqual(220);
    }
  });

  it('resolves every bundled icon to a real non-empty file', () => {
    const icons = readTauriConfig().bundle?.icon ?? [];
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) {
      const path = resolve(tauriDir, icon);
      expect(existsSync(path), `missing bundle icon: ${icon}`).toBe(true);
      expect(statSync(path).size).toBeGreaterThan(0);
    }
  });

  it('builds every bundle target so CI and host installers stay covered', () => {
    expect(readTauriConfig().bundle?.targets).toBe('all');
  });

  it('serves the built workspace UI with the dev URL on the Vite port', () => {
    const conf = readTauriConfig();
    expect(conf.build?.frontendDist).toBe('../dist');
    expect(conf.build?.devUrl).toBe('http://localhost:5173');
  });

  it('pins the hardened CSP allowlist (local webview + loopback API/WS + HMR + IPC)', () => {
    expect(readTauriConfig().app?.security?.csp).toBe(EXPECTED_CSP);
  });

  it('keeps one independent bundle version (G11: no imported version strings)', () => {
    const conf = readTauriConfig();
    expect(typeof conf.version).toBe('string');
    expect(conf.version).toBe(readCargoVersion());
  });
});
