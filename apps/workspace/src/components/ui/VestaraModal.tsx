/**
 * VestaraModal — global modal shell.
 *
 * Renders every dialog on the Vestara primary theme-token background so the
 * whole product shares one modal identity. The panel is a translucent
 * `--vestara-primary` gradient over the theme surface, framed by the primary
 * accent bar and `--vestara-accent-border`. Sizing/behavior classes are passed
 * through `className` (e.g. `max-w-md`, `max-h-[80vh] flex flex-col`).
 */

import type { ReactNode } from 'react';

interface VestaraModalProps {
  onClose: () => void;
  children: ReactNode;
  /** Sizing/behavior classes appended to the panel (default `max-w-md`). */
  className?: string;
  /** Render the primary accent bar along the top edge. Default true. */
  accentBar?: boolean;
}

export function VestaraModal({ onClose, children, className = 'max-w-md', accentBar = true }: VestaraModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={`relative w-full overflow-hidden rounded-2xl border border-(--vestara-accent-border) shadow-2xl ${className}`}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
        style={{
          background:
            'linear-gradient(165deg, color-mix(in srgb, var(--vestara-primary) 14%, transparent), transparent 55%), var(--color-zinc-950)',
        }}
      >
        {accentBar && <div className="h-1 bg-[linear-gradient(90deg,var(--vestara-primary),var(--vestara-primary-muted))]" />}
        {children}
      </div>
    </div>
  );
}
