/**
 * VES-UI-B8: Pill Component
 *
 * Domain-independent capsule/pill button with gold variant used by
 * Activity Room (.ar-capsule) and assistant permission buttons.
 * Supports hover glow, disabled state, and active scale.
 *
 * Architecture Traceability:
 *   VES-UI-B: Core UI Primitives
 */

import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from 'react';

// ─── Types ─────────────────────────────────────────────────────

export type PillVariant = 'default' | 'gold' | 'danger' | 'success';
export type PillSize = 'sm' | 'md' | 'lg';

export interface PillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Pill variant */
  variant?: PillVariant;

  /** Pill size */
  size?: PillSize;

  /** Icon before label */
  leftIcon?: ReactNode;

  /** Icon after label */
  rightIcon?: ReactNode;

  /** Loading state */
  loading?: boolean;
}

// ─── Styles ────────────────────────────────────────────────────

const VARIANT_STYLES: Record<PillVariant, string> = {
  default: `
    border border-zinc-700 bg-zinc-800/70 text-zinc-200
    hover:bg-zinc-700 hover:border-zinc-600
  `,
  gold: `
    bg-gradient-to-b from-amber-400 to-amber-500 text-zinc-950
    shadow-[0_4px_14px_-6px_rgba(245,158,11,0.7)]
    ring-1 ring-white/20
    hover:brightness-110
  `,
  danger: `
    border border-red-500/30 bg-red-500/10 text-red-300
    hover:bg-red-500/20
  `,
  success: `
    border border-emerald-500/30 bg-emerald-500/10 text-emerald-300
    hover:bg-emerald-500/20
  `,
};

const SIZE_STYLES: Record<PillSize, string> = {
  sm: 'px-2 py-0.5 text-[10px] rounded-md',
  md: 'px-2.5 py-1 text-[11px] rounded-lg',
  lg: 'px-3 py-1.5 text-xs rounded-xl',
};

// ─── Component ─────────────────────────────────────────────────

export const Pill = forwardRef<HTMLButtonElement, PillProps>(function Pill(
  {
    variant = 'default',
    size = 'md',
    leftIcon,
    rightIcon,
    loading = false,
    disabled,
    className = '',
    children,
    ...props
  },
  ref,
) {
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      disabled={isDisabled}
      className={`
          inline-flex items-center justify-center gap-1.5
          font-medium transition-all active:scale-95
          focus-visible:outline-2 focus-visible:outline-amber-500/60
          disabled:opacity-30 disabled:shadow-none disabled:cursor-not-allowed
          cursor-pointer
          ${VARIANT_STYLES[variant]}
          ${SIZE_STYLES[size]}
          ${className}
        `}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : leftIcon ? (
        <span className="shrink-0">{leftIcon}</span>
      ) : null}
      {children && <span>{children}</span>}
      {rightIcon && !loading && <span className="shrink-0">{rightIcon}</span>}
    </button>
  );
});
