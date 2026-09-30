/**
 * VES-UI-B7: Tooltip Component (AR-TOOLTIP-001)
 *
 * Reusable hover/focus tooltip for the Vestara UI Platform. Background is
 * the canonical accent overlay (`--vestara-accent-overlay`); every visual
 * value maps to a Vestara token with Tailwind as the renderer only.
 *
 * Accessibility: the panel carries `role="tooltip"` and the trigger is
 * linked via `aria-describedby` while visible. Keyboard users get the same
 * content on focus; Escape dismisses.
 *
 * Architecture Traceability:
 *   VES-UI-B: Core UI Primitives
 */

import { type ReactNode, useEffect, useId, useRef, useState } from 'react';

// ─── Types ─────────────────────────────────────────────────────

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  /** Tooltip body. Long strings are capped (see maxLength). */
  content: ReactNode;
  /** Trigger element the tooltip annotates. */
  children: ReactNode;
  /** Panel side relative to the trigger. Defaults to 'top'. */
  placement?: TooltipPlacement;
  /** When true the panel never opens. Defaults to false. */
  disabled?: boolean;
  /** String-content cap in characters (ellipsis appended). Defaults to 600. */
  maxLength?: number;
  /** Additional classes for the trigger wrapper. */
  className?: string;
}

const OPEN_DELAY_MS = 200;

const PLACEMENT_CLASS: Record<TooltipPlacement, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-[var(--vestara-spacing-element)]',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-[var(--vestara-spacing-element)]',
  left: 'right-full top-1/2 -translate-y-1/2 mr-[var(--vestara-spacing-element)]',
  right: 'left-full top-1/2 -translate-y-1/2 ml-[var(--vestara-spacing-element)]',
};

// ─── Component ─────────────────────────────────────────────────

export function Tooltip({
  content,
  children,
  placement = 'top',
  disabled = false,
  maxLength = 600,
  className = '',
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const openTimer = useRef<number | null>(null);
  const panelId = useId();

  const cancelPending = () => {
    if (openTimer.current !== null) {
      window.clearTimeout(openTimer.current);
      openTimer.current = null;
    }
  };

  useEffect(
    () => () => {
      if (openTimer.current !== null) {
        window.clearTimeout(openTimer.current);
        openTimer.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const requestOpen = () => {
    if (disabled) return;
    cancelPending();
    openTimer.current = window.setTimeout(() => setOpen(true), OPEN_DELAY_MS);
  };

  const close = () => {
    cancelPending();
    setOpen(false);
  };

  const visible = open && !disabled;
  const body = typeof content === 'string' && content.length > maxLength ? `${content.slice(0, maxLength)}…` : content;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover/focus bridge to the child trigger, which owns interactivity; Escape is handled at document level while open.
    <span
      className={`relative inline-flex min-w-0 ${className}`}
      onMouseEnter={requestOpen}
      onMouseLeave={close}
      onFocus={requestOpen}
      onBlur={close}
      aria-describedby={visible ? panelId : undefined}
    >
      {children}
      {visible && (
        <span
          id={panelId}
          role="tooltip"
          className={`pointer-events-none absolute z-[var(--vestara-z-index-tooltip)] max-w-72 break-words whitespace-pre-line rounded-[var(--vestara-radius)] border border-[var(--vestara-accent-border-active)] bg-[var(--vestara-accent-overlay)] px-[var(--vestara-spacing-element)] py-1 text-[var(--vestara-text-primary)] text-[length:var(--vestara-font-size-xs)] shadow-[var(--vestara-elevation-lg)] ${PLACEMENT_CLASS[placement]}`}
        >
          {body}
        </span>
      )}
    </span>
  );
}
