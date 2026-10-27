/**
 * U2 — Tauri window-lifecycle boot/shutdown bridge (workspace-ui-v2).
 *
 * Canonical vocabulary shared with `@vestara/boot-runtime` (`SHELL_PHASES`,
 * `WINDOW_LIFECYCLE_EVENTS`). This module is intentionally dependency-free
 * so the standalone Vite app + vitest can prove the mapping without driving
 * a native WebView or importing the monorepo runtime.
 *
 * Mapping (Tauri v2 `WindowEvent` projection):
 * - `close-requested` (CloseRequested) → `shutdown`
 * - `minimized` (Minimized) → `locked` (session parks on the lock overlay)
 * - `focused` (Focused(true)) → `desktop`
 *
 * The host power cycle closes the loop: `shutdown` → `boot`.
 * Overlays resolve forward: `locked`/`switch` → `desktop`.
 *
 * Architecture Traceability:
 *   U2: window-lifecycle boot/shutdown bridge
 */

import type { LoginMode, Phase } from './types';

export const SHELL_PHASES = ['boot', 'login', 'desktop', 'shutdown', 'locked', 'switch'] as const;

export type ShellPhase = (typeof SHELL_PHASES)[number];

export const WINDOW_LIFECYCLE_EVENTS = ['close-requested', 'minimized', 'focused'] as const;

export type WindowLifecycleEvent = (typeof WINDOW_LIFECYCLE_EVENTS)[number];

/**
 * Map a Tauri window lifecycle event onto the shell phase it requests.
 * Stateless 1:1 vocabulary mapping — hosts that need current-phase guards
 * layer the App reducer on top (lock applies from desktop only).
 */
export function shellPhaseForWindowEvent(event: WindowLifecycleEvent): ShellPhase {
  switch (event) {
    case 'close-requested':
      return 'shutdown';
    case 'minimized':
      return 'locked';
    case 'focused':
      return 'desktop';
  }
}

/**
 * Map a shell phase onto the window event the host should emit.
 * Returns `null` for phases with no window action (`boot`/`login` are
 * pre-desktop; `switch` is a login-mode overlay resolved in the UI).
 */
export function windowEventForShellPhase(phase: ShellPhase): WindowLifecycleEvent | null {
  switch (phase) {
    case 'shutdown':
      return 'close-requested';
    case 'locked':
      return 'minimized';
    case 'desktop':
      return 'focused';
    case 'boot':
    case 'login':
    case 'switch':
      return null;
  }
}

/**
 * Advance the shell lifecycle one step. `shutdown` returns to `boot` so
 * the next launch re-enters boot. Overlays resolve forward
 * (`locked`/`switch` → `desktop`).
 */
export function nextShellPhase(phase: ShellPhase): ShellPhase {
  switch (phase) {
    case 'boot':
      return 'login';
    case 'login':
      return 'desktop';
    case 'desktop':
      return 'shutdown';
    case 'shutdown':
      return 'boot';
    case 'locked':
      return 'desktop';
    case 'switch':
      return 'desktop';
  }
}

/** Canonical shell phase for the local App state (`Phase` + `LoginMode`). */
export function shellPhaseForAppState(phase: Phase, loginMode: LoginMode): ShellPhase {
  if (phase === 'login' && loginMode === 'locked') return 'locked';
  if (phase === 'login' && loginMode === 'switch') return 'switch';
  return phase;
}

/** Split a canonical shell phase back into App state (`Phase` + `LoginMode`). */
export function appStateForShellPhase(phase: ShellPhase): { phase: Phase; loginMode: LoginMode } {
  switch (phase) {
    case 'locked':
      return { phase: 'login', loginMode: 'locked' };
    case 'switch':
      return { phase: 'login', loginMode: 'switch' };
    case 'boot':
      return { phase: 'boot', loginMode: 'default' };
    case 'login':
      return { phase: 'login', loginMode: 'default' };
    case 'desktop':
      return { phase: 'desktop', loginMode: 'default' };
    case 'shutdown':
      return { phase: 'shutdown', loginMode: 'default' };
  }
}

/**
 * Best-effort browser fullscreen on desktop entry. The Tauri shell launches
 * fullscreen natively (`tauri.conf.json`); this covers plain-browser runs.
 * Never throws — browsers reject without a user gesture and jsdom lacks the
 * API entirely.
 */
export function requestShellFullscreen(): void {
  try {
    if (typeof document === 'undefined' || document.fullscreenElement) return;
    const request = (document.documentElement as HTMLElement & { requestFullscreen?: () => Promise<void> })
      .requestFullscreen;
    if (typeof request !== 'function') return;
    const result = request.call(document.documentElement);
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch {
    // Fullscreen is decorative — the shell works windowed.
  }
}
