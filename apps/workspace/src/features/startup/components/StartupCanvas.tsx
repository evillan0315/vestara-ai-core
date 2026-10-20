/**
 * VOS-STARTUP-001 P1: Startup Canvas
 *
 * Full-viewport composition shell. Edge-to-edge canvas with corner-anchored
 * metadata; brand lockup and readiness card stay centered as a group.
 *
 * VES-UI-001 T1/G12: the wallpaper is a lazy `<picture>` element
 * (`StartupWallpaper`: AVIF → WebP → PNG, single optimized size) layered
 * behind the token scrim (`.st-canvas-artwork`), instead of an eager CSS
 * `background-image` PNG fetch.
 */

import type { ReactNode } from 'react';
import { StartupWallpaper } from './StartupWallpaper';

export function StartupCanvas({ children }: { children: ReactNode }) {
  return (
    <div className="st-canvas-artwork relative min-h-screen w-full overflow-hidden text-[var(--st-title)]">
      <StartupWallpaper />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[var(--vestara-page-max-width)] flex-col px-[var(--vestara-spacing-page)] py-[var(--vestara-spacing-section)]">
        {children}
      </div>
    </div>
  );
}
