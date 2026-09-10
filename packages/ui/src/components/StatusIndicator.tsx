/**
 * VES-UI-B6: StatusIndicator Component
 *
 * Domain-independent status lamp/indicator with semantic variants.
 * Replaces inline Tailwind status dots used across Activity Room
 * (.ar-lamp) and Floating Assistant (bg-emerald-400, etc.).
 *
 * Architecture Traceability:
 *   VES-UI-B: Core UI Primitives
 */

import { forwardRef, type HTMLAttributes } from 'react';

// ─── Types ─────────────────────────────────────────────────────

export type StatusVariant = 'live' | 'warn' | 'error' | 'idle' | 'off';
export type StatusSize = 'xs' | 'sm' | 'md';

export interface StatusIndicatorProps extends HTMLAttributes<HTMLSpanElement> {
  /** Semantic status variant */
  variant?: StatusVariant;

  /** Size of the indicator */
  size?: StatusSize;

  /** Pulse animation for live/active states */
  pulse?: boolean;

  /** Accessible label (screen readers) */
  ariaLabel?: string;
}

// ─── Styles ────────────────────────────────────────────────────

const VARIANT_COLORS: Record<StatusVariant, string> = {
  live: 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]',
  warn: 'bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.7)]',
  error: 'bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.7)]',
  idle: 'bg-zinc-500',
  off: 'bg-zinc-700',
};

const SIZE_STYLES: Record<StatusSize, string> = {
  xs: 'h-1.5 w-1.5',
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
};

// ─── Component ─────────────────────────────────────────────────

export const StatusIndicator = forwardRef<HTMLSpanElement, StatusIndicatorProps>(function StatusIndicator(
  { variant = 'idle', size = 'sm', pulse, className = '', ariaLabel, ...props },
  ref,
) {
  const shouldPulse = pulse ?? (variant === 'live' || variant === 'warn');

  return (
    <span
      ref={ref}
      role="img"
      aria-label={ariaLabel ?? variant}
      className={`
          inline-block rounded-full shrink-0
          ${VARIANT_COLORS[variant]}
          ${SIZE_STYLES[size]}
          ${shouldPulse ? 'motion-reduce:animate-none animate-pulse' : ''}
          ${className}
        `}
      {...props}
    />
  );
});
