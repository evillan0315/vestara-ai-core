/**
 * U2/U5 — shell bridge + window-lifecycle mapping guards (workspace-ui-v2).
 *
 * Proves the Tauri window-lifecycle bridge (`SHELL_PHASES` ↔
 * `WINDOW_LIFECYCLE_EVENTS`) plus the local App-state projection
 * (`Phase` + `LoginMode` ↔ `ShellPhase`).
 *
 * Architecture Traceability:
 *   U2: window-lifecycle boot/shutdown bridge
 */

/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import {
  appStateForShellPhase,
  nextShellPhase,
  SHELL_PHASES,
  shellPhaseForAppState,
  shellPhaseForWindowEvent,
  WINDOW_LIFECYCLE_EVENTS,
  windowEventForShellPhase,
} from './shell-bridge';

describe('SHELL_PHASES bridge vocabulary', () => {
  it('exposes exactly the six shell phases in contract order', () => {
    expect([...SHELL_PHASES]).toEqual(['boot', 'login', 'desktop', 'shutdown', 'locked', 'switch']);
  });
});

describe('WINDOW_LIFECYCLE_EVENTS bridge vocabulary (U2)', () => {
  it('exposes exactly the close/minimize/focus window lifecycle vocabulary', () => {
    expect([...WINDOW_LIFECYCLE_EVENTS]).toEqual(['close-requested', 'minimized', 'focused']);
  });

  it('maps window events onto shell phases 1:1', () => {
    expect(shellPhaseForWindowEvent('close-requested')).toBe('shutdown');
    expect(shellPhaseForWindowEvent('minimized')).toBe('locked');
    expect(shellPhaseForWindowEvent('focused')).toBe('desktop');
  });

  it('maps shell phases back onto window events (null where there is no window action)', () => {
    expect(windowEventForShellPhase('shutdown')).toBe('close-requested');
    expect(windowEventForShellPhase('locked')).toBe('minimized');
    expect(windowEventForShellPhase('desktop')).toBe('focused');
    expect(windowEventForShellPhase('boot')).toBeNull();
    expect(windowEventForShellPhase('login')).toBeNull();
    expect(windowEventForShellPhase('switch')).toBeNull();
  });

  it('round-trips event -> phase -> event for actionable phases', () => {
    for (const event of WINDOW_LIFECYCLE_EVENTS) {
      const phase = shellPhaseForWindowEvent(event);
      expect(windowEventForShellPhase(phase)).toBe(event);
    }
  });
});

describe('nextShellPhase lifecycle (shutdown returns to boot)', () => {
  it('walks boot -> login -> desktop -> shutdown -> boot', () => {
    expect(nextShellPhase('boot')).toBe('login');
    expect(nextShellPhase('login')).toBe('desktop');
    expect(nextShellPhase('desktop')).toBe('shutdown');
    expect(nextShellPhase('shutdown')).toBe('boot');
  });

  it('resolves lock/switch overlays forward to desktop', () => {
    expect(nextShellPhase('locked')).toBe('desktop');
    expect(nextShellPhase('switch')).toBe('desktop');
  });
});

describe('App-state projection (Phase + LoginMode)', () => {
  it('maps local phases straight through', () => {
    expect(shellPhaseForAppState('boot', 'default')).toBe('boot');
    expect(shellPhaseForAppState('login', 'default')).toBe('login');
    expect(shellPhaseForAppState('desktop', 'default')).toBe('desktop');
    expect(shellPhaseForAppState('shutdown', 'default')).toBe('shutdown');
  });

  it('maps login overlays to locked/switch shell phases', () => {
    expect(shellPhaseForAppState('login', 'locked')).toBe('locked');
    expect(shellPhaseForAppState('login', 'switch')).toBe('switch');
  });

  it('round-trips shell phase -> app state -> shell phase', () => {
    expect(appStateForShellPhase('locked')).toEqual({ phase: 'login', loginMode: 'locked' });
    expect(appStateForShellPhase('switch')).toEqual({ phase: 'login', loginMode: 'switch' });
    expect(appStateForShellPhase('desktop')).toEqual({ phase: 'desktop', loginMode: 'default' });
    expect(shellPhaseForAppState('login', 'locked')).toBe('locked');
  });
});
