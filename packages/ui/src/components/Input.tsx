/**
 * VES-UI-B4: Input Component
 *
 * Domain-independent input component with label, hint, and error states.
 * Uses CSS custom properties from @vestara/ui-tokens.
 *
 * Architecture Traceability:
 *   VES-UI-B: Core UI Primitives (phases 3-5)
 *   @see docs/blueprint/VESTARA-SHARED-UI-PLATFORM.md VES-UI-005
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

// ─── Types ─────────────────────────────────────────────────────

export type InputSize = 'sm' | 'md' | 'lg';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Input size */
  size?: InputSize;

  /** Label text */
  label?: string;

  /** Hint text below input */
  hint?: string;

  /** Error message */
  error?: string;

  /** Icon before input */
  leftIcon?: ReactNode;

  /** Icon after input */
  rightIcon?: ReactNode;

  /** Full width input */
  fullWidth?: boolean;
}

// ─── Styles ────────────────────────────────────────────────────

const SIZE_STYLES: Record<InputSize, string> = {
  sm: 'h-7 px-2.5 text-xs',
  md: 'h-9 px-3 text-sm',
  lg: 'h-11 px-4 text-base',
};

// ─── Component ─────────────────────────────────────────────────

export const Input = forwardRef<HTMLInputElement, InputProps>(
  function Input(
    {
      size = 'md',
      label,
      hint,
      error,
      leftIcon,
      rightIcon,
      fullWidth = false,
      className = '',
      id,
      ...props
    },
    ref,
  ) {
    const inputId = id || (label ? `input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);
    const hasError = !!error;

    return (
      <div className={`${fullWidth ? 'w-full' : ''}`}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-medium text-[var(--vestara-text-secondary)] mb-1"
          >
            {label}
          </label>
        )}

        <div className="relative">
          {leftIcon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--vestara-text-muted)]">
              {leftIcon}
            </span>
          )}

          <input
            ref={ref}
            id={inputId}
            className={`
              w-full rounded-lg
              bg-[var(--vestara-surface-panel)]
              border ${hasError ? 'border-[var(--vestara-status-error)]' : 'border-[var(--vestara-border-default)]'}
              text-[var(--vestara-text-primary)]
              placeholder:text-[var(--vestara-text-muted)]
              focus:outline-none focus:ring-2 focus:ring-[var(--vestara-border-focus)] focus:border-transparent
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors duration-150
              ${SIZE_STYLES[size]}
              ${leftIcon ? 'pl-9' : ''}
              ${rightIcon ? 'pr-9' : ''}
              ${className}
            `}
            aria-invalid={hasError || undefined}
            aria-describedby={hasError ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
            {...props}
          />

          {rightIcon && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--vestara-text-muted)]">
              {rightIcon}
            </span>
          )}
        </div>

        {hint && !hasError && (
          <p id={`${inputId}-hint`} className="mt-1 text-xs text-[var(--vestara-text-muted)]">
            {hint}
          </p>
        )}

        {hasError && (
          <p id={`${inputId}-error`} className="mt-1 text-xs text-[var(--vestara-status-error)]" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  },
);
