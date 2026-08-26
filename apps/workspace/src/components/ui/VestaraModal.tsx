/**
 * VestaraModal — global modal shell.
 *
 * Renders every dialog on the Vestara primary theme-token background so the
 * whole product shares one modal identity. The panel is a translucent
 * `--vestara-primary` gradient over the theme surface, framed by the primary
 * accent bar and `--vestara-accent-border`. Sizing/behavior classes are passed
 * through `className` (e.g. `max-w-md`, `max-h-[80vh] flex flex-col`).
 */

import { useEffect, useRef, type ReactNode } from 'react';

interface VestaraModalProps {
  onClose: () => void;
  children: ReactNode;
  /** Sizing/behavior classes appended to the panel (default `max-w-md`). */
  className?: string;
  /** Render the primary accent bar along the top edge. Default true. */
  accentBar?: boolean;
  /** Accessible name for the dialog. */
  ariaLabel?: string;
}

export function VestaraModal({ onClose, children, className = 'max-w-md', accentBar = true, ariaLabel }: VestaraModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const focusable = panel?.querySelector<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    (focusable ?? panel)?.focus();

    return () => returnFocusRef.current?.focus();
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !panelRef.current) return;
    const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )];
    if (focusable.length === 0) {
      event.preventDefault();
      panelRef.current.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        className={`relative w-full overflow-hidden rounded-2xl border border-(--vestara-accent-border) shadow-2xl ${className}`}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
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
