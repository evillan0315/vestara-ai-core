/**
 * VES-UI-B3: Button Component
 *
 * Domain-independent button component with variants, sizes, and states.
 * Uses CSS custom properties from @vestara/ui-tokens.
 *
 * Architecture Traceability:
 *   VES-UI-B: Core UI Primitives (phases 3-5)
 *   @see docs/blueprint/VESTARA-SHARED-UI-PLATFORM.md VES-UI-005
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from 'react';

// ─── Types ─────────────────────────────────────────────────────

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Button variant */
  variant?: ButtonVariant;

  /** Button size */
  size?: ButtonSize;

  /** Show loading state */
  loading?: boolean;

  /** Icon before label */
  leftIcon?: ReactNode;

  /** Icon after label */
  rightIcon?: ReactNode;

  /** Full width button */
  fullWidth?: boolean;
}

// ─── Styles ────────────────────────────────────────────────────

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary: `
    bg-[var(--vestara-accent-primary)]
    text-[var(--vestara-surface-canvas)]
    hover:bg-[var(--vestara-accent-secondary)]
    active:bg-[var(--vestara-accent-primary)]
    shadow-sm
  `,
  secondary: `
    bg-transparent
    border border-[var(--vestara-border-default)]
    text-[var(--vestara-text-primary)]
    hover:bg-[var(--vestara-surface-interactive)]
    hover:border-[var(--vestara-border-strong)]
    active:bg-[var(--vestara-surface-panel-raised)]
  `,
  ghost: `
    bg-transparent
    text-[var(--vestara-text-secondary)]
    hover:bg-[var(--vestara-surface-interactive)]
    hover:text-[var(--vestara-text-primary)]
    active:bg-[var(--vestara-surface-panel-raised)]
  `,
  danger: `
    bg-[var(--vestara-status-error)]
    text-white
    hover:bg-[var(--vestara-status-error)]/90
    active:bg-[var(--vestara-status-error)]/80
  `,
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-11 px-5 text-base gap-2.5',
};

// ─── Component ─────────────────────────────────────────────────

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    leftIcon,
    rightIcon,
    fullWidth = false,
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
          inline-flex items-center justify-center
          rounded-lg font-medium
          transition-all duration-150
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-border-focus)] focus-visible:ring-offset-2
          disabled:opacity-50 disabled:cursor-not-allowed
          ${VARIANT_STYLES[variant]}
          ${SIZE_STYLES[size]}
          ${fullWidth ? 'w-full' : ''}
          ${className}
        `}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ) : leftIcon ? (
        <span className="shrink-0">{leftIcon}</span>
      ) : null}

      {children && <span>{children}</span>}

      {rightIcon && !loading && <span className="shrink-0">{rightIcon}</span>}
    </button>
  );
});
