/**
 * VES-UI-002 U2/U5: shell bridge + window-lifecycle mapping guards.
 *
 * Covers the v2 shell phase bridge in `@vestara/boot-runtime`
 * (`SHELL_PHASES` + `shellPhaseForBootStage`): the additive projection
 * that lets Tauri/host window-lifecycle code correlate host boot with the
 * shell `boot → login → desktop → shutdown` (+ `locked`/`switch`) state
 * machine without mutating boot behavior.
 *
 * U2 adds the window-lifecycle bridge (`WINDOW_LIFECYCLE_EVENTS` +
 * `shellPhaseForWindowEvent` / `windowEventForShellPhase` /
 * `nextShellPhase`): `close-requested → shutdown`, `minimized → locked`,
 * `focused → desktop`, with `shutdown → boot` closing the power cycle.
 *
 * Deep-link mapping (`teal://vestara-shell`, U3) has no on-disk
 * implementation (absent from `tauri.conf.json`/`Cargo.toml`/`src/*.rs`
 * as of 2026-10-21) — no tests exist for it by design; see the VES-UI-001
 * plan follow-up section.
 */

import { describe, expect, it } from 'vitest';
import type { BootStage, BootStateStatus } from '../src/index';
import {
  BOOT_STAGES,
  nextShellPhase,
  SHELL_PHASES,
  shellPhaseForBootStage,
  shellPhaseForWindowEvent,
  WINDOW_LIFECYCLE_EVENTS,
  windowEventForShellPhase,
} from '../src/index';

describe('SHELL_PHASES bridge vocabulary', () => {
  it('exposes exactly the six shell phases in contract order', () => {
    expect([...SHELL_PHASES]).toEqual(['boot', 'login', 'desktop', 'shutdown', 'locked', 'switch']);
  });
});

describe('BOOT_STAGES host contract unchanged', () => {
  it('keeps the eight OS-0 host boot stages in order (bridge is additive)', () => {
    expect([...BOOT_STAGES]).toEqual([
      'firmware-complete',
      'host-started',
      'storage-mounted',
      'identity-loaded',
      'services-started',
      'runtime-composed',
      'health-verified',
      'workspace-ready',
    ]);
  });
});

describe('shellPhaseForBootStage', () => {
  const midStages = BOOT_STAGES.filter((s) => s !== 'workspace-ready');

  it('maps every mid-boot stage while booting to the shell boot phase', () => {
    for (const stage of midStages) {
      expect(shellPhaseForBootStage(stage, 'booting')).toBe('boot');
    }
  });

  it('maps workspace-ready while booting to the shell login phase', () => {
    expect(shellPhaseForBootStage('workspace-ready', 'booting')).toBe('login');
  });

  it('maps any stage with ready status to the shell login phase', () => {
    const stages: BootStage[] = [...BOOT_STAGES, 'recovery'];
    for (const stage of stages) {
      if (stage === 'recovery') continue;
      expect(shellPhaseForBootStage(stage, 'ready')).toBe('login');
    }
  });

  it('maps the recovery stage to the shell boot phase regardless of status', () => {
    const statuses: BootStateStatus[] = ['booting', 'ready', 'recovery', 'failed'];
    for (const status of statuses) {
      expect(shellPhaseForBootStage('recovery', status)).toBe('boot');
    }
  });

  it('maps recovery/failed status to the shell boot phase for every host stage', () => {
    for (const stage of BOOT_STAGES) {
      expect(shellPhaseForBootStage(stage, 'recovery')).toBe('boot');
      expect(shellPhaseForBootStage(stage, 'failed')).toBe('boot');
    }
  });
});

describe('WINDOW_LIFECYCLE_EVENTS bridge vocabulary (VES-UI-002 U2)', () => {
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

  it('a full power cycle from boot returns to boot', () => {
    let phase = SHELL_PHASES[0];
    for (let i = 0; i < 4; i += 1) phase = nextShellPhase(phase);
    expect(SHELL_PHASES[0]).toBe('boot');
    expect(phase).toBe('boot');
  });
});
