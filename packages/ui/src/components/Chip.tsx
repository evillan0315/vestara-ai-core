/**
 * VES-UI-C8: Chip Component
 *
 * Domain-independent chip component for interactive selections and filters.
 * Uses CSS custom properties from @vestara/ui-tokens.
 *
 * Architecture Traceability:
 *   VES-UI-C: Data Display (phases 6-8)
 *   @see docs/blueprint/VESTARA-SHARED-UI-PLATFORM.md VES-UI-005
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import { type ReactNode } from 'react';

// ─── Types ─────────────────────────────────────────────────────

export type ChipVariant = 'default' | 'outlined';
export type ChipSize = 'sm' | 'md' | 'lg';

export interface ChipProps {
  /** Chip variant */
  variant?: ChipVariant;

  /** Chip size */
  size?: ChipSize;

  /** Whether chip is selected */
  selected?: boolean;

  /** Whether chip is disabled */
  disabled?: boolean;

  /** Chip content */
  children: ReactNode;

  /** Optional icon */
  icon?: ReactNode;

  /** Click handler */
  onClick?: () => void;

  /** Custom class name */
  className?: string;
}

// ─── Styles ────────────────────────────────────────────────────

const VARIANT_STYLES: Record<ChipVariant, { base: string; selected: string }> = {
  default: {
    base: 'bg-[var(--vestara-surface-panel-raised)] text-[var(--vestara-text-secondary)] border-[var(--vestara-border-subtle)]',
    selected: 'bg-[var(--vestara-accent-primary)]/20 text-[var(--vestara-accent-primary)] border-[var(--vestara-accent-primary)]',
  },
  outlined: {
    base: 'bg-transparent text-[var(--vestara-text-secondary)] border-[var(--vestara-border-default)]',
    selected: 'bg-[var(--vestara-accent-primary)]/10 text-[var(--vestara-accent-primary)] border-[var(--vestara-accent-primary)]',
  },
};

const SIZE_STYLES: Record<ChipSize, string> = {
  sm: 'h-6 px-2 text-[10px]',
  md: 'h-7 px-2.5 text-xs',
  lg: 'h-8 px-3 text-sm',
};

// ─── Component ─────────────────────────────────────────────────

export function Chip({
  variant = 'default',
  size = 'md',
  selected = false,
  disabled = false,
  children,
  icon,
  onClick,
  className = '',
}: ChipProps) {
  const variantStyle = selected ? VARIANT_STYLES[variant].selected : VARIANT_STYLES[variant].base;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`
        inline-flex items-center gap-1.5
        rounded-full font-medium
        border
        transition-all duration-150
        ${variantStyle}
        ${SIZE_STYLES[size]}
        ${onClick && !disabled ? 'cursor-pointer hover:opacity-80' : ''}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${selected ? 'ring-1 ring-[var(--vestara-accent-primary)]/20' : ''}
        ${className}
      `}
      aria-pressed={selected || undefined}
      aria-disabled={disabled || undefined}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </button>
  );
}
