/**
 * VES-UI-001 T4: BootScreen
 *
 * Boot + shutdown splash promoted from the v2 prototype
 * (`assets/templates/html/v2/start/workspace-ui-v2/src/components/BootScreen.tsx`).
 * Progress + log stream render from `desktopShellBootLogsFixture` (never
 * hardcoded arrays in JSX); the `pulseGlow` keyframes live in governed CSS
 * (`.ds-boot-logo` in `desktop-shell.tokens.css`, plan G8) instead of an
 * inline `<style>` block.
 *
 * Sanitized on promotion (plan G11): no version strings — the status pill
 * carries the workspace id from `desktopShellWorkspaceFixture`.
 * Brand mark is the theme-aware `VestaraMark` (never `<img src>`); the
 * backdrop is `StartupWallpaper` with the `boot` treatment (10% opacity,
 * 20px blur, token scrim).
 *
 * Architecture Traceability:
 *   VES-UI-001: Workspace UI v2 Desktop Shell (T4 Boot + Login + state machine)
 *   @see docs/plans/VES-UI-001-workspace-ui-v2-desktop-shell-plan.md §5
 */

import { useEffect, useState } from 'react';
import { VestaraMark } from '../../components/branding/VestaraMark';
import { StartupWallpaper } from '../startup/components/StartupWallpaper';
import {
  desktopShellBootLogsFixture,
  desktopShellWorkspaceFixture,
} from './desktop-shell.fixtures';
import './desktop-shell.tokens.css';

/** Progress tick interval (ms) — mirrors the prototype 100ms cadence. */
export const BOOT_TICK_MS = 100;

/** Ticks to reach 100% (prototype `100 / 28` per tick). */
export const BOOT_TICKS = 28;

/** Log-line reveal interval (ms) — mirrors the prototype 260ms cadence. */
export const BOOT_LOG_MS = 260;

/** Boot auto-completion delay (ms) — mirrors the prototype 3000ms. */
export const BOOT_DONE_MS = 3000;

/** Shutdown auto-completion delay (ms) — mirrors the prototype 1800ms. */
export const SHUTDOWN_DONE_MS = 1800;

export interface BootScreenProps {
  readonly onDone: () => void;
  readonly shutting?: boolean;
}

export function BootScreen({ onDone, shutting = false }: BootScreenProps) {
  const [progress, setProgress] = useState(shutting ? 100 : 0);
  const [logIdx, setLogIdx] = useState(0);

  useEffect(() => {
    if (shutting) {
      const done = window.setTimeout(onDone, SHUTDOWN_DONE_MS);
      return () => window.clearTimeout(done);
    }
    const progressInt = window.setInterval(
      () => setProgress((prev) => Math.min(100, prev + 100 / BOOT_TICKS)),
      BOOT_TICK_MS,
    );
    const logInt = window.setInterval(
      () => setLogIdx((prev) => Math.min(desktopShellBootLogsFixture.length, prev + 1)),
      BOOT_LOG_MS,
    );
    const done = window.setTimeout(onDone, BOOT_DONE_MS);
    return () => {
      window.clearInterval(progressInt);
      window.clearInterval(logInt);
      window.clearTimeout(done);
    };
  }, [onDone, shutting]);

  const percent = Math.round(progress);

  return (
    <div className="absolute inset-0 flex h-full w-full flex-col items-center justify-center overflow-hidden bg-[var(--ds-canvas-bg)]">
      <StartupWallpaper treatment="boot" />
      <div aria-hidden="true" className="absolute inset-0 bg-[var(--ds-canvas-bg)] opacity-40" />
      {shutting ? (
        <div className="relative z-10 flex flex-col items-center gap-6">
          <div
            role="status"
            aria-label="Shutting down"
            className="h-10 w-10 rounded-full border-2 border-[var(--ds-border)] border-t-[var(--ds-accent)] motion-safe:animate-spin"
          />
          <div className="font-mono text-[length:var(--vestara-font-size-xs)] tracking-[0.22em] text-[var(--ds-text-muted)]">
            SHUTTING DOWN SHELL OS
          </div>
        </div>
      ) : (
        <div className="relative z-10 flex flex-col items-center">
          <div className="ds-boot-logo motion-reduce:animate-none">
            <VestaraMark size={120} />
          </div>
          <div className="mt-6 flex flex-col items-center">
            <div className="text-[length:var(--vestara-font-size-display)] leading-none tracking-[-0.02em] text-[var(--ds-text)] font-[family-name:var(--ds-font-serif)]">
              VESTARA
            </div>
            <div className="mt-1 font-mono text-[length:var(--vestara-font-size-xs)] tracking-[0.22em] text-[var(--ds-text-muted)]">
              SHELL OS
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-full border border-[var(--ds-border)] bg-[var(--ds-surface-panel)] px-2.5 py-1">
              <div aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--ds-accent)]" />
              <span className="font-mono text-[length:var(--vestara-font-size-xs)] tracking-wide text-[var(--ds-text-secondary)]">
                {desktopShellWorkspaceFixture}
              </span>
            </div>
          </div>
          <div role="log" aria-live="polite" aria-label="Boot log" className="mt-10 flex w-[280px] flex-col gap-1.5">
            {desktopShellBootLogsFixture.slice(0, logIdx).map((line, index) => (
              <div key={index} className="flex gap-2 font-mono text-[length:var(--vestara-font-size-xs)]">
                <span className="text-[var(--ds-accent)]">{line.slice(0, 6)}</span>
                <span className="text-[var(--ds-text-secondary)] opacity-80">{line.slice(6)}</span>
              </div>
            ))}
          </div>
          <div
            role="progressbar"
            aria-label="Boot progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="mt-8 h-[2px] w-[240px] overflow-hidden rounded-full bg-[var(--ds-surface-panel)]"
          >
            <div className="ds-boot-bar-fill h-full transition-all duration-100 ease-linear" style={{ width: `${percent}%` }} />
          </div>
          <div className="mt-2 font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-muted)]">
            {percent}% INITIALIZED
          </div>
        </div>
      )}
    </div>
  );
}
