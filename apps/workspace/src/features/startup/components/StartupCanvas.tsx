/**
 * VOS-STARTUP-001 P1: Startup Canvas
 *
 * Full-viewport composition shell. Edge-to-edge canvas with corner-anchored
 * metadata; brand lockup and readiness card stay centered as a group.
 */

import type { ReactNode } from 'react';

export function StartupCanvas({ children }: { children: ReactNode }) {
  return (
    <div className="st-canvas-artwork min-h-screen w-full overflow-hidden text-[var(--st-title)]">
      <div className="mx-auto flex min-h-screen w-full max-w-[var(--vestara-spacing-24)] flex-col px-[var(--vestara-spacing-page)] py-[var(--vestara-spacing-section)]">
        {children}
      </div>
    </div>
  );
}
