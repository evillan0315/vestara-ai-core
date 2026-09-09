/**
 * VES-UI-B5: Badge Component
 *
 * Domain-independent badge component for status and labels.
 * Uses CSS custom properties from @vestara/ui-tokens.
 *
 * Architecture Traceability:
 *   VES-UI-B: Core UI Primitives (phases 3-5)
 *   @see docs/blueprint/VESTARA-SHARED-UI-PLATFORM.md VES-UI-005
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import { type ReactNode } from 'react';

// ─── Types ─────────────────────────────────────────────────────

export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';
export type BadgeSize = 'sm' | 'md' | 'lg';

export interface BadgeProps {
  /** Badge variant */
  variant?: BadgeVariant;

  /** Badge size */
  size?: BadgeSize;

  /** Badge content */
  children: ReactNode;

  /** Optional icon */
  icon?: ReactNode;

  /** Show dot indicator */
  dot?: boolean;

  /** Custom class name */
  className?: string;
}

// ─── Styles ────────────────────────────────────────────────────

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  default: 'bg-[var(--vestara-surface-panel-raised)] text-[var(--vestara-text-secondary)] border-[var(--vestara-border-subtle)]',
  success: 'bg-[var(--vestara-status-success)]/15 text-[var(--vestara-status-success)] border-[var(--vestara-status-success)]/30',
  warning: 'bg-[var(--vestara-status-warning)]/15 text-[var(--vestara-status-warning)] border-[var(--vestara-status-warning)]/30',
  error: 'bg-[var(--vestara-status-error)]/15 text-[var(--vestara-status-error)] border-[var(--vestara-status-error)]/30',
  info: 'bg-[var(--vestara-status-info)]/15 text-[var(--vestara-status-info)] border-[var(--vestara-status-info)]/30',
};

const SIZE_STYLES: Record<BadgeSize, string> = {
  sm: 'px-1.5 py-0.5 text-[10px]',
  md: 'px-2 py-0.5 text-xs',
  lg: 'px-2.5 py-1 text-sm',
};

const DOT_COLORS: Record<BadgeVariant, string> = {
  default: 'bg-[var(--vestara-text-muted)]',
  success: 'bg-[var(--vestara-status-success)]',
  warning: 'bg-[var(--vestara-status-warning)]',
  error: 'bg-[var(--vestara-status-error)]',
  info: 'bg-[var(--vestara-status-info)]',
};

// ─── Component ─────────────────────────────────────────────────

export function Badge({
  variant = 'default',
  size = 'md',
  children,
  icon,
  dot = false,
  className = '',
}: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-1
        rounded-full font-medium
        border
        ${VARIANT_STYLES[variant]}
        ${SIZE_STYLES[size]}
        ${className}
      `}
    >
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full ${DOT_COLORS[variant]}`} />
      )}
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </span>
  );
}
